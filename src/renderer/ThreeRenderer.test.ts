import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCanvasTextureDispose = vi.hoisted(() => vi.fn())
const mockMaterialColorSetHex = vi.hoisted(() => vi.fn())
const mockMeshBasicMaterialDispose = vi.hoisted(() => vi.fn())
const mockMeshLambertMaterialDispose = vi.hoisted(() => vi.fn())
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
const createdMeshMaterials = vi.hoisted(() => [] as Array<{ opacity: number }>)

vi.mock('three', () => {
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
    AmbientLight,
    CanvasTexture,
    Color,
    Group,
    LinearToneMapping,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
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

const { ThreeRenderer } = await import('./ThreeRenderer')

describe('ThreeRenderer', () => {
  beforeEach(() => {
    mockCanvasTextureDispose.mockReset()
    mockMaterialColorSetHex.mockReset()
    mockMeshBasicMaterialDispose.mockReset()
    mockMeshLambertMaterialDispose.mockReset()
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
    expect(mockSceneAdd).toHaveBeenCalledTimes(5)
    expect(mockGroupAdd).toHaveBeenCalled()
    expect(mockLayersEnable).toHaveBeenCalled()
    expect(renderer.getCanvas()).toBe(canvas)
    expect(renderer.getKeyX(60)).toBeGreaterThan(0)
    expect(renderer.getKeyboardY()).toBeGreaterThan(0)

    renderer.setKeyboardOpacity(0.4)
    renderer.setActiveKeyPitches([60])

    expect((renderer as any).bloomPass.radius).toBe(0.1)
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
  })

  it('keeps playback-driven active keys from changing keyboard highlight opacity', async () => {
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
    ;(renderer as any).applyActiveKeyHighlights()

    expect(highlightState.material.opacity).toBe(0)

    renderer.setActiveKeyPitches([60])

    expect(highlightState.material.opacity).toBeCloseTo(0.45)
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
    expect(roundedNoteUniforms.noteCoreEmissiveStrength.value).toBeCloseTo(2.35)
    expect(roundedNoteUniforms.noteHaloEmissiveStrength.value).toBeCloseTo(3.3)
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
    expect(mockMeshBasicMaterialDispose).toHaveBeenCalled()
    expect(mockMeshLambertMaterialDispose).toHaveBeenCalled()
    expect(mockSpriteMaterialDispose).not.toHaveBeenCalled()
    expect(mockUnrealBloomPassDispose).toHaveBeenCalledTimes(1)
    expect(mockOutputPassDispose).toHaveBeenCalledTimes(1)
    expect(mockShaderPassDispose).toHaveBeenCalledTimes(1)
    expect(mockEffectComposerDispose).toHaveBeenCalledTimes(2)
    expect(mockPlaneGeometryDispose).toHaveBeenCalledTimes(1)
    expect(mockSceneRemove).toHaveBeenCalledTimes(5)
    expect(mockRendererSetAnimationLoop).toHaveBeenCalledWith(null)
    expect(mockRendererForceContextLoss).toHaveBeenCalledTimes(1)
    expect(mockRendererDispose).toHaveBeenCalledTimes(1)
  })
})
