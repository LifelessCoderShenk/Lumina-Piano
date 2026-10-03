/*
INPUT: ThreeRenderer with mocked WebGL and application state dependencies.
OUTPUT: Rendering behavior regression coverage without a browser GPU.
PURPOSE: Protects keyboard, visual-effect, postprocessing, and view-mode contracts at the renderer boundary.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CREATE_PITCH_CLASS_PALETTES } from '../store/createNoteColorPalettes'
import { getAppState, resetStore, useAppStore } from '../store/store'
import { spatialIndex } from '../spatial/SpatialIndex'

const mockBufferGeometryDispose = vi.hoisted(() => vi.fn())
const mockCanvasTextureDispose = vi.hoisted(() => vi.fn())
const mockCanvasFillRect = vi.hoisted(() => vi.fn())
const mockCanvasGradientAddColorStop = vi.hoisted(() => vi.fn())
const mockCanvasCreateLinearGradient = vi.hoisted(() => vi.fn(() => ({
  addColorStop: mockCanvasGradientAddColorStop,
})))
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
const createdMeshMaterials = vi.hoisted(() => [] as Array<{ map?: unknown; opacity: number }>)

vi.mock('three', () => {
  const AdditiveBlending = 'AdditiveBlending'
  const LinearFilter = 'LinearFilter'
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
    generateMipmaps = true
    magFilter: unknown = null
    minFilter: unknown = null
    needsUpdate = false

    constructor(public canvas: HTMLCanvasElement) {}

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
    value: number

    constructor(value: number) {
      this.value = value
    }

    setHex(value: number) {
      this.value = value
      mockMaterialColorSetHex(value)
      return this
    }
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
      value: 0,
      setHex: (value: number) => {
        this.color.value = value
        mockMaterialColorSetHex(value)
      },
    }
    needsUpdate = false
    map: unknown
    opacity: number
    toneMapped = true
    transparent: boolean

    constructor(options: { color?: number; map?: unknown; opacity?: number; transparent?: boolean }) {
      this.color.value = options.color ?? 0
      this.map = options.map
      this.opacity = options.opacity ?? 1
      this.transparent = options.transparent ?? false
      createdMeshMaterials.push(this)
    }

    dispose = mockMeshBasicMaterialDispose
  }

  class MeshLambertMaterial {
    color = {
      value: 0,
      setHex: (value: number) => {
        this.color.value = value
        mockMaterialColorSetHex(value)
      },
    }
    emissive = {
      value: 0,
      setHex: (value: number) => {
        this.emissive.value = value
        mockMaterialColorSetHex(value)
      },
    }
    emissiveIntensity: number
    needsUpdate = false
    opacity: number
    transparent: boolean
    userData: Record<string, unknown> = {}

    constructor(options: { color?: number; emissive?: number; emissiveIntensity?: number; opacity?: number; transparent?: boolean }) {
      this.color.value = options.color ?? 0
      this.emissive.value = options.emissive ?? 0
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
    fragmentShader: string
    needsUpdate = false
    transparent: boolean
    uniforms: Record<string, { value: unknown }>
    vertexShader: string

    constructor(options: {
      fragmentShader?: string
      transparent?: boolean
      uniforms?: Record<string, { value: unknown }>
      vertexShader?: string
    }) {
      this.fragmentShader = options.fragmentShader ?? ''
      this.transparent = options.transparent ?? false
      this.uniforms = options.uniforms ?? {}
      this.vertexShader = options.vertexShader ?? ''
    }

    dispose = mockShaderMaterialDispose
  }

  class Mesh {
    layers = {
      enable: vi.fn((channel: number) => {
        this.layers.mask |= (1 << channel)
        mockLayersEnable(channel)
      }),
      mask: 1,
      set: mockLayersSet,
    }
    position = {
      x: 0,
      y: 0,
      z: 0,
      set: vi.fn((x: number, y: number, z: number) => {
        this.position.x = x
        this.position.y = y
        this.position.z = z
      }),
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
    userData: Record<string, unknown> = {}
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
      enable: vi.fn((channel: number) => {
        this.layers.mask |= (1 << channel)
        mockLayersEnable(channel)
      }),
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
    LinearFilter,
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

const {
  DEFAULT_NOTE_BLOOM_CALIBRATION,
  ThreeRenderer,
  createNoteMaterialPalette,
  getColorLinearRelativeLuminance,
  getColorRelativeLuminance,
} = await import('./ThreeRenderer')
const { getKeyAtScreenX } = await import('./pianoMath')
const { resolveCreateModeNoteColor } = await import('./colorUtils')

describe('createNoteMaterialPalette', () => {
  const paletteCases = [
    { color: 0x4f8ef7, name: 'default blue' },
    { color: 0xff0000, name: 'saturated red' },
    { color: 0x00ff00, name: 'saturated green' },
    { color: 0x0000ff, name: 'saturated blue' },
    { color: 0xffff00, name: 'saturated yellow' },
    { color: 0x00ffff, name: 'saturated cyan' },
    { color: 0xff00ff, name: 'saturated magenta' },
    { color: 0xffffff, name: 'white' },
    { color: 0x000000, name: 'black' },
    { color: 0x050912, name: 'near black' },
    { color: 0x888888, name: 'gray' },
  ] as const

  const getEstimatedTotalLuminance = (
    diffuseColor: number,
    emissiveColor: number,
    emissiveStrength: number,
  ) => (
    getColorLinearRelativeLuminance(diffuseColor) +
    (getColorLinearRelativeLuminance(emissiveColor) * emissiveStrength)
  )
  const getChannelSpread = (color: number) => {
    const red = (color >> 16) & 0xff
    const green = (color >> 8) & 0xff
    const blue = color & 0xff

    return Math.max(red, green, blue) - Math.min(red, green, blue)
  }
  const getHaloBloomEnergy = (color: number) => {
    const palette = createNoteMaterialPalette(color)
    return getEstimatedTotalLuminance(
      palette.haloDiffuseColor,
      palette.haloEmissiveColor,
      palette.haloEmissiveStrength,
    )
  }
  // A compact CPU reference raster: it turns the material's actual HDR core /
  // edge radiance into pixels, then applies the current fixed bloom threshold
  // and strength. This catches spatial halo regressions that a scalar palette
  // energy assertion cannot see.
  const renderBloomMeasurement = (color: number, calibration = DEFAULT_NOTE_BLOOM_CALIBRATION) => {
    const palette = createNoteMaterialPalette(color, calibration)
    const coreRadiance = getEstimatedTotalLuminance(
      palette.coreDiffuseColor,
      palette.coreEmissiveColor,
      palette.coreEmissiveStrength,
    )
    const edgeRadiance = getEstimatedTotalLuminance(
      palette.haloDiffuseColor,
      palette.haloEmissiveColor,
      palette.haloEmissiveStrength,
    )
    const halfNoteWidth = 18
    const samples = Array.from({ length: 161 }, (_, index) => {
      const distance = Math.abs(index - 80)
      if (distance > halfNoteWidth) {
        return 0
      }
      const normalizedDistance = distance / halfNoteWidth
      const coreMix = 1 - (normalizedDistance * normalizedDistance)
      return edgeRadiance + ((coreRadiance - edgeRadiance) * coreMix)
    })
    const gaussianSigma = 6
    const bloomStrength = 0.7
    const bloomThreshold = 0.25
    const rendered = samples.map((source, index) => {
      let blurTotal = 0
      let weightTotal = 0
      for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
        const distance = sampleIndex - index
        const weight = Math.exp(-(distance * distance) / (2 * gaussianSigma * gaussianSigma))
        blurTotal += Math.max(0, samples[sampleIndex] - bloomThreshold) * weight
        weightTotal += weight
      }
      return source + ((blurTotal / weightTotal) * bloomStrength)
    })
    const footprintPixels = rendered.filter((value, index) => (
      Math.abs(index - 80) > halfNoteWidth && value > 0.11
    )).length

    return {
      centerIntensity: rendered[80],
      footprintPixels,
    }
  }

  it.each(paletteCases)('keeps total bloom luminance consistent for $name', ({ color }) => {
    const palette = createNoteMaterialPalette(color)
    const coreBloomLuminance = getEstimatedTotalLuminance(
      palette.coreDiffuseColor,
      palette.coreEmissiveColor,
      palette.coreEmissiveStrength,
    )
    const haloBloomLuminance = getEstimatedTotalLuminance(
      palette.haloDiffuseColor,
      palette.haloEmissiveColor,
      palette.haloEmissiveStrength,
    )

    expect(palette.coreEmissiveStrength).toBeGreaterThanOrEqual(0.2)
    expect(palette.coreEmissiveStrength).toBeLessThanOrEqual(8)
    expect(palette.haloEmissiveStrength).toBeGreaterThanOrEqual(0.45)
    expect(palette.haloEmissiveStrength).toBeLessThanOrEqual(8)
    expect(coreBloomLuminance).toBeGreaterThanOrEqual(0.8)
    expect(coreBloomLuminance).toBeLessThanOrEqual(1.06)
    expect(haloBloomLuminance).toBeGreaterThanOrEqual(1.19)
    expect(haloBloomLuminance).toBeLessThanOrEqual(1.23)
  })

  it.each(paletteCases)('preserves readable swirl contrast for $name', ({ color }) => {
    const palette = createNoteMaterialPalette(color)
    const haloLuminance = getColorRelativeLuminance(palette.haloDiffuseColor)
    const brightLuminance = getColorRelativeLuminance(palette.swirlBrightColor)
    const recessLuminance = getColorRelativeLuminance(palette.swirlRecessColor)

    expect(brightLuminance - haloLuminance).toBeGreaterThanOrEqual(0.075)
    expect(haloLuminance - recessLuminance).toBeGreaterThanOrEqual(0.19)
  })

  it.each(paletteCases)('keeps swirl bright total luminance below washout for $name', ({ color }) => {
    const palette = createNoteMaterialPalette(color)
    const swirlBrightTotalLuminance = getEstimatedTotalLuminance(
      palette.swirlBrightColor,
      palette.haloEmissiveColor,
      palette.haloEmissiveStrength,
    )

    expect(swirlBrightTotalLuminance).toBeGreaterThanOrEqual(1.25)
    expect(swirlBrightTotalLuminance).toBeLessThanOrEqual(1.42)
  })

  it('does not collapse white or black inputs to one flat palette color', () => {
    for (const color of [0xffffff, 0x000000]) {
      const palette = createNoteMaterialPalette(color)
      const uniquePaletteColors = new Set([
        palette.coreDiffuseColor,
        palette.haloDiffuseColor,
        palette.coreEmissiveColor,
        palette.haloEmissiveColor,
        palette.swirlBrightColor,
        palette.swirlRecessColor,
      ])

      expect(uniquePaletteColors.size).toBeGreaterThan(3)
    }
  })

  it('gives achromatic inputs enough channel headroom for swirl contrast', () => {
    for (const color of [0xffffff, 0x888888, 0x000000]) {
      const palette = createNoteMaterialPalette(color)

      expect(getChannelSpread(palette.haloDiffuseColor)).toBeGreaterThanOrEqual(36)
      expect(getChannelSpread(palette.swirlBrightColor)).toBeGreaterThanOrEqual(36)
      expect(getChannelSpread(palette.swirlRecessColor)).toBeGreaterThanOrEqual(36)
    }
  })

  it('preserves the material palette contrast for Gradient base colors', () => {
    const gradientColors = {
      mode: 'gradient' as const,
      pitchClassColors: {},
      singleColor: '#000000',
    }

    for (const position of [0, 0.5, 1]) {
      const palette = createNoteMaterialPalette(
        resolveCreateModeNoteColor(60, gradientColors, position),
      )
      const haloLuminance = getColorRelativeLuminance(palette.haloDiffuseColor)
      const brightLuminance = getColorRelativeLuminance(palette.swirlBrightColor)
      const recessLuminance = getColorRelativeLuminance(palette.swirlRecessColor)

      expect(brightLuminance - haloLuminance).toBeGreaterThanOrEqual(0.075)
      expect(haloLuminance - recessLuminance).toBeGreaterThanOrEqual(0.19)
    }
  })

  it('normalizes Gradient bloom energy across the keyboard spectrum', () => {
    const gradientColors = {
      mode: 'gradient' as const,
      pitchClassColors: {},
      singleColor: '#000000',
    }
    const bloomEnergies = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
      .map((position) => getHaloBloomEnergy(
        resolveCreateModeNoteColor(60, gradientColors, position),
      ))

    expect(Math.max(...bloomEnergies) - Math.min(...bloomEnergies)).toBeLessThan(0.03)
  })

  it('normalizes bloom energy across every curated pitch-class preset', () => {
    const bloomEnergies = CREATE_PITCH_CLASS_PALETTES.flatMap(({ colors }) => (
      Object.values(colors).map((hex) => getHaloBloomEnergy(Number.parseInt(hex.slice(1), 16)))
    ))

    expect(Math.max(...bloomEnergies) - Math.min(...bloomEnergies)).toBeLessThan(0.03)
  })

  it('keeps all Gradient and preset halo emissions above the bloom threshold', () => {
    const gradientColors = {
      mode: 'gradient' as const,
      pitchClassColors: {},
      singleColor: '#000000',
    }
    const colors = [0, 0.25, 0.5, 0.75, 1].map((position) => (
      resolveCreateModeNoteColor(60, gradientColors, position)
    ))
    CREATE_PITCH_CLASS_PALETTES.forEach(({ colors: paletteColors }) => {
      Object.values(paletteColors).forEach((hex) => {
        colors.push(Number.parseInt(hex.slice(1), 16))
      })
    })

    for (const color of colors) {
      const palette = createNoteMaterialPalette(color)
      const emissionEnergy = (
        getColorLinearRelativeLuminance(palette.haloEmissiveColor) * palette.haloEmissiveStrength
      )

      expect(emissionEnergy).toBeGreaterThan(0.25)
    }
  })

  it('renders a smaller, hue-consistent halo footprint for Gradient and every curated preset', () => {
    const preRecalibration = {
      ...DEFAULT_NOTE_BLOOM_CALIBRATION,
      coreEmissiveStrengthMax: 11.2,
      coreTargetTotalLuminance: 1.08,
      haloEmissiveStrengthMax: 11.2,
      haloTargetTotalLuminance: 1.58,
    }
    const gradientColors = {
      mode: 'gradient' as const,
      pitchClassColors: {},
      singleColor: '#000000',
    }
    const colors = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((position) => (
      resolveCreateModeNoteColor(60, gradientColors, position)
    ))
    CREATE_PITCH_CLASS_PALETTES.forEach(({ colors: paletteColors }) => {
      Object.values(paletteColors).forEach((hex) => colors.push(Number.parseInt(hex.slice(1), 16)))
    })

    const recalibrated = colors.map((color) => renderBloomMeasurement(color))
    const preFix = colors.map((color) => renderBloomMeasurement(color, preRecalibration))
    const footprints = recalibrated.map(({ footprintPixels }) => footprintPixels)
    const centerIntensities = recalibrated.map(({ centerIntensity }) => centerIntensity)

    expect(Math.max(...footprints)).toBeLessThan(Math.max(...preFix.map(({ footprintPixels }) => footprintPixels)))
    expect(Math.max(...footprints) - Math.min(...footprints)).toBeLessThanOrEqual(2)
    expect(Math.max(...centerIntensities) - Math.min(...centerIntensities)).toBeLessThan(0.3)
  })

})

describe('ThreeRenderer', () => {
  beforeEach(() => {
    mockBufferGeometryDispose.mockReset()
    mockCanvasTextureDispose.mockReset()
    mockCanvasFillRect.mockReset()
    mockCanvasGradientAddColorStop.mockReset()
    mockCanvasCreateLinearGradient.mockClear()
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
        beginPath: vi.fn(),
        closePath: vi.fn(),
        clearRect: vi.fn(),
        createLinearGradient: mockCanvasCreateLinearGradient,
        fill: vi.fn(),
        fillRect: mockCanvasFillRect,
        fillStyle: '#000000',
        fillText: vi.fn(),
        font: '',
        lineTo: vi.fn(),
        strokeText: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 7 }),
        moveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        scale: vi.fn(),
        textAlign: 'center',
        textBaseline: 'middle',
      } as unknown as CanvasRenderingContext2D
    })
    resetStore()
    vi.clearAllMocks()
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
    expect(mockRendererSetClearColor).toHaveBeenCalledWith(
      expect.objectContaining({ value: '#000000' }),
      1,
    )
    expect(mockRendererSetPixelRatio).toHaveBeenCalledWith(2)
    expect(mockRendererSetSize).toHaveBeenCalledWith(640, 360, false)
    expect(mockEffectComposerAddPass).toHaveBeenCalledTimes(5)
    expect(mockEffectComposerSetPixelRatio).toHaveBeenCalledWith(2)
    expect(mockEffectComposerSetSize).toHaveBeenCalledWith(640, 360)
    expect(mockCameraUpdateProjectionMatrix).toHaveBeenCalled()
    expect(mockSceneAdd).toHaveBeenCalledTimes(9)
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
    const keyboardHeightRatio = 270 / 720
    const keyboardHeight = 360 * keyboardHeightRatio
    const keyboardY = 360 - keyboardHeight
    const layoutScale = keyboardHeight / 270
    expect((renderer as any).bloomCompositePass.uniforms.bloomClipY.value).toBeCloseTo(
      1 - ((keyboardY + ((16 * layoutScale) / 2) + (3 * layoutScale)) / 360),
    )
    expect((renderer as any).bloomCompositePass.uniforms.bloomClipFeather.value).toBeCloseTo((3 * layoutScale) / 360)
    expect((renderer as any).bloomCompositePass.uniforms.bloomDebugLineHalfThickness.value).toBeCloseTo((0.5 * layoutScale) / 360)
    expect(mockMaterialColorSetHex).toHaveBeenCalled()
    const keyboardSurfaceMaterials = createdMeshMaterials.filter((material) => material.map != null)
    expect(keyboardSurfaceMaterials).toHaveLength(3)
    expect(keyboardSurfaceMaterials.every((material) => Math.abs(material.opacity - 0.4) < 0.001)).toBe(true)
    const keyboardTextures = (renderer as any).staticResources.filter(
      (resource: { canvas?: HTMLCanvasElement }) => resource.canvas != null,
    ) as Array<{
      canvas: HTMLCanvasElement
      generateMipmaps: boolean
      magFilter: unknown
      minFilter: unknown
      needsUpdate: boolean
    }>
    expect(keyboardTextures).toHaveLength(3)
    expect(keyboardTextures.every((texture) => texture.canvas.width === 1_280)).toBe(true)
    expect(keyboardTextures.every((texture) => texture.canvas.height === 270)).toBe(true)
    expect(keyboardTextures.every((texture) => texture.generateMipmaps === false)).toBe(true)
    expect(keyboardTextures.every((texture) => texture.minFilter === 'LinearFilter')).toBe(true)
    expect(keyboardTextures.every((texture) => texture.magFilter === 'LinearFilter')).toBe(true)
    expect(keyboardTextures.every((texture) => texture.needsUpdate)).toBe(true)
    expect(mockCanvasCreateLinearGradient).toHaveBeenCalled()
    expect(mockCanvasGradientAddColorStop).toHaveBeenCalled()
    expect(mockCanvasFillRect).toHaveBeenCalled()
    expect(mockLayersSet).toHaveBeenCalled()
    expect(mockEffectComposerRender).toHaveBeenCalled()
    expect((renderer as any).particleSystem.geometry.drawRange.count).toBe(0)
    expect((renderer as any).particleSystem.positionAttribute.array.length).toBe(4_096 * 3)
  })

  it('lets isolated live MIDI notes finish falling after release without changing file playback data', async () => {
    loadProjectWithNotes([
      {
        endTick: 480,
        id: 'file-note',
        pitch: 64,
        startTick: 0,
        velocity: 100,
        visualEndTick: 480,
      },
    ])
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    const projectBefore = useAppStore.getState().projectData
    const indexedNoteCountBefore = spatialIndex.getTotalNoteCount()
    const currentTickBefore = useAppStore.getState().currentTick
    const startedAtMs = performance.now()
    renderer.setLiveMidiNotes([
      { id: '0:60', pitch: 60, startedAtMs, velocity: 100 },
      { id: '0:64', pitch: 64, startedAtMs, velocity: 100 },
    ])

    expect((renderer as any).liveNoteMeshes).toHaveLength(2)
    expect((renderer as any).liveNoteMeshes[0].visible).toBe(true)
    expect((renderer as any).liveNoteMeshes[1].visible).toBe(true)
    expect(useAppStore.getState().projectData).toBe(projectBefore)
    expect(spatialIndex.getTotalNoteCount()).toBe(indexedNoteCountBefore)
    expect(useAppStore.getState().currentTick).toBe(currentTickBefore)

    renderer.setLiveMidiNotes([])

    renderer.renderFrame(0, { animationTimeSeconds: (startedAtMs + 699) / 1000 })
    expect((renderer as any).liveNoteMeshes[0].visible).toBe(true)
    expect((renderer as any).liveNoteMeshes[1].visible).toBe(true)

    renderer.renderFrame(0, { animationTimeSeconds: (startedAtMs + 701) / 1000 })
    expect((renderer as any).liveNoteMeshes[0].visible).toBe(false)
    expect((renderer as any).liveNoteMeshes[1].visible).toBe(false)
    expect(useAppStore.getState().projectData).toBe(projectBefore)
    expect(spatialIndex.getTotalNoteCount()).toBe(indexedNoteCountBefore)
  })

  it('updates the scene background and rebuilds keyboard note-name sprites from appearance settings', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })

    await renderer.init(canvas)

    expect((renderer as any).keyboardLabelSprites).toHaveLength(0)
    useAppStore.getState().setBackgroundColor('#393939')
    expect(mockRendererSetClearColor).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: '#393939' }),
      1,
    )

    useAppStore.getState().setNoteLabelsOnKeys(false)
    expect((renderer as any).keyboardLabelSprites).toHaveLength(0)
    useAppStore.getState().setNoteLabelsOnKeys(true)
    expect((renderer as any).keyboardLabelSprites).toHaveLength(88)
  })

  it('switches the animated background material without rebuilding the scene', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    const material = (renderer as any).backgroundMesh.material as {
      fragmentShader: string
      uniforms: {
        backgroundAspect: { value: number }
        backgroundStyle: { value: number }
      }
    }
    expect(material.uniforms.backgroundStyle.value).toBe(0)
    expect(material.uniforms.backgroundAspect.value).toBeCloseTo(640 / 360)

    useAppStore.getState().setBackgroundStyle('aurora')

    expect(material.uniforms.backgroundStyle.value).toBe(2)
    expect(material.fragmentShader).toContain('ribbonA')
    expect(material.fragmentShader).toContain('studioColor')

    useAppStore.getState().setBackgroundStyle('stage')

    expect(material.uniforms.backgroundStyle.value).toBe(3)
    expect(material.fragmentShader).toContain('stagePerspectiveDepth')
    expect(material.fragmentShader).toContain('stageHorizontalGrid')
  })

  it('renders only the static keyboard in guide mode without mutating playback data', async () => {
    loadProjectWithNotes([
      { endTick: 480, id: 'file-note', pitch: 64, startTick: 0, velocity: 100, visualEndTick: 480 },
    ])
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    const projectBefore = useAppStore.getState().projectData
    renderer.setLiveMidiNotes([{ id: 'guide-live', pitch: 60, startedAtMs: performance.now(), velocity: 100 }])
    renderer.setGuideOnly(true)

    expect((renderer as any).visibleNoteMeshCount).toBe(0)
    expect((renderer as any).visibleLiveNoteMeshCount).toBe(0)
    expect((renderer as any).particleSystem.geometry.drawRange.count).toBe(0)
    expect((renderer as any).waveGroup.visible).toBe(false)
    expect(useAppStore.getState().projectData).toBe(projectBefore)

    renderer.setGuideOnly(false)
    expect((renderer as any).waveGroup.visible).toBe(true)
  })

  it('renders ghost hands from the project timeline only when the feature is enabled', async () => {
    loadProjectWithNotes([
      { endTick: 480, id: 'hand-note', pitch: 64, startTick: 240, velocity: 100, visualEndTick: 480 },
    ])
    useAppStore.getState().setHandVisualization({ enabled: true, opacity: 42 })
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })

    await renderer.init(canvas)
    renderer.renderFrame(240)

    const layer = (renderer as any).ghostHandsLayer
    expect(layer.group.visible).toBe(true)
    expect(layer.hands.right.group.visible).toBe(true)
    expect(layer.hands.right.material.uniforms.ghostOpacity.value).toBeCloseTo(0.42)

    renderer.setKeyboardOnly(true)
    expect(layer.group.visible).toBe(false)

    renderer.setKeyboardOnly(false)
    expect(layer.group.visible).toBe(true)

    useAppStore.getState().setHandVisualization({ enabled: false })
    expect(layer.group.visible).toBe(false)
  })

  it('keeps ghost hands deterministic through seeking, loop-back, portrait export, and live toggles', async () => {
    loadProjectWithNotes([
      { endTick: 480, id: 'loop-hand', pitch: 48, startTick: 240, velocity: 100, visualEndTick: 480 },
      { endTick: 1_200, id: 'seek-hand', pitch: 84, startTick: 960, velocity: 100, visualEndTick: 1_200 },
    ])
    useAppStore.getState().setHandVisualization({ enabled: true, opacity: 40 })
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)
    const layer = (renderer as any).ghostHandsLayer
    const visibleContacts = () => ['left', 'right'].flatMap((hand) => (
      Object.values(layer.hands[hand].contactNodes) as Array<{
        position: { x: number; y: number }
        visible: boolean
      }>
    )).filter(({ visible }) => visible)

    renderer.renderFrame(240)
    const loopContact = visibleContacts()[0]
    expect(loopContact).toBeDefined()
    const initialLoopPosition = { x: loopContact.position.x, y: loopContact.position.y }

    renderer.renderFrame(700)
    expect(visibleContacts()).toHaveLength(0)
    renderer.renderFrame(240)
    expect(visibleContacts()[0]?.position).toMatchObject(initialLoopPosition)

    renderer.setReviewTimelineTick(960)
    expect(visibleContacts()).toHaveLength(1)
    expect(visibleContacts()[0].position.x).not.toBe(initialLoopPosition.x)
    renderer.setReviewTimelineTick(null)
    expect(visibleContacts()[0]?.position).toMatchObject(initialLoopPosition)

    renderer.beginOfflineRender()
    renderer.resize(1_080, 1_920, { layoutContext: { keyboardHeightRatio: 0.375 } })
    renderer.renderFrame(240, { animationTimeSeconds: 0 })
    const portraitPalm = layer.hands.left.group.visible
      ? layer.hands.left.palm
      : layer.hands.right.palm
    expect(portraitPalm.position.x - portraitPalm.scale.x / 2).toBeGreaterThanOrEqual(0)
    expect(portraitPalm.position.x + portraitPalm.scale.x / 2).toBeLessThanOrEqual(1_080)

    useAppStore.getState().setHandVisualization({ enabled: false })
    expect(layer.group.visible).toBe(false)
    useAppStore.getState().setHandVisualization({ enabled: true })
    expect(layer.group.visible).toBe(true)
    expect(visibleContacts()).toHaveLength(1)
    renderer.endOfflineRender()
  })

  it('accepts Transcriptor keyboard-only state before a canvas has initialized', () => {
    const renderer = new ThreeRenderer()

    expect(() => renderer.setKeyboardOnly(true)).not.toThrow()
    expect((renderer as any).keyboardOnly).toBe(true)
    expect(() => renderer.setKeyboardOnly(false)).not.toThrow()
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

  it('shows keyboard beams only when enabled and follows the key highlight fade', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    const saberState = (renderer as any).keyboardSaberStates.get(60) as {
      uniforms: { beamStrength: { value: number } }
    }
    ;(renderer as any).playbackActiveKeyPitches = new Set([60])
    ;(renderer as any).applyActiveKeyHighlights(1)
    ;(renderer as any).applyActiveKeyHighlights(1.06)

    expect(saberState.uniforms.beamStrength.value).toBe(0)

    useAppStore.getState().setKeyboardSaber(true)
    ;(renderer as any).applyActiveKeyHighlights(1.07)

    expect(saberState.uniforms.beamStrength.value).toBeCloseTo(1)

    useAppStore.getState().setKeyboardSaber(false)
    expect(saberState.uniforms.beamStrength.value).toBe(0)

    await renderer.destroy()
  })

  it('adds independently adjustable reactive lighting behind active keys', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)
    const layer = (renderer as any).reactiveLightingLayer

    expect(layer.group.visible).toBe(false)
    ;(renderer as any).playbackActiveKeyPitches = new Set([60])
    ;(renderer as any).applyActiveKeyHighlights(1)
    ;(renderer as any).applyActiveKeyHighlights(1.06)

    expect(layer.group.visible).toBe(true)
    expect(layer.lights.some(({ mesh }: { mesh: { visible: boolean } }) => mesh.visible)).toBe(true)

    useAppStore.getState().setLightingIntensity(0)
    ;(renderer as any).applyActiveKeyHighlights(1.07)
    expect(layer.group.visible).toBe(false)

    useAppStore.getState().setLightingIntensity(100)
    renderer.setKeyboardOnly(true)
    expect(layer.group.visible).toBe(false)
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

  it('advances playback-driven key highlight fades from simulated renderFrame time during export', async () => {
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
        endTick: 120,
        id: 'export-highlight',
        pitch: 60,
        startTick: 0,
        velocity: 127,
        visualEndTick: 120,
      },
    ])

    await renderer.init(canvas)

    const highlightState = (renderer as any).keyHighlightStates.get(60) as {
      material: { opacity: number }
    }

    renderer.renderFrame(0, { animationTimeSeconds: 0 })
    expect(highlightState.material.opacity).toBeCloseTo(0, 3)

    renderer.renderFrame(0, { animationTimeSeconds: 0.03 })
    expect(highlightState.material.opacity).toBeGreaterThan(0)
    expect(highlightState.material.opacity).toBeLessThan(0.45)

    renderer.renderFrame(0, { animationTimeSeconds: 0.06 })
    expect(highlightState.material.opacity).toBeCloseTo(0.45, 3)

    renderer.renderFrame(121, { animationTimeSeconds: 0.12 })
    expect(highlightState.material.opacity).toBeCloseTo(0.45, 3)

    renderer.renderFrame(121, { animationTimeSeconds: 0.21 })
    expect(highlightState.material.opacity).toBeGreaterThan(0)
    expect(highlightState.material.opacity).toBeLessThan(0.45)

    renderer.renderFrame(121, { animationTimeSeconds: 0.3 })
    expect(highlightState.material.opacity).toBeCloseTo(0, 3)
  })

  it('suspends and restores the WebGL animation loop for offline rendering', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 800,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 400,
    })

    await renderer.init(canvas)

    ;(renderer as any).particleBurstSerial = 27
    ;(renderer as any).lastParticleUpdateTimeSeconds = 4.2
    ;(renderer as any).particleSystem.activeCount = 12
    ;(renderer as any).particleSystem.geometry.drawRange.count = 12
    mockRendererSetAnimationLoop.mockClear()

    renderer.beginOfflineRender()
    expect(mockRendererSetAnimationLoop).toHaveBeenNthCalledWith(1, null)
    expect((renderer as any).particleBurstSerial).toBe(0)
    expect(Number.isNaN((renderer as any).lastParticleUpdateTimeSeconds)).toBe(true)
    expect((renderer as any).particleSystem.activeCount).toBe(0)
    expect((renderer as any).particleSystem.geometry.drawRange.count).toBe(0)

    renderer.endOfflineRender()
    expect(mockRendererSetAnimationLoop).toHaveBeenNthCalledWith(2, expect.any(Function))
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
      value: 1200,
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

  it('spawns non-bloom impact reflections on note hits and fades them out over time', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 1200,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 480,
        id: 'reflection-note',
        pitch: 60,
        startTick: 240,
        velocity: 127,
        visualEndTick: 480,
      },
    ])

    await renderer.init(canvas)

    const reflectionState = (renderer as any).impactReflectionStates.get(60) as {
      currentStrength: number
      mesh: { layers: { mask: number } }
      uniforms: {
        reflectionColor: { value: { value: number } }
        reflectionStrength: { value: number }
      }
    }

    expect(reflectionState.uniforms.reflectionStrength.value).toBe(0)
    expect(reflectionState.mesh.layers.mask).toBe(1)
    expect(reflectionState.uniforms.reflectionColor.value.value).toBe(0x4f8ef7)

    useAppStore.setState({ currentTick: 239 })
    ;(renderer as any).handleAnimationFrame(1000)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 240 })
    ;(renderer as any).handleAnimationFrame(1032)

    const strengthAtImpact = reflectionState.uniforms.reflectionStrength.value
    expect(strengthAtImpact).toBeGreaterThan(0.9)

    ;(renderer as any).handleAnimationFrame(1112)
    expect(reflectionState.uniforms.reflectionStrength.value).toBeGreaterThan(0)
    expect(reflectionState.uniforms.reflectionStrength.value).toBeLessThan(strengthAtImpact)

    ;(renderer as any).handleAnimationFrame(1280)
    expect(reflectionState.currentStrength).toBe(0)
    expect(reflectionState.uniforms.reflectionStrength.value).toBe(0)
  })

  it('recolors visible notes, key highlights, impact reflections, wave segments, and active particles when Create Mode colors change', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 1200,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 360,
    })

    loadProjectWithNotes([
      {
        endTick: 480,
        id: 'recolor-note',
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

    const visibleNoteMesh = ((renderer as any).noteMeshes as Array<{
      material: {
        userData: {
          noteMaterialColor: number
        }
      }
      visible: boolean
    }>).find((noteMesh) => noteMesh.visible)
    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      colors: Float32Array
    }
    const keyHighlightState = (renderer as any).keyHighlightStates.get(60) as {
      material: {
        color: { value: number }
      }
    }
    const impactReflectionState = (renderer as any).impactReflectionStates.get(60) as {
      uniforms: {
        reflectionColor: { value: { value: number } }
      }
    }
    const waveSamplePoints = (renderer as any).waveSamplePoints as number[]
    const cWaveSegmentIndex = waveSamplePoints.findIndex((x0, index) =>
      index < waveSamplePoints.length - 1 &&
      getKeyAtScreenX((x0 + waveSamplePoints[index + 1]) / 2, 1200) === 60,
    )
    const waveLayers = (renderer as any).waveLayers as Array<{
      definition: { role: 'core' | 'mid' | 'outer' }
      materials: Array<{
        color: { value: number }
        emissive: { value: number }
      }>
    }>

    expect(visibleNoteMesh).toBeDefined()
    expect(visibleNoteMesh?.material.userData.noteMaterialColor).toBe(0x4f8ef7)
    expect(particleSystem.activeCount).toBeGreaterThan(0)
    expect(cWaveSegmentIndex).toBeGreaterThanOrEqual(0)

    const originalMaterial = visibleNoteMesh?.material
    const rebuildStaticSceneSpy = vi.spyOn(renderer as any, 'rebuildStaticScene')
    const updateVisibleNoteMaterialColorsSpy = vi.spyOn(renderer as any, 'updateVisibleNoteMaterialColors')
    mockMeshLambertMaterialDispose.mockClear()

    useAppStore.getState().setCreateSingleNoteColor('#00ff00')
    useAppStore.getState().setCreateSingleNoteColor('#ff0000')

    expect(updateVisibleNoteMaterialColorsSpy).not.toHaveBeenCalled()
    ;(renderer as any).handleAnimationFrame(1048)

    expect(visibleNoteMesh?.material.userData.noteMaterialColor).toBe(0xff0000)
    expect(visibleNoteMesh?.material).toBe(originalMaterial)
    expect(mockMaterialColorSetHex).toHaveBeenCalledWith(0xff0000)
    expect(rebuildStaticSceneSpy).not.toHaveBeenCalled()
    expect(updateVisibleNoteMaterialColorsSpy).toHaveBeenCalledTimes(1)
    expect(mockMeshLambertMaterialDispose).not.toHaveBeenCalled()
    expect(particleSystem.colors[0]).toBeCloseTo(1, 6)
    expect(particleSystem.colors[1]).toBeCloseTo(0, 6)
    expect(particleSystem.colors[2]).toBeCloseTo(0, 6)
    expect(keyHighlightState.material.color.value).toBe(0xff0000)
    expect(impactReflectionState.uniforms.reflectionColor.value.value).toBe(0xff0000)

    const singleModePalette = createNoteMaterialPalette(0xff0000)
    const outerWaveLayer = waveLayers.find((layer) => layer.definition.role === 'outer')
    const midWaveLayer = waveLayers.find((layer) => layer.definition.role === 'mid')
    const coreWaveLayer = waveLayers.find((layer) => layer.definition.role === 'core')
    expect(outerWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(singleModePalette.coreDiffuseColor)
    expect(midWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(singleModePalette.haloDiffuseColor)
    expect(coreWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(singleModePalette.haloEmissiveColor)

    const aurora = CREATE_PITCH_CLASS_PALETTES.find((palette) => palette.id === 'aurora')!
    useAppStore.getState().setCreateNoteColorMode('pitchClass')
    useAppStore.getState().setCreatePitchClassColors(aurora.colors)
    ;(renderer as any).handleAnimationFrame(1064)

    useAppStore.setState({ currentTick: 239 })
    ;(renderer as any).handleAnimationFrame(1080)
    useAppStore.setState({ currentTick: 240 })
    ;(renderer as any).handleAnimationFrame(1096)

    const auroraColor = Number.parseInt(aurora.colors[0].slice(1), 16)
    const pitchClassPalette = createNoteMaterialPalette(auroraColor)
    expect(visibleNoteMesh?.material.userData.noteMaterialColor).toBe(auroraColor)
    expect(keyHighlightState.material.color.value).toBe(auroraColor)
    expect(impactReflectionState.uniforms.reflectionColor.value.value).toBe(auroraColor)
    expect(outerWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(pitchClassPalette.coreDiffuseColor)
    expect(midWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(pitchClassPalette.haloDiffuseColor)
    expect(coreWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(pitchClassPalette.haloEmissiveColor)

    useAppStore.getState().setCreateNoteColorMode('gradient')
    ;(renderer as any).handleAnimationFrame(1112)

    const gradientColor = resolveCreateModeNoteColor(
      60,
      useAppStore.getState().createNoteColors,
      (renderer as any).getNormalizedKeyboardPosition(60),
    )
    const gradientPalette = createNoteMaterialPalette(gradientColor)
    const gradientRed = (gradientColor >> 16) & 0xff
    const gradientGreen = (gradientColor >> 8) & 0xff
    const gradientBlue = gradientColor & 0xff

    expect(visibleNoteMesh?.material.userData.noteMaterialColor).toBe(gradientColor)
    expect(keyHighlightState.material.color.value).toBe(gradientColor)
    expect(impactReflectionState.uniforms.reflectionColor.value.value).toBe(gradientColor)
    expect(outerWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(gradientPalette.coreDiffuseColor)
    expect(midWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(gradientPalette.haloDiffuseColor)
    expect(coreWaveLayer?.materials[cWaveSegmentIndex].color.value).toBe(gradientPalette.haloEmissiveColor)
    expect((particleSystem as { pitches: Int8Array }).pitches[0]).toBe(60)
    expect(particleSystem.colors[0]).toBeCloseTo(gradientRed / 0xff, 6)
    expect(particleSystem.colors[1]).toBeCloseTo(gradientGreen / 0xff, 6)
    expect(particleSystem.colors[2]).toBeCloseTo(gradientBlue / 0xff, 6)

    useAppStore.getState().setParticleSettings({ colorMode: 'custom', customColor: '#336699' })

    expect(particleSystem.colors[0]).toBeCloseTo(0x33 / 0xff, 6)
    expect(particleSystem.colors[1]).toBeCloseTo(0x66 / 0xff, 6)
    expect(particleSystem.colors[2]).toBeCloseTo(0x99 / 0xff, 6)
    expect(visibleNoteMesh?.material.userData.noteMaterialColor).toBe(gradientColor)
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
      noteSwirlBrightColor: { value: unknown }
      noteSwirlRecessColor: { value: unknown }
      noteMaterialTime: { value: number }
      roundedRectRadius: { value: number }
      roundedRectSize: { value: { x: number; y: number } }
    }
    const expectedPalette = createNoteMaterialPalette(0x4f8ef7)

    expect(roundedNoteUniforms.noteMaterialTime.value).toBeCloseTo((renderer as any).noteMaterialTimeSeconds, 6)
    expect(roundedNoteUniforms.noteMaterialTime.value).toBeGreaterThanOrEqual(0)
    expect(roundedNoteUniforms.noteCoreDiffuseColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteHaloDiffuseColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteCoreEmissiveColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteHaloEmissiveColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteSwirlBrightColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteSwirlRecessColor.value).toBeDefined()
    expect(roundedNoteUniforms.noteCoreEmissiveStrength.value).toBeCloseTo(expectedPalette.coreEmissiveStrength)
    expect(roundedNoteUniforms.noteHaloEmissiveStrength.value).toBeCloseTo(expectedPalette.haloEmissiveStrength)
    expect(roundedNoteUniforms.roundedRectSize.value.x).toBe(12)
    expect(roundedNoteUniforms.roundedRectSize.value.y).toBe(6)
    expect(roundedNoteUniforms.roundedRectRadius.value).toBeCloseTo(1.08)
  })

  it('updates existing note materials when style and glow change', async () => {
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
      noteGlowStrength: { value: number }
      noteStyleMode: { value: number }
    }

    expect(roundedNoteUniforms.noteStyleMode.value).toBe(1)
    expect(roundedNoteUniforms.noteGlowStrength.value).toBe(1)

    useAppStore.getState().setNoteStyle('saber')
    useAppStore.getState().setNoteGlow(160)
    useAppStore.getState().setNoteOpacity(72)

    expect(roundedNoteUniforms.noteStyleMode.value).toBe(2)
    expect(roundedNoteUniforms.noteGlowStrength.value).toBeCloseTo(1.6)
    expect(noteMesh.material.opacity).toBeCloseTo(0.72)

    useAppStore.getState().setNoteStyle('outline')
    expect(roundedNoteUniforms.noteStyleMode.value).toBe(3)

    useAppStore.getState().setNoteStyle('crystal')
    expect(roundedNoteUniforms.noteStyleMode.value).toBe(4)

    useAppStore.getState().setNoteStyle('gem')
    expect(roundedNoteUniforms.noteStyleMode.value).toBe(5)

    await renderer.destroy()
  })

  it('keeps diffuse and emissive note shading independent of fall position', async () => {
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
    const shader = {
      fragmentShader: `#include <common>
void main() {
  vec4 diffuseColor = vec4( diffuse, opacity );
  vec3 totalEmissiveRadiance = emissive;
}`,
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: `#include <common>
void main() {
  #include <uv_vertex>
}`,
    }

    noteMesh.material.onBeforeCompile?.(shader as {
      fragmentShader: string
      uniforms: Record<string, { value: unknown }>
      vertexShader: string
    })

    expect(shader.uniforms.noteDistanceFromBoundary).toBeUndefined()
    expect(shader.fragmentShader).not.toContain('noteDepthFade')
    expect(shader.fragmentShader).not.toContain('noteDepthBrightnessScale')
    expect(shader.fragmentShader).not.toContain('noteDepthDesaturation')
    expect(shader.fragmentShader).toContain('noteFaceColor *= 0.68;')
    expect(shader.fragmentShader).toContain('roundedNoteEmissiveRadiance *= 0.68;')
    expect(shader.fragmentShader).toContain('noteMaterialTime')
    expect(shader.fragmentShader).toContain('noteSwirlBrightField')
    expect(shader.fragmentShader).toContain('noteOutlineMask')
    expect(shader.fragmentShader).toContain('noteCrystalFacetLight')
    expect(shader.fragmentShader).toContain('noteGemCenterRidge')
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

  it('does not emit particle bursts while particles are disabled', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    useAppStore.getState().setParticleSettings({ enabled: false })
    loadProjectWithNotes([
      { endTick: 480, id: 'particles-disabled', pitch: 60, startTick: 240, velocity: 127, visualEndTick: 480 },
    ])

    await renderer.init(canvas)
    useAppStore.setState({ currentTick: 239 })
    ;(renderer as any).handleAnimationFrame(1000)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as any).handleAnimationFrame(1016)
    useAppStore.setState({ currentTick: 240 })
    ;(renderer as any).handleAnimationFrame(1032)

    expect((renderer as any).particleSystem.activeCount).toBe(0)
  })

  it('scales density, size, speed, spread, lifetime, and glow for new bursts', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    const baseSettings = getAppState().particleSettings
    const indexedNote = {
      note: { endTick: 480, id: 'particle-controls', pitch: 60, startTick: 240, velocity: 127, visualEndTick: 480 },
    }
    const emit = (patch: Partial<typeof baseSettings>) => {
      useAppStore.getState().setParticleSettings({ ...baseSettings, ...patch })
      ;(renderer as any).clearParticleSystem(false)
      ;(renderer as any).particleBurstSerial = 0
      ;(renderer as any).emitBurstForNote(indexedNote, getAppState().particleSettings)
      const particleSystem = (renderer as any).particleSystem as {
        activeCount: number
        baseBrightnesses: Float32Array
        baseSizes: Float32Array
        lifetimes: Float32Array
        velocities: Float32Array
      }
      return {
        activeCount: particleSystem.activeCount,
        baseBrightness: particleSystem.baseBrightnesses[0],
        baseSize: particleSystem.baseSizes[0],
        lifetime: particleSystem.lifetimes[0],
        velocityX: particleSystem.velocities[0],
        velocityY: particleSystem.velocities[1],
      }
    }

    const baseline = emit({})
    const density = emit({ density: 200 })
    const size = emit({ size: 200 })
    const speed = emit({ speed: 200 })
    const spread = emit({ spread: 0 })
    const lifetime = emit({ lifetime: 200 })
    const glow = emit({ glow: 200 })

    expect(density.activeCount).toBe(baseline.activeCount * 2)
    expect(size.baseSize).toBeCloseTo(baseline.baseSize * 2, 6)
    expect(speed.velocityY).toBeCloseTo(baseline.velocityY * 2, 6)
    expect(spread.velocityX).toBe(0)
    expect(Math.abs(baseline.velocityX)).toBeGreaterThan(0)
    expect(lifetime.lifetime).toBeCloseTo(baseline.lifetime * 2, 6)
    expect(glow.baseBrightness).toBeCloseTo(baseline.baseBrightness * 2, 6)
  })

  it('keeps velocity-oriented Wisp trails after motion settings are edited', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    useAppStore.getState().setParticlePreset('wisp')
    ;(renderer as any).emitBurstForNote(
      {
        note: { endTick: 480, id: 'wisp-trail', pitch: 60, startTick: 240, velocity: 127, visualEndTick: 480 },
      },
      getAppState().particleSettings,
    )
    ;(renderer as any).syncParticleMaterialAnimationTime()

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      geometry: { attributes: Record<string, { array: Float32Array }> }
      material: { fragmentShader: string; vertexShader: string }
      uniforms: { wispMode: { value: number } }
      velocities: Float32Array
    }

    expect(particleSystem.activeCount).toBeGreaterThan(0)
    expect(particleSystem.geometry.attributes.aVelocity.array).toBe(particleSystem.velocities)
    expect(particleSystem.uniforms.wispMode.value).toBe(1)
    expect(particleSystem.material.vertexShader).toContain('attribute vec3 aVelocity')
    expect(particleSystem.material.vertexShader).toContain('vWispStretch')
    expect(particleSystem.material.fragmentShader).toContain('wispTail')
    expect(particleSystem.material.fragmentShader).toContain('wispMask')

    useAppStore.getState().setParticleSettings({ speed: 189 })
    ;(renderer as any).syncParticleMaterialAnimationTime()

    expect(particleSystem.uniforms.wispMode.value).toBe(1)
    expect(particleSystem.activeCount).toBeGreaterThan(0)
  })

  it('switches active particles to the Ray shader shape immediately', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    useAppStore.getState().setParticleSettings({ style: 'ray' })
    ;(renderer as any).syncParticleMaterialAnimationTime()

    const particleSystem = (renderer as any).particleSystem as {
      material: { fragmentShader: string }
      uniforms: { wispMode: { value: number } }
    }
    expect(particleSystem.uniforms.wispMode.value).toBe(2)
    expect(particleSystem.material.fragmentShader).toContain('rayMask')
    expect(particleSystem.material.fragmentShader).toContain('rayCore')
  })

  it('emits particle bursts during offline export frames without relying on live playback state', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 1280,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 720,
    })

    loadProjectWithNotes([
      {
        endTick: 360,
        id: 'offline-burst-note',
        pitch: 60,
        startTick: 240,
        velocity: 127,
        visualEndTick: 360,
      },
    ])

    await renderer.init(canvas)
    renderer.beginOfflineRender()
    ;(renderer as any).hasPendingSeekSuppression = true
    ;(renderer as any).lastBurstDetectionTick = 9_999

    renderer.renderFrame(239, { animationTimeSeconds: 0 })
    renderer.renderFrame(240, { animationTimeSeconds: 1 / 30 })

    const particleSystem = (renderer as any).particleSystem as {
      activeCount: number
      geometry: { drawRange: { count: number } }
    }

    expect(particleSystem.activeCount).toBe(60)
    expect(particleSystem.geometry.drawRange.count).toBe(60)
  })

  it('advances the Create-mode boundary wave during offline export frames', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 1280,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 720,
    })

    await renderer.init(canvas)
    renderer.beginOfflineRender()

    const updateWaveMeshesSpy = vi.spyOn(renderer as any, 'updateWaveMeshes')
    updateWaveMeshesSpy.mockClear()

    renderer.renderFrame(0, { animationTimeSeconds: 0 })
    expect((renderer as any).boundaryWaveTime).toBeCloseTo(0, 6)

    renderer.renderFrame(0, { animationTimeSeconds: 1 / 30 })

    expect((renderer as any).boundaryWaveTime).toBeCloseTo(0.04, 6)
    expect(updateWaveMeshesSpy).toHaveBeenCalledTimes(2)
  })

  it('keeps the export canvas at DPR 1 while supersampling postprocessing internally', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', {
      configurable: true,
      value: 1280,
    })
    Object.defineProperty(canvas, 'clientHeight', {
      configurable: true,
      value: 720,
    })

    await renderer.init(canvas)
    mockRendererSetPixelRatio.mockClear()
    mockRendererSetSize.mockClear()
    mockEffectComposerSetPixelRatio.mockClear()
    mockEffectComposerSetSize.mockClear()

    renderer.resize(1920, 1080, {
      pixelRatio: 1,
      postprocessScale: 2,
    })

    const particleSystem = (renderer as any).particleSystem as {
      uniforms: { pixelRatio: { value: number } }
    }

    expect(mockRendererSetPixelRatio).toHaveBeenCalledWith(1)
    expect(mockRendererSetSize).toHaveBeenCalledWith(1920, 1080, false)
    expect(mockEffectComposerSetPixelRatio).toHaveBeenNthCalledWith(1, 2)
    expect(mockEffectComposerSetPixelRatio).toHaveBeenNthCalledWith(2, 2)
    expect(mockEffectComposerSetSize).toHaveBeenNthCalledWith(1, 1920, 1080)
    expect(mockEffectComposerSetSize).toHaveBeenNthCalledWith(2, 1920, 1080)
    expect(particleSystem.uniforms.pixelRatio.value).toBe(2)
  })

  it('does not rebuild GPU resources when resize receives the current dimensions and render settings', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 1280 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 720 })

    await renderer.init(canvas)
    mockRendererSetSize.mockClear()
    mockEffectComposerSetSize.mockClear()
    const rebuildStaticScene = vi.spyOn(renderer as any, 'rebuildStaticScene')
    const rebuildWaveMeshes = vi.spyOn(renderer as any, 'rebuildWaveMeshes')

    renderer.resize(1280, 720)

    expect(mockRendererSetSize).not.toHaveBeenCalled()
    expect(mockEffectComposerSetSize).not.toHaveBeenCalled()
    expect(rebuildStaticScene).not.toHaveBeenCalled()
    expect(rebuildWaveMeshes).not.toHaveBeenCalled()
  })

  it.each([
    [1280, 720, 270],
    [1920, 1080, 270],
    [3840, 2160, 270],
  ])('keeps composer dimensions and the compact live keyboard aligned at %ix%i', async (width, height, keyboardHeight) => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')

    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 1280 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 720 })
    await renderer.init(canvas)
    mockEffectComposerSetSize.mockClear()

    renderer.resize(width, height, { pixelRatio: 1, postprocessScale: 1 })

    expect(renderer.getKeyboardY()).toBe(height - keyboardHeight)
    expect(renderer.getRenderLayoutContext().keyboardHeightRatio).toBeCloseTo(keyboardHeight / height)
    expect(renderer.getRenderLayoutContext().preserveKeyboardHeightRatio).toBe(true)
    expect(mockEffectComposerSetSize).toHaveBeenNthCalledWith(1, width, height)
    expect(mockEffectComposerSetSize).toHaveBeenNthCalledWith(2, width, height)
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
    useAppStore.getState().setNoteLabelsOnKeys(true)
    vi.clearAllMocks()
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
    expect(mockCanvasTextureDispose).toHaveBeenCalledTimes(15)
    expect(mockBufferGeometryDispose).toHaveBeenCalledTimes(1)
    expect(mockMeshBasicMaterialDispose).toHaveBeenCalled()
    expect(mockMeshLambertMaterialDispose).toHaveBeenCalled()
    expect(mockShaderMaterialDispose).toHaveBeenCalledTimes(194)
    expect(mockSpriteMaterialDispose).toHaveBeenCalledTimes(88)
    expect(mockUnrealBloomPassDispose).toHaveBeenCalledTimes(1)
    expect(mockOutputPassDispose).toHaveBeenCalledTimes(1)
    expect(mockShaderPassDispose).toHaveBeenCalledTimes(1)
    expect(mockEffectComposerDispose).toHaveBeenCalledTimes(2)
    expect(mockPlaneGeometryDispose).toHaveBeenCalledTimes(1)
    expect(mockSceneRemove).toHaveBeenCalledTimes(9)
    expect(mockRendererSetAnimationLoop).toHaveBeenCalledWith(null)
    expect(mockRendererForceContextLoss).toHaveBeenCalledTimes(1)
    expect(mockRendererDispose).toHaveBeenCalledTimes(1)
  })

  it('merges live note sources without allowing pointer notes to override active Record MIDI', async () => {
    const renderer = new ThreeRenderer()
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 640 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 360 })
    await renderer.init(canvas)

    renderer.setLiveNoteSource('pointer-keyboard', [{
      id: 'pointer:60', pitch: 60, startedAtMs: performance.now(), velocity: 100,
    }])
    expect((renderer as any).liveMidiNotes.map((note: { pitch: number }) => note.pitch)).toEqual([60])

    renderer.setLiveNoteSource('record-midi', [{
      id: 'midi:64', pitch: 64, startedAtMs: performance.now(), velocity: 96,
    }])
    expect((renderer as any).liveMidiNotes.map((note: { pitch: number }) => note.pitch)).toEqual([64])
    expect((renderer as any).liveSourceActiveKeyPitches).toEqual(new Set([64]))

    renderer.setLiveNoteSource('pointer-keyboard', [{
      id: 'pointer:67', pitch: 67, startedAtMs: performance.now(), velocity: 100,
    }])
    expect((renderer as any).liveMidiNotes.map((note: { pitch: number }) => note.pitch)).toEqual([64])

    renderer.setLiveNoteSource('record-midi', [])
    expect(renderer.isLiveNoteSourceActiveOrRecent('record-midi', 600)).toBe(true)
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
  const projectData = {
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
  }
  const tempoMap = {
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
  }

  useAppStore.getState().loadProject(projectData, tempoMap)
  spatialIndex.build(projectData)
}

function emitPlaybackSeek(tick: number): void {
  for (const listener of [...mockPlaybackSeekListeners]) {
    listener(tick)
  }
}
