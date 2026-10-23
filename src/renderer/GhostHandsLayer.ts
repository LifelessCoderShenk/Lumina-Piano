import {
  Group,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SkinnedMesh,
  Vector3,
} from 'three'
import type { GhostHandPose, GhostHandsPose, HandSpacePoint } from '../hands'
import type { PianoHand } from '../midi/types'
import { createHandRig } from './handRig'

export interface GhostHandsLayout {
  keyboardHeight: number
  keyboardY: number
  opacity: number
  viewportHeight: number
  viewportWidth: number
}

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
uniform vec3 layoutScale;
uniform float keyboardTop;
varying vec3 vNormal;
varying vec3 vColor;
attribute vec3 color;
void main() {
  #include <skinbase_vertex>
  vec3 objectNormal = normal;
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vNormal = normalize(objectNormal);
  vColor = color;
  // Preserve the existing keyboard contact projection, but retain real depth
  // for hidden-surface removal and lighting. No per-finger screen-space scaling.
  vec3 screen = vec3(transformed.x * layoutScale.x,
    keyboardTop + (transformed.y + transformed.z * 0.25) * layoutScale.y,
    7.0 + transformed.z * 2.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(screen, 1.0);
}`
const fragmentShader = `
uniform float ghostOpacity;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 normal = normalize(vNormal);
  float light = max(0.0, dot(normal, normalize(vec3(-0.45,0.6,1.0))));
  float rim = pow(1.0 - max(normal.z, 0.0), 3.0);
  vec3 color = vColor * (0.58 + light * 0.55) + vec3(0.025) * rim;
  gl_FragColor = vec4(color, ghostOpacity);
  #include <colorspace_fragment>
}`

function createHand(hand: PianoHand) {
  const rig = createHandRig(hand)
  const material = new ShaderMaterial({
    uniforms: {
      layoutScale: { value: new Vector3(1, 1, 1) },
      keyboardTop: { value: 0 },
      ghostOpacity: { value: 0.65 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  })
  material.toneMapped = false
  const mesh = new SkinnedMesh(rig.geometry, material)
  mesh.add(rig.wrist)
  mesh.bind(rig.skeleton, new Matrix4())
  mesh.frustumCulled = false
  mesh.renderOrder = 140
  // A depth-only pass prevents the back of a transparent hand or an overlapping
  // finger from showing through its front. Both passes use the identical rig.
  const depthMaterial = material.clone()
  depthMaterial.uniforms = material.uniforms
  depthMaterial.colorWrite = false
  depthMaterial.depthWrite = true
  const depth = new SkinnedMesh(rig.geometry, depthMaterial)
  depth.bind(rig.skeleton, new Matrix4())
  depth.frustumCulled = false
  depth.renderOrder = 139
  const group = new Group()
  group.add(depth, mesh)
  return { rig, mesh, depth, group, material, depthMaterial }
}

type RenderHand = ReturnType<typeof createHand>
const axis = new Vector3(0, 1, 0)

/** Skeletal 3D hands, kept in planner units until the final keyboard projection. */
export class GhostHandsLayer {
  readonly group = new Group()
  private readonly hands: Record<PianoHand, RenderHand>
  // The shared keyboard quad is caller-owned; this layer owns its skinned meshes.
  constructor(_geometry: PlaneGeometry) {
    this.hands = { left: createHand('left'), right: createHand('right') }
    this.group.add(this.hands.left.group, this.hands.right.group)
    this.group.visible = false
  }
  update(pose: GhostHandsPose, layout: GhostHandsLayout): void {
    this.group.visible = pose.left.visible || pose.right.visible
    for (const hand of ['left', 'right'] as const)
      updateHand(this.hands[hand], pose[hand], layout)
  }
  hide(): void {
    this.group.visible = false
  }
  dispose(): void {
    for (const hand of Object.values(this.hands)) {
      hand.rig.geometry.dispose()
      hand.rig.skeleton.dispose()
      hand.material.dispose()
      hand.depthMaterial.dispose()
    }
  }
}

function metric(point: HandSpacePoint): Vector3 {
  return new Vector3(point.x * 8, -point.depth, point.height)
}
function updateHand(
  hand: RenderHand,
  pose: GhostHandPose,
  layout: GhostHandsLayout,
): void {
  hand.group.visible = pose.visible
  if (!pose.visible) return
  const { rig } = hand
  rig.wrist.position.copy(metric(pose.wrist))
  rig.wrist.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -pose.yaw)
  rig.wrist.quaternion.multiply(
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pose.pitch ?? 0),
  )
  rig.wrist.quaternion.multiply(
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.roll ?? 0),
  )
  rig.wrist.updateMatrixWorld(true)
  // The forearm trails toward the player's elbow, rather than rotating rigidly
  // with every finger reach. Its skin blends into the wrist, avoiding a cuff.
  const forearmYaw = (pose.wrist.x - (pose.hand === 'left' ? 0.38 : 0.62)) * 0.7
  const forearmWorld = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    -forearmYaw,
  )
  rig.forearm.quaternion
    .copy(rig.wrist.quaternion)
    .invert()
    .multiply(forearmWorld)
  rig.forearm.updateMatrixWorld(true)
  for (const finger of [1, 2, 3, 4, 5] as const) {
    const joints = pose.fingers[finger].joints.map(metric)
    const chain = rig.fingers[finger]
    for (let i = 0; i < 4; i++) {
      const bone = chain[i],
        parent = bone.parent!
      const parentInverse = parent.matrixWorld.clone().invert()
      bone.position.copy(joints[i]).applyMatrix4(parentInverse)
      if (i < 3) {
        const direction = joints[i + 1].clone().sub(joints[i]).normalize()
        const worldRotation = new Quaternion().setFromUnitVectors(
          axis,
          direction,
        )
        bone.quaternion
          .copy(parent.getWorldQuaternion(new Quaternion()).invert())
          .multiply(worldRotation)
      } else bone.quaternion.identity()
      bone.updateMatrixWorld(true)
    }
  }
  rig.skeleton.update()
  hand.material.uniforms.layoutScale.value.set(
    layout.viewportWidth / 8,
    layout.keyboardHeight,
    1,
  )
  hand.material.uniforms.keyboardTop.value =
    layout.viewportHeight - layout.keyboardY
  hand.material.uniforms.ghostOpacity.value = Math.min(
    0.8,
    Math.max(0.1, layout.opacity),
  )
}
