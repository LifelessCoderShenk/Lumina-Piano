import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStore, useAppStore } from '../store/store'

const mockBufferGeometryDispose = vi.hoisted(() => vi.fn())
const mockCanvasTextureDispose = vi.hoisted(() => vi.fn())
const mockMaterialColorSetHex = vi.hoisted(() => vi.fn())
const mockMeshBasicMaterialDispose = vi.hoisted(() => vi.fn())
const mockMeshLambertMaterialDispose = vi.hoisted(() => vi.fn())
const mockShaderMaterialDispose = vi.hoisted(() => vi.fn())
const mockSpriteMaterialDispose = vi.hoisted(() => vi.fn())
const mockGroupAdd = vi.hoisted(() => vi.fn())
const mockGroupRemove = vi.hoisted(() => vi.fn())
const mockSceneAdd = vi.hoisted(() => vi.fn())
const mockSceneRemove = vi.hoisted(() => vi.fn())
const mockCameraPositionSet = vi.hoisted(() => vi.fn())
const mockCameraLookAt = vi.hoisted(() => vi.fn())
const mockCameraUpdateProjectionMatrix = vi.hoisted(() => vi.fn())
const mockPlaneGeometryDispose = vi.hoisted(() => vi.fn())
const mockRendererConstructor = vi.hoisted(() => vi.fn())
const mockRendererSetClearColor = vi.hoisted(() => vi.fn())
const mockRendererSetPixelRatio = vi.hoisted(() => vi.fn())
const mockRendererSetSize = vi.hoisted(() => vi.fn())
const mockRendererRender = vi.hoisted(() => vi.fn())
const mockRendererSetAnimationLoop = vi.hoisted(() => vi.fn())
const mockRendererDispose = vi.hoisted(() => vi.fn())
const mockRendererForceContextLoss = vi.hoisted(() => vi.fn())
const mockEffectComposerAddPass = vi.hoisted(() => vi.fn())
const mockEffectComposerSetPixelRatio = vi.hoisted(() => vi.fn())
const mockEffectComposerSetSize = vi.hoisted(() => vi.fn())
const mockEffectComposerRender = vi.hoisted(() => vi.fn())
const mockEffectComposerDispose = vi.hoisted(() => vi.fn())
const mockLayersEnable = vi.hoisted(() => vi.fn())
const mockLayersSet = vi.hoisted(() => vi.fn())
const mockOutputPassDispose = vi.hoisted(() => vi.fn())
const mockShaderPassDispose = vi.hoisted(() => vi.fn())
const mockUnrealBloomPassDispose = vi.hoisted(() => vi.fn())
const mockPlaybackEngineOn = vi.hoisted(() => vi.fn())
const mockPlaybackEngineOff = vi.hoisted(() => vi.fn())
const mockPlaybackSeekListeners = vi.hoisted(() => new Set<(tick: number) => void>())
const createdMeshMaterials = vi.hoisted(() => [] as Array<{ opacity: number }>)

