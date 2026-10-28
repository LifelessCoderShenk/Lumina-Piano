import {
  Color,
  Group,
  ShaderMaterial,
  SkinnedMesh,
  Vector2,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Skeleton,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  createHandMotion,
  type AnatomicalKey,
  type AnatomicalMotion,
} from '../hands/anatomicalHandMotion.mjs'
import { planProjectHandPerformance } from '../hands/anatomicalPerformance'
import type { ProjectData } from '../midi/types'
import {
  buildTempoMap,
  tickToSeconds,
  type PrecomputedTempoMap,
} from '../tempo/tempoMap'
import type { GhostHandsLayout } from './GhostHandsLayer'
import {
  getBlackKeyWidth,
  getWhiteKeyWidth,
  isBlackKey,
  pitchToKeyX,
} from './pianoMath'

const KEYBOARD_METERS = 52 * 0.0235
const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
uniform vec2 viewport;
uniform float keyboardHeight;
uniform float keyboardTop;
varying vec3 handNormal;
void main() {
  #include <skinbase_vertex>
  vec3 objectNormal = normal;
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vec3 metric = (modelMatrix * vec4(transformed, 1.0)).xyz;
  handNormal = normalize(mat3(modelMatrix) * objectNormal);
  vec3 screen = vec3((metric.x / ${KEYBOARD_METERS} + 0.5) * viewport.x,
    keyboardTop - keyboardHeight + (-metric.z + metric.y * 0.3) * viewport.x / ${KEYBOARD_METERS},
    7.0 + metric.y * 2.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(screen, 1.0);
}`
const fragmentShader = `
uniform float ghostOpacity;
varying vec3 handNormal;
void main() {
  float light = max(0.0, dot(normalize(handNormal), normalize(vec3(-0.4,1.0,0.35))));
  gl_FragColor = vec4(vec3(0.62,0.39,0.26) * (0.65 + 0.5 * light), ghostOpacity);
  #include <colorspace_fragment>
}`

interface Actor {
  root: Group
  motion: AnatomicalMotion
  materials: ShaderMaterial[]
}

/** Shared by live frames and offline export. Solves in meters; projects only in the shader. */
export class AnatomicalHandsLayer {
  readonly group = new Group()
  private actors: Partial<Record<'left' | 'right', Actor>> = {}
  private project: ProjectData | null = null
  private tempo: PrecomputedTempoMap | null = null
  private disposed = false
  private failure: string | null = null

  private loadFailure: string | null = null
  private reportedFailure: string | null = null
  constructor(private readonly onError: (message: string) => void = () => {}) {
    this.group.visible = false
  }

  assertAvailable(): void {
    if (this.failure || this.loadFailure)
      throw new Error(
        `Generated hands unavailable: ${this.failure || this.loadFailure}`,
      )
    if (!this.actors.left || !this.actors.right)
      throw new Error('Generated hands are still loading.')
  }

  async initialize(
    load = () =>
      new GLTFLoader().loadAsync(
        new URL('../assets/hands/right.glb', import.meta.url).href,
      ),
  ): Promise<void> {
    let asset
    try {
      asset = await load()
    } catch (error) {
      this.loadFailure = error instanceof Error ? error.message : String(error)
      return
    }
    if (this.disposed) {
      disposeTree(asset.scene)
      return
    }
    for (const hand of ['left', 'right'] as const) {
      const root = new Group()
      this.group.add(root)
      const keys = new Map<number, AnatomicalKey>()
      for (let pitch = 21; pitch <= 108; pitch++) {
        const black = isBlackKey(pitch)
        const width = black
          ? getBlackKeyWidth(KEYBOARD_METERS)
          : getWhiteKeyWidth(KEYBOARD_METERS)
        const center =
          pitchToKeyX(pitch, KEYBOARD_METERS) + width / 2 - KEYBOARD_METERS / 2
        keys.set(pitch, {
          x: hand === 'left' ? -center : center,
          black,
          mesh: { material: { color: new Color() } },
        })
      }
      const model = clone(asset.scene)
      const motion = createHandMotion(model, root, keys, {
        sequences: { project: [] },
      })
      const materials: ShaderMaterial[] = []
      const meshes: SkinnedMesh[] = []
      model.traverse((object: Object3D) => {
        if (object instanceof SkinnedMesh) meshes.push(object)
      })
      for (const mesh of meshes) {
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material])
          material.dispose()
        const material = new ShaderMaterial({
          vertexShader,
          fragmentShader,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          uniforms: {
            viewport: { value: new Vector2() },
            keyboardHeight: { value: 1 },
            keyboardTop: { value: 0 },
            ghostOpacity: { value: 0.65 },
          },
        })
        material.toneMapped = false
        mesh.material = material
        mesh.renderOrder = 140
        const depth = mesh.clone(false)
        const depthMaterial = material.clone()
        depthMaterial.uniforms = material.uniforms
        depthMaterial.colorWrite = false
        depthMaterial.depthWrite = true
        depth.material = depthMaterial
        depth.renderOrder = 139
        mesh.parent!.add(depth)
        materials.push(material, depthMaterial)
      }
      this.actors[hand] = { root, motion, materials }
    }
    // Clone geometries are shared and owned until dispose(); source materials are unused.
    const sourceMaterials = new Set<Material>()
    asset.scene.traverse((object: Object3D) => {
      if (object instanceof SkinnedMesh)
        for (const m of Array.isArray(object.material)
          ? object.material
          : [object.material])
          sourceMaterials.add(m)
    })
    sourceMaterials.forEach((material) => material.dispose())
  }

  updateProject(
    project: ProjectData,
    tick: number,
    layout: GhostHandsLayout,
  ): void {
    if (this.disposed) return
    if (this.loadFailure) {
      this.reportFailure(this.loadFailure)
      return
    }
    if (!this.actors.left || !this.actors.right) return
    if (!project.tracks.some((track) => track.notes.length)) {
      this.hide()
      this.failure = null
      this.project = null
      return
    }
    if (this.project !== project) {
      this.project = project
      this.failure = null
      this.reportedFailure = null
      try {
        const performance = planProjectHandPerformance(project, {
          leadIn: 0,
          previewLimits: false,
        })
        this.tempo = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
        for (const hand of ['left', 'right'] as const)
          this.actors[hand]!.motion.setSequence(
            'project',
            performance.events.filter((event) => event.hand === hand),
          )
      } catch (error) {
        this.failure = error instanceof Error ? error.message : String(error)
        this.reportFailure(this.failure)
      }
    }
    if (this.failure || !this.tempo) {
      this.hide()
      return
    }
    this.group.visible = true
    for (const hand of ['left', 'right'] as const) {
      const actor = this.actors[hand]!
      actor.root.scale.x = 1
      actor.root.updateMatrixWorld(true)
      actor.motion.sample(tickToSeconds(tick, this.tempo), 'project')
      actor.root.scale.x = hand === 'left' ? -1 : 1
      actor.root.updateMatrixWorld(true)
      for (const material of actor.materials) {
        material.uniforms.viewport.value.set(
          layout.viewportWidth,
          layout.viewportHeight,
        )
        material.uniforms.keyboardHeight.value = layout.keyboardHeight
        material.uniforms.keyboardTop.value =
          layout.viewportHeight - layout.keyboardY
        material.uniforms.ghostOpacity.value = Math.min(
          0.8,
          Math.max(0.1, layout.opacity),
        )
      }
    }
  }
  private reportFailure(message: string): void {
    this.hide()
    if (this.reportedFailure === message) return
    this.reportedFailure = message
    this.onError(`Generated hands unavailable: ${message}`)
  }
  hide(): void {
    this.group.visible = false
  }
  dispose(): void {
    this.disposed = true
    disposeTree(this.group)
    this.group.clear()
    this.actors = {}
    this.project = null
    this.tempo = null
  }
}

function disposeTree(root: Object3D): void {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>(),
    skeletons = new Set<Skeleton>()
  root.traverse((object: Object3D) => {
    const mesh = object as SkinnedMesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material)
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        materials.add(m)
    if (mesh.skeleton) skeletons.add(mesh.skeleton)
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  skeletons.forEach((skeleton) => skeleton.dispose())
}
