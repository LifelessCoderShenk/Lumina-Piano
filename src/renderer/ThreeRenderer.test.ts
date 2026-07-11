import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCanvasTextureDispose = vi.hoisted(() => vi.fn())
const mockMaterialColorSetHex = vi.hoisted(() => vi.fn())
const mockMeshBasicMaterialDispose = vi.hoisted(() => vi.fn())
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
const createdMeshMaterials = vi.hoisted(() => [] as Array<{ opacity: number }>)

vi.mock('three', () => {
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

  class OrthographicCamera {
    bottom = 1
    left = 0
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
    position = {
      set: vi.fn(),
    }
    rotation = {
      z: 0,
    }
    renderOrder = 0
    scale = {
      set: vi.fn(),
    }
    visible = true

    constructor(
      public geometry: unknown,
      public material: MeshBasicMaterial,
    ) {}
  }

  class Sprite {
    position = {
      set: vi.fn(),
    }
    rotation = {
      z: 0,
    }
    renderOrder = 0
    scale = {
      set: vi.fn(),
    }
    visible = true

    constructor(public material: SpriteMaterial) {}
  }

  class WebGLRenderer {
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
    CanvasTexture,
    Color,
    Group,
    Mesh,
    MeshBasicMaterial,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    Sprite,
    SpriteMaterial,
    WebGLRenderer,
  }
})

const { ThreeRenderer } = await import('./ThreeRenderer')

describe('ThreeRenderer', () => {
  beforeEach(() => {
    mockCanvasTextureDispose.mockReset()
    mockMaterialColorSetHex.mockReset()
    mockMeshBasicMaterialDispose.mockReset()
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
    expect(mockCameraUpdateProjectionMatrix).toHaveBeenCalled()
    expect(mockSceneAdd).toHaveBeenCalledTimes(4)
    expect(mockGroupAdd).toHaveBeenCalled()
    expect(renderer.getCanvas()).toBe(canvas)
    expect(renderer.getKeyX(60)).toBeGreaterThan(0)
    expect(renderer.getKeyboardY()).toBeGreaterThan(0)

    renderer.setKeyboardOpacity(0.4)
    renderer.setActiveKeyPitches([60])

    expect(mockMaterialColorSetHex).toHaveBeenCalled()
    expect(createdMeshMaterials.some((material) => Math.abs(material.opacity - 0.18) < 0.001)).toBe(true)
    expect(mockRendererRender).toHaveBeenCalled()
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
    expect(mockCanvasTextureDispose).toHaveBeenCalled()
    expect(mockMeshBasicMaterialDispose).toHaveBeenCalled()
    expect(mockSpriteMaterialDispose).toHaveBeenCalled()
    expect(mockPlaneGeometryDispose).toHaveBeenCalledTimes(1)
    expect(mockSceneRemove).toHaveBeenCalledTimes(4)
    expect(mockRendererSetAnimationLoop).toHaveBeenCalledWith(null)
    expect(mockRendererForceContextLoss).toHaveBeenCalledTimes(1)
    expect(mockRendererDispose).toHaveBeenCalledTimes(1)
  })
})