vi.mock('three', () => {
  const AdditiveBlending = 'AdditiveBlending'
  const LinearToneMapping = 'LinearToneMapping'

  class AmbientLight {
    layers = {
      enable: mockLayersEnable,
      mask: 1,
      set: mockLayersSet,
    }

    constructor(
      public color: number,
      public intensity: number,
    ) {}
  }

  class CanvasTexture {
    constructor(_canvas: HTMLCanvasElement) {}

    dispose = mockCanvasTextureDispose
  }

  class BufferAttribute {
    needsUpdate = false

    constructor(
      public array: Float32Array,
      public itemSize: number,
    ) {}
  }

  class BufferGeometry {
    attributes: Record<string, BufferAttribute> = {}
    drawRange = {
      count: 0,
      start: 0,
    }

    dispose = mockBufferGeometryDispose

    setAttribute(name: string, attribute: BufferAttribute) {
      this.attributes[name] = attribute
      return this
    }

    setDrawRange(start: number, count: number) {
      this.drawRange = { count, start }
    }
  }

  class Color {
    constructor(_value: number) {}
  }

  class Group {
    children: unknown[] = []

    add = (...children: unknown[]) => {
      this.children.push(...children)
      mockGroupAdd(...children)
    }

    remove = (...children: unknown[]) => {
      this.children = this.children.filter((child) => !children.includes(child))
      mockGroupRemove(...children)
    }
  }

  class MeshBasicMaterial {
    color = {
      setHex: mockMaterialColorSetHex,
    }
    needsUpdate = false
    opacity: number
    transparent: boolean

    constructor(options: { opacity?: number; transparent?: boolean }) {
      this.opacity = options.opacity ?? 1
      this.transparent = options.transparent ?? false
      createdMeshMaterials.push(this)
    }

    dispose = mockMeshBasicMaterialDispose
  }

  class MeshLambertMaterial {
    color = {
      setHex: mockMaterialColorSetHex,
    }
    emissive = {
      setHex: mockMaterialColorSetHex,
    }
    emissiveIntensity: number
    needsUpdate = false
    opacity: number
    transparent: boolean
    userData: Record<string, unknown> = {}

    constructor(options: { emissiveIntensity?: number; opacity?: number; transparent?: boolean }) {
      this.emissiveIntensity = options.emissiveIntensity ?? 1
      this.opacity = options.opacity ?? 1
      this.transparent = options.transparent ?? false
      createdMeshMaterials.push(this)
    }

    dispose = mockMeshLambertMaterialDispose
  }

  class OrthographicCamera {
    bottom = 1
    left = 0
    layers = {
      enable: mockLayersEnable,
      mask: 1,
      set: vi.fn((channel: number) => {
        this.layers.mask = 1 << channel
        mockLayersSet(channel)
      }),
    }
    right = 1
    top = 0
    position = {
      set: mockCameraPositionSet,
    }

    constructor(
      left: number,
      right: number,
      top: number,
      bottom: number,
      _near: number,
      _far: number,
    ) {
      this.left = left
      this.right = right
      this.top = top
      this.bottom = bottom
    }

    lookAt = mockCameraLookAt
    updateProjectionMatrix = mockCameraUpdateProjectionMatrix
  }

  class PlaneGeometry {
    constructor(_width: number, _height: number) {}

    dispose = mockPlaneGeometryDispose
  }

  class Scene {
    background: unknown = null
    add = (...children: unknown[]) => {
      mockSceneAdd(...children)
    }
    remove = (...children: unknown[]) => {
      mockSceneRemove(...children)
    }
  }

  class SpriteMaterial {
    needsUpdate = false
    opacity: number
    transparent: boolean

    constructor(options: { opacity?: number; transparent?: boolean }) {
      this.opacity = options.opacity ?? 1
      this.transparent = options.transparent ?? false
    }

    dispose = mockSpriteMaterialDispose
  }

  class ShaderMaterial {
    needsUpdate = false
    transparent: boolean
    uniforms: Record<string, { value: unknown }>

    constructor(options: {
      transparent?: boolean
      uniforms?: Record<string, { value: unknown }>
    }) {
      this.transparent = options.transparent ?? false
      this.uniforms = options.uniforms ?? {}
    }

    dispose = mockShaderMaterialDispose
  }

  class Mesh {
    layers = {
      enable: mockLayersEnable,
      mask: 1,
      set: mockLayersSet,
    }
    position = {
      set: vi.fn(),
    }
    rotation = {
      z: 0,
    }
    renderOrder = 0
    scale = {
      x: 1,
      y: 1,
      z: 1,
      set: vi.fn((x: number, y: number, z: number) => {
        this.scale.x = x
        this.scale.y = y
        this.scale.z = z
      }),
    }
    visible = true

    constructor(
      public geometry: unknown,
      public material: MeshBasicMaterial,
    ) {}
  }

  class Sprite {
    layers = {
      enable: mockLayersEnable,
      mask: 1,
      set: mockLayersSet,
    }
    position = {
      set: vi.fn(),
    }
    rotation = {
      z: 0,
    }
    renderOrder = 0
    scale = {
      x: 1,
      y: 1,
      z: 1,
      set: vi.fn((x: number, y: number, z: number) => {
        this.scale.x = x
        this.scale.y = y
        this.scale.z = z
      }),
    }
    visible = true

    constructor(public material: SpriteMaterial) {}
  }

  class Points {
    frustumCulled = true
    layers = {
      enable: mockLayersEnable,
      mask: 1,
      set: mockLayersSet,
    }
    renderOrder = 0
    visible = true

    constructor(
      public geometry: BufferGeometry,
      public material: ShaderMaterial,
    ) {}
  }

  class Vector2 {
    constructor(
      public x: number,
      public y: number,
    ) {}

    set(x: number, y: number) {
      this.x = x
      this.y = y
      return this
    }
  }

  class WebGLRenderer {
    toneMapping: unknown = null
    toneMappingExposure = 1
    setClearColor = mockRendererSetClearColor
    setPixelRatio = mockRendererSetPixelRatio
    setSize = mockRendererSetSize
    render = mockRendererRender
    setAnimationLoop = mockRendererSetAnimationLoop
    dispose = mockRendererDispose
    forceContextLoss = mockRendererForceContextLoss

    constructor(options: unknown) {
      mockRendererConstructor(options)
    }
  }

  return {
    AdditiveBlending,
    AmbientLight,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    Group,
    LinearToneMapping,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    OrthographicCamera,
    PlaneGeometry,
    Points,
    Scene,
    ShaderMaterial,
    Sprite,
    SpriteMaterial,
    Vector2,
    WebGLRenderer,
  }
})

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => {
  class EffectComposer {
    addPass = mockEffectComposerAddPass
    dispose = mockEffectComposerDispose
    render = mockEffectComposerRender
    renderToScreen = true
    renderTarget2 = {
      texture: {},
    }
    setPixelRatio = mockEffectComposerSetPixelRatio
    setSize = mockEffectComposerSetSize

    constructor(_renderer: unknown) {}
  }

  return { EffectComposer }
})

vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => {
  class OutputPass {
    dispose = mockOutputPassDispose
  }

  return { OutputPass }
})

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => {
  class RenderPass {
    constructor(
      public scene: unknown,
      public camera: unknown,
    ) {}
  }

  return { RenderPass }
})

vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => {
  class ShaderPass {
    dispose = mockShaderPassDispose
    uniforms: Record<string, { value: unknown }>

    constructor(
      public shader: { uniforms?: Record<string, { value: unknown }> },
      public textureID?: string,
    ) {
      this.uniforms = shader.uniforms ?? {}
    }
  }

  return { ShaderPass }
})

vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => {
  class UnrealBloomPass {
    dispose = mockUnrealBloomPassDispose

    constructor(
      public resolution: unknown,
      public strength: number,
      public radius: number,
      public threshold: number,
    ) {}
  }

  return { UnrealBloomPass }
})

vi.mock('../playback/PlaybackEngine', () => ({
  playbackEngine: {
    off: mockPlaybackEngineOff.mockImplementation((event: string, listener: (tick: number) => void) => {
      if (event === 'onSeek') {
        mockPlaybackSeekListeners.delete(listener)
      }
    }),
    on: mockPlaybackEngineOn.mockImplementation((event: string, listener: (tick: number) => void) => {
      if (event === 'onSeek') {
        mockPlaybackSeekListeners.add(listener)
      }
    }),
  },
}))

const { ThreeRenderer } = await import('./ThreeRenderer')

describe('ThreeRenderer', () => {
  beforeEach(() => {
    resetStore()
    mockBufferGeometryDispose.mockReset()
    mockCanvasTextureDispose.mockReset()
    mockMaterialColorSetHex.mockReset()
    mockMeshBasicMaterialDispose.mockReset()
    mockMeshLambertMaterialDispose.mockReset()
    mockShaderMaterialDispose.mockReset()
    mockSpriteMaterialDispose.mockReset()
    mockGroupAdd.mockReset()
    mockGroupRemove.mockReset()
    mockSceneAdd.mockReset()
    mockSceneRemove.mockReset()
    mockCameraPositionSet.mockReset()
    mockCameraLookAt.mockReset()
    mockCameraUpdateProjectionMatrix.mockReset()
    mockPlaneGeometryDispose.mockReset()
    mockRendererConstructor.mockReset()
    mockRendererSetClearColor.mockReset()
    mockRendererSetPixelRatio.mockReset()
    mockRendererSetSize.mockReset()
    mockRendererRender.mockReset()
    mockRendererSetAnimationLoop.mockReset()
    mockRendererDispose.mockReset()
    mockRendererForceContextLoss.mockReset()
    mockEffectComposerAddPass.mockReset()
    mockEffectComposerSetPixelRatio.mockReset()
    mockEffectComposerSetSize.mockReset()
    mockEffectComposerRender.mockReset()
    mockEffectComposerDispose.mockReset()
    mockLayersEnable.mockReset()
    mockLayersSet.mockReset()
    mockOutputPassDispose.mockReset()
    mockShaderPassDispose.mockReset()
    mockUnrealBloomPassDispose.mockReset()
    mockPlaybackEngineOn.mockClear()
    mockPlaybackEngineOff.mockClear()
    mockPlaybackSeekListeners.clear()
    createdMeshMaterials.length = 0

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    })

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
      if (contextId !== '2d') {
        return null
      }

      return {
        clearRect: vi.fn(),
        fillStyle: '#000000',
        fillText: vi.fn(),
        font: '',
        measureText: (text: string) => ({ width: text.length * 7 }),
        textAlign: 'center',
        textBaseline: 'middle',
      } as unknown as CanvasRenderingContext2D
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('binds the provided canvas and builds the static Create Mode scene', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    await renderer.init(canvas)

    expect(mockRendererConstructor).toHaveBeenCalledWith(expect.objectContaining({ canvas }))
    expect(mockRendererSetClearColor).toHaveBeenCalledWith(0x000000, 1)
    expect(mockRendererSetPixelRatio).toHaveBeenCalledWith(2)
    expect(mockRendererSetSize).toHaveBeenCalledWith(640, 360, false)
    expect(mockEffectComposerAddPass).toHaveBeenCalledTimes(5)
    expect(mockEffectComposerSetPixelRatio).toHaveBeenCalledWith(2)
    expect(mockEffectComposerSetSize).toHaveBeenCalledWith(640, 360)
    expect(mockCameraUpdateProjectionMatrix).toHaveBeenCalled()
    expect(mockSceneAdd).toHaveBeenCalledTimes(6)
    expect(mockGroupAdd).toHaveBeenCalled()
    expect(mockLayersEnable).toHaveBeenCalled()
    expect(renderer.getCanvas()).toBe(canvas)
    expect(renderer.getKeyX(60)).toBeGreaterThan(0)
    expect(renderer.getKeyboardY()).toBeGreaterThan(0)

    renderer.setKeyboardOpacity(0.4)
    renderer.setActiveKeyPitches([60])

    expect((renderer as any).bloomPass.radius).toBe(0.025)
    expect((renderer as any).bloomCompositePass.uniforms.bloomTexture.value).toBe((renderer as any).bloomComposer.renderTarget2.texture)
    expect((renderer as any).bloomComposer.renderToScreen).toBe(false)
    expect((renderer as any).bloomCompositePass.uniforms.bloomDebugView.value).toBe(0)
    expect((renderer as any).bloomCompositePass.uniforms.bloomClipY.value).toBeCloseTo(1 - (101 / 360))
    expect((renderer as any).bloomCompositePass.uniforms.bloomClipFeather.value).toBeCloseTo(3 / 360)
    expect((renderer as any).bloomCompositePass.uniforms.bloomDebugLineHalfThickness.value).toBeCloseTo(0.5 / 360)
    expect(mockMaterialColorSetHex).toHaveBeenCalled()
    expect(createdMeshMaterials.some((material) => Math.abs(material.opacity - 0.18) < 0.001)).toBe(true)
    expect(mockLayersSet).toHaveBeenCalled()
    expect(mockEffectComposerRender).toHaveBeenCalled()
    expect((renderer as any).particleSystem.geometry.drawRange.count).toBe(0)
    expect((renderer as any).particleSystem.positionAttribute.array.length).toBe(4_096 * 3)
  })

  it('fades playback-driven key highlights in and out over time', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    await renderer.init(canvas)

    const highlightState = (renderer as any).keyHighlightStates.get(60) as {
      material: { opacity: number }
    }

    expect(highlightState.material.opacity).toBe(0)

    ;(renderer as any).playbackActiveKeyPitches = new Set([60])
    ;(renderer as any).applyActiveKeyHighlights(1)
    ;(renderer as any).applyActiveKeyHighlights(1.03)

    expect(highlightState.material.opacity).toBeGreaterThan(0)
    expect(highlightState.material.opacity).toBeLessThan(0.45)

    ;(renderer as any).applyActiveKeyHighlights(1.06)

    expect(highlightState.material.opacity).toBeCloseTo(0.45, 3)

    ;(renderer as any).playbackActiveKeyPitches = new Set()
    ;(renderer as any).applyActiveKeyHighlights(1.06)
    ;(renderer as any).applyActiveKeyHighlights(1.15)

    expect(highlightState.material.opacity).toBeGreaterThan(0)
    expect(highlightState.material.opacity).toBeLessThan(0.45)

    ;(renderer as any).applyActiveKeyHighlights(1.24)

    expect(highlightState.material.opacity).toBeCloseTo(0, 3)
  })

  it('lets explicit and playback-driven keys fade independently across chords', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    await renderer.init(canvas)

    const middleCHighlight = (renderer as any).keyHighlightStates.get(60) as {
      material: { opacity: number }
    }
    const eHighlight = (renderer as any).keyHighlightStates.get(64) as {
      material: { opacity: number }
    }
    const gHighlight = (renderer as any).keyHighlightStates.get(67) as {
      material: { opacity: number }
    }

    ;(renderer as any).playbackActiveKeyPitches = new Set([60, 64])
    ;(renderer as any).explicitActiveKeyPitches = new Set([67])
    ;(renderer as any).applyActiveKeyHighlights(2)
    ;(renderer as any).applyActiveKeyHighlights(2.03)

    expect(middleCHighlight.material.opacity).toBeGreaterThan(0)
    expect(eHighlight.material.opacity).toBeGreaterThan(0)
    expect(gHighlight.material.opacity).toBeGreaterThan(0)

    ;(renderer as any).playbackActiveKeyPitches = new Set([60])
    ;(renderer as any).applyActiveKeyHighlights(2.03)
    ;(renderer as any).applyActiveKeyHighlights(2.12)

    expect(middleCHighlight.material.opacity).toBeCloseTo(0.45, 3)
    expect(eHighlight.material.opacity).toBeLessThan(middleCHighlight.material.opacity)
    expect(eHighlight.material.opacity).toBeGreaterThan(0)
    expect(gHighlight.material.opacity).toBeCloseTo(0.45, 3)

    ;(renderer as any).applyActiveKeyHighlights(2.21)

    expect(eHighlight.material.opacity).toBeCloseTo(0, 3)
    expect(middleCHighlight.material.opacity).toBeCloseTo(0.45, 3)
    expect(gHighlight.material.opacity).toBeCloseTo(0.45, 3)
  })

  it('gives each note mesh its own rounded note size uniforms while sharing animation time', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    await renderer.init(canvas)

    const noteGroup = (renderer as any).requireNoteGroup()
    const firstMesh = (renderer as any).getOrCreateNoteMesh(noteGroup, 0)
    const secondMesh = (renderer as any).getOrCreateNoteMesh(noteGroup, 1)
    const firstUniforms = firstMesh.material.userData.roundedNoteUniforms as {
      noteMaterialTime: { value: number }
      roundedRectRadius: { value: number }
      roundedRectSize: { value: { x: number; y: number } }
    }
    const secondUniforms = secondMesh.material.userData.roundedNoteUniforms as {
      noteMaterialTime: { value: number }
      roundedRectRadius: { value: number }
      roundedRectSize: { value: { x: number; y: number } }
    }

    expect(firstMesh.material).not.toBe(secondMesh.material)
    expect(firstUniforms.noteMaterialTime).toBe(secondUniforms.noteMaterialTime)

    firstMesh.scale.set(12, 6, 1)
    secondMesh.scale.set(20, 10, 1)
    firstMesh.onBeforeRender?.(null, null, null, null, firstMesh.material)
    secondMesh.onBeforeRender?.(null, null, null, null, secondMesh.material)

    expect(firstUniforms.roundedRectSize.value.x).toBe(12)
    expect(firstUniforms.roundedRectSize.value.y).toBe(6)
    expect(firstUniforms.roundedRectRadius.value).toBeCloseTo(1.08)
    expect(secondUniforms.roundedRectSize.value.x).toBe(20)
    expect(secondUniforms.roundedRectSize.value.y).toBe(10)
    expect(secondUniforms.roundedRectRadius.value).toBeCloseTo(1.8)
  })

  it('assigns each visible note a stable independent travel phase offset', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 720,
        id: 'phase-c',
        pitch: 60,
        startTick: 240,
        velocity: 112,
        visualEndTick: 720,
      },
      {
        endTick: 720,
        id: 'phase-e',
        pitch: 64,
        startTick: 240,
        velocity: 112,
        visualEndTick: 720,
      },
      {
        endTick: 720,
        id: 'phase-g',
        pitch: 67,
        startTick: 240,
        velocity: 112,
        visualEndTick: 720,
      },
    ])

    await renderer.init(canvas)

    useAppStore.setState({ currentTick: 0 })
    ;(renderer as any).handleAnimationFrame(1000)

    const noteMeshes = (renderer as any).noteMeshes as Array<{
      material: {
        userData: {
          roundedNoteUniforms: {
            noteTravelPhaseOffset: { value: number }
          }
        }
      }
      visible: boolean
    }>
    const firstPassOffsets = noteMeshes
      .filter((noteMesh) => noteMesh.visible)
      .slice(0, 3)
      .map((noteMesh) => noteMesh.material.userData.roundedNoteUniforms.noteTravelPhaseOffset.value)

    expect(firstPassOffsets).toHaveLength(3)
    expect(new Set(firstPassOffsets.map((offset) => offset.toFixed(6))).size).toBe(3)
    for (const offset of firstPassOffsets) {
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(1)
    }

    ;(renderer as any).handleAnimationFrame(1016)
    const secondPassOffsets = noteMeshes
      .filter((noteMesh) => noteMesh.visible)
      .slice(0, 3)
      .map((noteMesh) => noteMesh.material.userData.roundedNoteUniforms.noteTravelPhaseOffset.value)

    expect(secondPassOffsets).toEqual(firstPassOffsets)
  })

  it('updates rounded note uniforms from the current note dimensions', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    await renderer.init(canvas)

    const noteGroup = (renderer as any).requireNoteGroup()
    const noteMesh = (renderer as any).getOrCreateNoteMesh(noteGroup, 0)
    noteMesh.scale.set(12, 6, 1)
    noteMesh.onBeforeRender?.(null, null, null, null, noteMesh.material)

    const roundedNoteUniforms = noteMesh.material.userData.roundedNoteUniforms as {
      noteCoreDiffuseColor: { value: unknown }
      noteCoreEmissiveColor: { value: unknown }
      noteCoreEmissiveStrength: { value: number }
      noteHaloDiffuseColor: { value: unknown }
      noteHaloEmissiveColor: { value: unknown }
      noteHaloEmissiveStrength: { value: number }
      noteMaterialTime: { value: number }
      roundedRectRadius: { value: number }
      roundedRectSize: { value: { x: number; y: number } }
    }

    expect(roundedNoteUniforms.noteMaterialTime.value).toBe(0)
    expect(roundedNoteUniforms.noteCoreDiffuseColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteHaloDiffuseColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteCoreEmissiveColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteHaloEmissiveColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteCoreEmissiveStrength.value).toBeCloseTo(1.35)
    expect(roundedNoteUniforms.noteHaloEmissiveStrength.value).toBeCloseTo(1.45)
    expect(roundedNoteUniforms.roundedRectSize.value.x).toBe(12)
    expect(roundedNoteUniforms.roundedRectSize.value.y).toBe(6)
    expect(roundedNoteUniforms.roundedRectRadius.value).toBeCloseTo(1.08)
  })

  it('updates the shared note material animation time from real-time frames', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    await renderer.init(canvas)

    const noteGroup = (renderer as any).requireNoteGroup()
    const noteMesh = (renderer as any).getOrCreateNoteMesh(noteGroup, 0)
    const roundedNoteUniforms = noteMesh.material.userData.roundedNoteUniforms as {
      noteMaterialTime: { value: number }
    }

    ;(renderer as any).handleAnimationFrame(2500)

    expect(roundedNoteUniforms.noteMaterialTime.value).toBeCloseTo(2.5)
    expect((renderer as any).particleSystem.uniforms.particleTime.value).toBeCloseTo(2.5)
  })

  it('emits velocity-scaled bursts when note ids cross the boundary during forward playback', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 480,
        id: 'note-1',
        pitch: 60,
        startTick: 240,
        velocity: 127,
        visualEndTick: 480,
      },
    ])

    await renderer.init(canvas)

    useAppStore.setState({ currentTick: 239 })
    ;(renderer as any).handleAnimationFrame(1000)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 240 })
    ;(renderer as any).handleAnimationFrame(1032)

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      baseBrightnesses: Float32Array
      baseSizes: Float32Array
      geometry: { drawRange: { count: number } }
      points: { renderOrder: number }
      uniforms: { pixelRatio: { value: number } }
      velocities: Float32Array
    }

    expect(particleSystem.activeCount).toBe(60)
    expect(particleSystem.geometry.drawRange.count).toBe(60)
    expect(particleSystem.points.renderOrder).toBe(110)
    expect(particleSystem.uniforms.pixelRatio.value).toBe(2)
    expect(Math.max(...Array.from(particleSystem.baseSizes.slice(0, particleSystem.activeCount)))).toBeGreaterThan(4.5)
    expect(Math.max(...Array.from(particleSystem.baseSizes.slice(0, particleSystem.activeCount)))).toBeLessThan(6.2)
    expect(Math.min(...Array.from(particleSystem.baseBrightnesses.slice(0, particleSystem.activeCount)))).toBeGreaterThan(0.45)
    expect(Math.min(...Array.from({ length: particleSystem.activeCount }, (_, index) => particleSystem.velocities[(index * 3) + 1]))).toBeGreaterThan(0)
  })

  it('uses deterministic flow noise sampling and drifts active particles sideways over time', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 480,
        id: 'flow-note',
        pitch: 60,
        startTick: 240,
        velocity: 127,
        visualEndTick: 480,
      },
    ])

    await renderer.init(canvas)

    useAppStore.setState({ currentTick: 239 })
    ;(renderer as any).handleAnimationFrame(1000)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 240 })
    ;(renderer as any).handleAnimationFrame(1032)

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      positions: Float32Array
      seeds: Float32Array
      velocities: Float32Array
    }

    const burstX = particleSystem.positions[0]
    const burstY = particleSystem.positions[1]
    const firstSeed = particleSystem.seeds[0]
    const initialFirstVelocityX = particleSystem.velocities[0]
    const firstNoiseSample = (renderer as any).sampleParticleFlowNoise(burstX, burstY, 0.35, firstSeed)
    const repeatedNoiseSample = (renderer as any).sampleParticleFlowNoise(burstX, burstY, 0.35, firstSeed)
    const futureNoiseSample = (renderer as any).sampleParticleFlowNoise(burstX + 12, burstY, 0.55, firstSeed)

    expect(firstNoiseSample).toBeCloseTo(repeatedNoiseSample, 10)
    expect(futureNoiseSample).not.toBeCloseTo(firstNoiseSample, 4)

    for (let frame = 0; frame < 24; frame += 1) {
      ;(renderer as any).updateParticleSystem(1.048 + (frame * 0.016))
    }

    const maxLateralDrift = Math.max(
      ...Array.from({ length: particleSystem.activeCount }, (_, index) =>
        Math.abs(particleSystem.positions[index * 3] - burstX)),
    )

    expect(maxLateralDrift).toBeGreaterThan(18)
    expect(particleSystem.velocities[0]).not.toBeCloseTo(initialFirstVelocityX, 4)
  })

  it('emits bursts for all crossed notes during large uninterrupted forward jumps', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 340,
        id: 'note-100',
        pitch: 60,
        startTick: 100,
        velocity: 127,
        visualEndTick: 340,
      },
      {
        endTick: 440,
        id: 'note-200',
        pitch: 62,
        startTick: 200,
        velocity: 127,
        visualEndTick: 440,
      },
      {
        endTick: 540,
        id: 'note-300',
        pitch: 64,
        startTick: 300,
        velocity: 127,
        visualEndTick: 540,
      },
      {
        endTick: 640,
        id: 'note-400',
        pitch: 65,
        startTick: 400,
        velocity: 127,
        visualEndTick: 640,
      },
    ])

    await renderer.init(canvas)

    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 450 })
    ;(renderer as any).handleAnimationFrame(1032)

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      geometry: { drawRange: { count: number } }
    }

    expect(particleSystem.activeCount).toBe(240)
    expect(particleSystem.geometry.drawRange.count).toBe(240)
  })

  it('suppresses skipped-range bursts after a real seek event', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 340,
        id: 'note-100',
        pitch: 60,
        startTick: 100,
        velocity: 127,
        visualEndTick: 340,
      },
      {
        endTick: 440,
        id: 'note-200',
        pitch: 62,
        startTick: 200,
        velocity: 127,
        visualEndTick: 440,
      },
      {
        endTick: 540,
        id: 'note-300',
        pitch: 64,
        startTick: 300,
        velocity: 127,
        visualEndTick: 540,
      },
      {
        endTick: 640,
        id: 'note-400',
        pitch: 65,
        startTick: 400,
        velocity: 127,
        visualEndTick: 640,
      },
    ])

    await renderer.init(canvas)

    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 450 })
    emitPlaybackSeek(450)
    ;(renderer as any).handleAnimationFrame(1032)

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      geometry: { drawRange: { count: number } }
    }

    expect(particleSystem.activeCount).toBe(0)
    expect(particleSystem.geometry.drawRange.count).toBe(0)
  })

  it('suppresses skipped-range bursts across loop restarts while allowing new loop notes to emit', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 460,
        id: 'loop-note',
        pitch: 60,
        startTick: 220,
        velocity: 127,
        visualEndTick: 460,
      },
      {
        endTick: 1_080,
        id: 'pre-loop-note',
        pitch: 64,
        startTick: 960,
        velocity: 127,
        visualEndTick: 1_080,
      },
    ])

    await renderer.init(canvas)

    useAppStore.setState({ currentTick: 950 })
    ;(renderer as any).handleAnimationFrame(1000)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 200 })
    emitPlaybackSeek(200)
    ;(renderer as any).handleAnimationFrame(1032)
    useAppStore.setState({ currentTick: 250 })
    ;(renderer as any).handleAnimationFrame(1048)

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      geometry: { drawRange: { count: number } }
    }

    expect(particleSystem.activeCount).toBe(60)
    expect(particleSystem.geometry.drawRange.count).toBe(60)
  })

  it('resumes normal range-based bursts after pausing and resuming playback', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 480,
        id: 'resume-note',
        pitch: 60,
        startTick: 240,
        velocity: 127,
        visualEndTick: 480,
      },
    ])

    await renderer.init(canvas)

    ;(renderer as any).handleAnimationFrame(1000)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 120 })
    ;(renderer as any).handleAnimationFrame(1032)
    useAppStore.getState().setIsPlaying(false)
    ;(renderer as any).handleAnimationFrame(1048)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1064)
    useAppStore.setState({ currentTick: 300 })
    ;(renderer as any).handleAnimationFrame(1080)

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      geometry: { drawRange: { count: number } }
    }

    expect(particleSystem.activeCount).toBe(60)
    expect(particleSystem.geometry.drawRange.count).toBe(60)
  })

  it('disposes static scene resources and releases the WebGL context on destroy', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 320,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 240,
    })

    await renderer.init(canvas)
    await renderer.destroy()

    expect(mockGroupRemove).toHaveBeenCalled()
    expect(mockCanvasTextureDispose).not.toHaveBeenCalled()
    expect(mockBufferGeometryDispose).toHaveBeenCalledTimes(1)
    expect(mockMeshBasicMaterialDispose).toHaveBeenCalled()
    expect(mockMeshLambertMaterialDispose).toHaveBeenCalled()
    expect(mockShaderMaterialDispose).toHaveBeenCalledTimes(1)
    expect(mockSpriteMaterialDispose).not.toHaveBeenCalled()
    expect(mockUnrealBloomPassDispose).toHaveBeenCalledTimes(1)
    expect(mockOutputPassDispose).toHaveBeenCalledTimes(1)
    expect(mockShaderPassDispose).toHaveBeenCalledTimes(1)
    expect(mockEffectComposerDispose).toHaveBeenCalledTimes(2)
    expect(mockPlaneGeometryDispose).toHaveBeenCalledTimes(1)
    expect(mockSceneRemove).toHaveBeenCalledTimes(6)
    expect(mockRendererSetAnimationLoop).toHaveBeenCalledWith(null)
    expect(mockRendererForceContextLoss).toHaveBeenCalledTimes(1)
    expect(mockRendererDispose).toHaveBeenCalledTimes(1)
  })
})

function loadProjectWithNotes(notes: Array<{
  endTick: number
  id: string
  pitch: number
  startTick: number
  velocity: number
  visualEndTick: number
}>): void {
  useAppStore.getState().loadProject(
    {
      tempoMap: [
        {
          bpm: 120,
          microsecondsPerBeat: 500_000,
          tick: 0,
        },
      ],
      ticksPerQuarter: 480,
      timeSignatures: [
        {
          denominator: 4,
          numerator: 4,
          tick: 0,
        },
      ],
      totalTicks: 5_000,
      tracks: [
        {
          channel: 0,
          id: 'track-1',
          name: 'Track 1',
          notes,
        },
      ],
    },
    {
      segments: [
        {
          bpm: 120,
          endTick: Number.POSITIVE_INFINITY,
          microsecondsPerBeat: 500_000,
          startSeconds: 0,
          startTick: 0,
          ticksPerSecond: 960,
        },
      ],
    },
  )
}

function emitPlaybackSeek(tick: number): void {
  for (const listener of [...mockPlaybackSeekListeners]) {
    listener(tick)
  }
}
