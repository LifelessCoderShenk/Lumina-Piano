import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
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
  Vector2,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import type { Note } from '../midi/types'
import { type PlaybackEventMap, playbackEngine } from '../playback/PlaybackEngine'
import { type IndexedNote, spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore } from '../store/store'
import { tickToSeconds } from '../tempo/tempoMap'
import { resolveCreateModeNoteColor } from './colorUtils'
import {
  BLACK_KEY_ACTIVE_ALPHA,
  BLACK_KEY_BOTTOM_SHADOW_HEIGHT,
  BLACK_KEY_COLOR,
  BLACK_KEY_HIGHLIGHT_COLOR,
  BLACK_KEY_SHADOW_COLOR,
  NOTE_MIN_HEIGHT,
  WHITE_KEY_ACTIVE_ALPHA,
  WHITE_KEY_BOTTOM_SHADOW_HEIGHT,
  WHITE_KEY_COLOR,
  WHITE_KEY_SEPARATOR_COLOR,
  WHITE_KEY_SEPARATOR_WIDTH,
  WHITE_KEY_SHADOW_COLOR,
  getKeyboardLayoutMetrics,
} from './layoutConstants'
import { getNoteScreenRect, getVisibleTickWindow } from './noteMotion'
import {
  PIANO_MAX_PITCH,
  PIANO_MIN_PITCH,
  PIANO_WHITE_KEY_COUNT,
  getKeyAtScreenX,
  getBlackKeyWidth,
  getWhiteKeyBounds,
  getWhiteKeyIndex,
  isBlackKey,
  pitchToKeyX,
} from './pianoMath'
import type { VisualizerRenderer } from './VisualizerRenderer'

type AppState = ReturnType<typeof getAppState>

const CREATE_MODE_BACKGROUND_COLOR = 0x000000
const CREATE_MODE_LANE_LINE_COLOR = 0x444444
const CREATE_MODE_LANE_LINE_ALPHA = 0.4
const CREATE_MODE_BLACK_KEY_HEIGHT_RATIO = 0.6
const CREATE_MODE_BOUNDARY_OUTER_AURA_THICKNESS = 16
const CREATE_MODE_BOUNDARY_MID_GLOW_THICKNESS = 6
const CREATE_MODE_BOUNDARY_CORE_THICKNESS = 2
const CREATE_MODE_BOUNDARY_OUTER_AURA_ALPHA = 0.15
const CREATE_MODE_BOUNDARY_MID_GLOW_ALPHA = 0.35
const CREATE_MODE_BOUNDARY_CORE_ALPHA = 1
const CREATE_MODE_BOUNDARY_WAVE_LENGTH = 300
const CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE = 1.5
const CREATE_MODE_BOUNDARY_WAVE_TIME_STEP = 0.02
const CREATE_MODE_BOUNDARY_SEGMENT_WIDTH = 12
const ACTIVE_QUERY_TICK_SPAN = 1
const WHITE_KEY_BOTTOM_INSET = 4
const BLACK_KEY_BOTTOM_INSET = 2
const BLACK_KEY_SHADOW_ALPHA = 0.22
const WHITE_KEY_SHADOW_ALPHA = 0.3
const BLACK_KEY_HIGHLIGHT_ALPHA = 0.6
const BLACK_KEY_NOTE_INSET = 2
const BLACK_KEY_VERTICAL_INSET = 3
const LANE_GUIDE_Z = 0
const WHITE_KEY_Z = 1
const BLACK_KEY_Z = 2
const BLACK_NOTE_Z = 4
const WHITE_NOTE_Z = 6
const WAVE_OUTER_Z = 8
const WAVE_MID_Z = 9
const WAVE_CORE_Z = 10
const KEYBOARD_REFLECTION_Z = 3
const NOTE_AMBIENT_LIGHT_COLOR = 0xffffff
const NOTE_AMBIENT_LIGHT_INTENSITY = 1
const NOTE_ROUNDED_CORNER_RATIO = 0.18
const NOTE_MAX_CORNER_RADIUS = 6
const BLOOM_LAYER = 1
const BLOOM_STRENGTH = 0.7
const BLOOM_RADIUS = 0.025
const BLOOM_THRESHOLD = 0.25
const SHOW_BLOOM_DEBUG_VIEW = false
const SHOW_BLOOM_CLIP_DEBUG_LINE = false
const BLOOM_CLIP_FEATHER_PIXELS = 3
const BLOOM_CLIP_DEBUG_LINE_ALPHA = SHOW_BLOOM_CLIP_DEBUG_LINE ? 0.85 : 0
const BLOOM_CLIP_DEBUG_LINE_BUFFER_PIXELS = 3
const NOTE_BLOOM_EMISSIVE_INTENSITY = 3
const NOTE_SWIRL_SHORT_NOTE_START_HEIGHT = NOTE_MIN_HEIGHT
const NOTE_SWIRL_SHORT_NOTE_END_HEIGHT = 24
const NOTE_SWIRL_SHORT_NOTE_WARP_STRENGTH = 0.14
const NOTE_SWIRL_WARP_STRENGTH = 0.19
const NOTE_SWIRL_SHORT_NOTE_MAIN_FREQUENCY = 2.8
const NOTE_SWIRL_MAIN_FREQUENCY = 3.9
const NOTE_SWIRL_WARP_FREQUENCY_A = 1.35
const NOTE_SWIRL_WARP_FREQUENCY_B = 1.85
const NOTE_SWIRL_SECOND_OCTAVE_SCALE = 2.15
const NOTE_SWIRL_SECOND_OCTAVE_WEIGHT = 0.32
const NOTE_SWIRL_BRIGHT_DIFFUSE_INTENSITY = 0.1
const NOTE_SWIRL_BRIGHT_EMISSIVE_INTENSITY = 0.18
const NOTE_SWIRL_RECESS_DIFFUSE_INTENSITY = 0.038
const NOTE_SWIRL_RECESS_EMISSIVE_INTENSITY = 0.06
const NOTE_CORE_TARGET_TOTAL_LUMINANCE = 1.08
const NOTE_HALO_TARGET_TOTAL_LUMINANCE = 1.58
const NOTE_CORE_EMISSIVE_STRENGTH_MIN = 0.2
const NOTE_CORE_EMISSIVE_STRENGTH_MAX = 3.6
const NOTE_HALO_EMISSIVE_STRENGTH_MIN = 0.45
const NOTE_HALO_EMISSIVE_STRENGTH_MAX = 3.6
const NOTE_ACHROMATIC_SATURATION_THRESHOLD = 0.05
const NOTE_ACHROMATIC_FALLBACK_HUE = 0.61
const NOTE_ACHROMATIC_FALLBACK_SATURATION = 0.72
const NOTE_SWIRL_BRIGHT_MIN_LUMINANCE_DELTA = 0.08
const NOTE_SWIRL_RECESS_MIN_LUMINANCE_DELTA = 0.2
const WAVE_OUTER_AURA_EMISSIVE_INTENSITY = 0
const WAVE_MID_GLOW_EMISSIVE_INTENSITY = 1.6
const WAVE_CORE_EMISSIVE_INTENSITY = 1.2
const KEY_HIGHLIGHT_FADE_IN_SECONDS = 0.06
const KEY_HIGHLIGHT_FADE_OUT_SECONDS = 0.18
const IMPACT_REFLECTION_HEIGHT = 30
const IMPACT_REFLECTION_PEAK_STRENGTH_MIN = 0.55
const IMPACT_REFLECTION_PEAK_STRENGTH_MAX = 0.95
const IMPACT_REFLECTION_DURATION_MIN_SECONDS = 0.12
const IMPACT_REFLECTION_DURATION_MAX_SECONDS = 0.22
const PARTICLE_POOL_CAPACITY = 4_096
const PARTICLE_Z = WAVE_MID_Z
const PARTICLE_RENDER_ORDER = Math.round((WAVE_CORE_Z + 1) * 10)
const PARTICLE_MIN_COUNT = 24
const PARTICLE_MAX_COUNT = 60
const PARTICLE_MIN_LIFETIME_SECONDS = 0.55
const PARTICLE_MAX_LIFETIME_SECONDS = 1
const PARTICLE_LIFETIME_VARIANCE = 0.18
const PARTICLE_MIN_SIZE = 2.5
const PARTICLE_MAX_SIZE = 5
const PARTICLE_SIZE_VARIANCE = 0.22
const PARTICLE_MIN_ALPHA = 0.45
const PARTICLE_MAX_ALPHA = 1
const PARTICLE_ALPHA_VARIANCE = 0.12
const PARTICLE_MIN_BRIGHTNESS = 0.6
const PARTICLE_MAX_BRIGHTNESS = 1.15
const PARTICLE_BRIGHTNESS_VARIANCE = 0.16
const PARTICLE_MIN_SPEED = 130
const PARTICLE_MAX_SPEED = 300
const PARTICLE_SPEED_VARIANCE = 0.28
const PARTICLE_MIN_UPWARD_RATIO = 0.25
const PARTICLE_MAX_UPWARD_RATIO = 0.8
const PARTICLE_SIDEWAYS_RATIO = 0.95
const PARTICLE_DRAG_MIN = 0.65
const PARTICLE_DRAG_MAX = 1.2
const PARTICLE_GRAVITY = 90
const PARTICLE_SPAWN_LATERAL_JITTER = 18
const PARTICLE_FLOW_SCALE = 28
const PARTICLE_FLOW_STRENGTH_X = 175
const PARTICLE_FLOW_STRENGTH_Y = 42
const PARTICLE_FLOW_TIME_SCROLL = 0.52
const PARTICLE_BURST_WIND_BIAS_X = 60
const PARTICLE_FLOW_SAMPLE_EPSILON = 8
const PARTICLE_FLOW_VARIATION_MIN = 0.85
const PARTICLE_FLOW_VARIATION_MAX = 1.3
const PARTICLE_MAX_NOTES_PER_DETECTION = 64
const PARTICLE_MAX_PHYSICS_STEP_SECONDS = 0.05

type GlowMaterial = MeshLambertMaterial
type ReflectionMaterial = ShaderMaterial
type ParticleMaterial = ShaderMaterial

interface RoundedNoteUniforms {
  roundedRectRadius: {
    value: number
  }
  roundedRectSize: {
    value: Vector2
  }
  noteMaterialTime: {
    value: number
  }
  noteTravelPhaseOffset: {
    value: number
  }
  noteCoreDiffuseColor: {
    value: Color
  }
  noteHaloDiffuseColor: {
    value: Color
  }
  noteCoreEmissiveColor: {
    value: Color
  }
  noteHaloEmissiveColor: {
    value: Color
  }
  noteSwirlBrightColor: {
    value: Color
  }
  noteSwirlRecessColor: {
    value: Color
  }
  noteCoreEmissiveStrength: {
    value: number
  }
  noteHaloEmissiveStrength: {
    value: number
  }
}

interface KeyboardMaterialState {
  material: MeshBasicMaterial
  baseOpacity: number
}

interface KeyHighlightState {
  currentStrength: number
  fromStrength: number
  material: MeshBasicMaterial
  baseOpacity: number
  targetStrength: number
  transitionDurationSeconds: number
  transitionStartSeconds: number
}

interface WaveLayerDefinition {
  emissiveIntensity: number
  lineWidth: number
  opacity: number
  role: 'core' | 'mid' | 'outer'
  renderOrder: number
  z: number
}

interface WaveLayerState {
  definition: WaveLayerDefinition
  materials: GlowMaterial[]
  segments: Array<Mesh<PlaneGeometry, GlowMaterial>>
}

interface ImpactReflectionUniforms {
  reflectionColor: {
    value: Color
  }
  reflectionStrength: {
    value: number
  }
}

interface ImpactReflectionState {
  currentStrength: number
  durationSeconds: number
  material: ReflectionMaterial
  mesh: Mesh<PlaneGeometry, ReflectionMaterial>
  peakStrength: number
  pitch: number
  startTimeSeconds: number
  uniforms: ImpactReflectionUniforms
}

export interface NoteMaterialPalette {
  coreDiffuseColor: number
  haloDiffuseColor: number
  coreEmissiveColor: number
  haloEmissiveColor: number
  swirlBrightColor: number
  swirlRecessColor: number
  coreEmissiveStrength: number
  haloEmissiveStrength: number
}

interface BoundaryWavePalette {
  coreColor: number
  midGlowColor: number
  outerAuraColor: number
}

interface SharedFloatUniform {
  value: number
}

interface ParticleUniforms {
  particleTime: {
    value: number
  }
  pixelRatio: {
    value: number
  }
}

interface ParticleSystemState {
  activeCount: number
  ages: Float32Array
  alphaAttribute: BufferAttribute
  alphas: Float32Array
  baseAlphas: Float32Array
  baseBrightnesses: Float32Array
  baseSizes: Float32Array
  brightnessAttribute: BufferAttribute
  brightnesses: Float32Array
  colorAttribute: BufferAttribute
  colors: Float32Array
  drag: Float32Array
  flowBiasX: Float32Array
  flowStrengths: Float32Array
  geometry: BufferGeometry
  lifetimes: Float32Array
  material: ParticleMaterial
  pitchClasses: Int8Array
  points: Points<BufferGeometry, ParticleMaterial>
  positionAttribute: BufferAttribute
  positions: Float32Array
  seedAttribute: BufferAttribute
  seeds: Float32Array
  sizeAttribute: BufferAttribute
  sizes: Float32Array
  uniforms: ParticleUniforms
  velocities: Float32Array
}

export class ThreeRenderer implements VisualizerRenderer {
  private canvas: HTMLCanvasElement | null = null
  private renderer: WebGLRenderer | null = null
  private bloomComposer: EffectComposer | null = null
  private finalComposer: EffectComposer | null = null
  private bloomRenderPass: RenderPass | null = null
  private finalRenderPass: RenderPass | null = null
  private bloomPass: UnrealBloomPass | null = null
  private bloomCompositePass: ShaderPass | null = null
  private outputPass: OutputPass | null = null
  private scene: Scene | null = null
  private camera: OrthographicCamera | null = null
  private ambientLight: AmbientLight | null = null
  private rectGeometry: PlaneGeometry | null = null
  private laneGroup: Group | null = null
  private keyboardGroup: Group | null = null
  private noteGroup: Group | null = null
  private particleGroup: Group | null = null
  private waveGroup: Group | null = null
  private staticResources: Array<{ dispose(): void }> = []
  private persistentResources: Array<{ dispose(): void }> = []
  private keyboardMaterialStates: KeyboardMaterialState[] = []
  private keyHighlightStates = new Map<number, KeyHighlightState>()
  private impactReflectionStates = new Map<number, ImpactReflectionState>()
  private explicitActiveKeyPitches = new Set<number>()
  private playbackActiveKeyPitches = new Set<number>()
  private keyboardOpacity = 1
  private viewportWidth = 1
  private viewportHeight = 1
  private currentTick = 0
  private boundaryWaveTime = 0
  private noteMeshes: Array<Mesh<PlaneGeometry, GlowMaterial>> = []
  private sharedNoteMaterialTimeUniform: SharedFloatUniform = { value: 0 }
  private waveLayers: WaveLayerState[] = []
  private waveSamplePoints: number[] = []
  private notesDirty = true
  private noteMaterialTimeSeconds = 0
  private visibleNoteMeshCount = 0
  private lastRenderedTick = Number.NaN
  private lastRenderedWorldZoom = Number.NaN
  private lastRenderedLearnActive: boolean | null = null
  private lastRenderedProjectData: AppState['projectData'] | null = null
  private lastRenderedTempoMap: AppState['precomputedTempoMap'] | null = null
  private particleSystem: ParticleSystemState | null = null
  private lastParticleUpdateTimeSeconds = Number.NaN
  private lastBurstDetectionTick = Number.NaN
  private hasPendingSeekSuppression = false
  private particleBurstSerial = 0
  private storeUnsubscribe: (() => void) | null = null
  private hasPendingCreateNoteColorUpdate = false

  private readonly handlePlaybackSeek: PlaybackEventMap['onSeek'] = (currentTick) => {
    this.hasPendingSeekSuppression = true
    this.resetBurstDetectionState(currentTick)
  }

  private readonly handleStoreChange = (nextState: AppState, previousState: AppState): void => {
    if (nextState.createNoteColors !== previousState.createNoteColors) {
      this.hasPendingCreateNoteColorUpdate = true
    }
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('ThreeRenderer requires a valid canvas element.')
    }

    if (this.canvas === canvas && this.renderer != null) {
      return
    }

    await this.destroy()

    this.canvas = canvas
    this.currentTick = getAppState().currentTick
    this.boundaryWaveTime = 0
    this.notesDirty = true
    this.lastRenderedTick = Number.NaN
    this.lastRenderedWorldZoom = Number.NaN
    this.lastRenderedLearnActive = null
    this.lastRenderedProjectData = null
    this.lastRenderedTempoMap = null

    this.scene = new Scene()
    this.scene.background = new Color(CREATE_MODE_BACKGROUND_COLOR)

    this.camera = new OrthographicCamera(0, 1, 0, 1, 0.1, 100)
    this.camera.position.set(0, 0, 10)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      canvas,
    })
    this.renderer.setClearColor(CREATE_MODE_BACKGROUND_COLOR, 1)
    this.renderer.setPixelRatio(getDevicePixelRatio())
    this.renderer.toneMapping = LinearToneMapping
    this.renderer.toneMappingExposure = 1

    this.rectGeometry = new PlaneGeometry(1, 1)
    this.laneGroup = new Group()
    this.keyboardGroup = new Group()
    this.noteGroup = new Group()
    this.particleGroup = new Group()
    this.waveGroup = new Group()
    this.ambientLight = new AmbientLight(NOTE_AMBIENT_LIGHT_COLOR, NOTE_AMBIENT_LIGHT_INTENSITY)

    this.scene.add(this.laneGroup)
    this.scene.add(this.keyboardGroup)
    this.scene.add(this.noteGroup)
    this.scene.add(this.particleGroup)
    this.scene.add(this.waveGroup)
    this.scene.add(this.ambientLight)

    this.initWaveLayers()
    this.initParticleSystem()

    this.resize(
      Math.max(1, canvas.clientWidth || canvas.width || 1),
      Math.max(1, canvas.clientHeight || canvas.height || 1),
    )

    this.initPostprocessing()
    playbackEngine.on('onSeek', this.handlePlaybackSeek)
    this.storeUnsubscribe = subscribeToStore(this.handleStoreChange)
    this.renderer.setAnimationLoop(this.handleAnimationFrame)
    this.renderFrame(this.currentTick)
  }

  async destroy(): Promise<void> {
    playbackEngine.off('onSeek', this.handlePlaybackSeek)
    this.storeUnsubscribe?.()
    this.storeUnsubscribe = null
    this.clearDynamicNoteObjects()
    this.clearParticleSystem(true)
    this.disposeStaticScene()
    this.disposeWaveMeshes()

    if (this.noteGroup != null) {
      clearGroup(this.noteGroup)
    }
    if (this.particleGroup != null) {
      clearGroup(this.particleGroup)
    }
    if (this.waveGroup != null) {
      clearGroup(this.waveGroup)
    }

    if (this.laneGroup != null && this.scene != null) {
      this.scene.remove(this.laneGroup)
    }
    if (this.keyboardGroup != null && this.scene != null) {
      this.scene.remove(this.keyboardGroup)
    }
    if (this.noteGroup != null && this.scene != null) {
      this.scene.remove(this.noteGroup)
    }
    if (this.particleGroup != null && this.scene != null) {
      this.scene.remove(this.particleGroup)
    }
    if (this.waveGroup != null && this.scene != null) {
      this.scene.remove(this.waveGroup)
    }
    if (this.ambientLight != null && this.scene != null) {
      this.scene.remove(this.ambientLight)
    }

    for (const resource of this.persistentResources) {
      resource.dispose()
    }

    this.rectGeometry?.dispose()

    if (this.renderer != null) {
      this.renderer.setAnimationLoop(null)
      const rendererWithContextLoss = this.renderer as WebGLRenderer & {
        forceContextLoss?: () => void
      }
      rendererWithContextLoss.forceContextLoss?.()
      this.renderer.dispose()
    }

    this.laneGroup = null
    this.keyboardGroup = null
    this.noteGroup = null
    this.particleGroup = null
    this.waveGroup = null
    this.rectGeometry = null
    this.camera = null
    this.ambientLight = null
    this.scene = null
    this.bloomComposer = null
    this.finalComposer = null
    this.bloomRenderPass = null
    this.finalRenderPass = null
    this.bloomPass = null
    this.bloomCompositePass = null
    this.outputPass = null
    this.renderer = null
    this.canvas = null
    this.explicitActiveKeyPitches.clear()
    this.playbackActiveKeyPitches.clear()
    this.keyboardOpacity = 1
    this.viewportWidth = 1
    this.viewportHeight = 1
    this.currentTick = 0
    this.boundaryWaveTime = 0
    this.noteMaterialTimeSeconds = 0
    this.sharedNoteMaterialTimeUniform.value = 0
    this.notesDirty = true
    this.visibleNoteMeshCount = 0
    this.lastRenderedTick = Number.NaN
    this.lastRenderedWorldZoom = Number.NaN
    this.lastRenderedLearnActive = null
    this.lastRenderedProjectData = null
    this.lastRenderedTempoMap = null
    this.particleSystem = null
    this.lastParticleUpdateTimeSeconds = Number.NaN
    this.lastBurstDetectionTick = Number.NaN
    this.hasPendingSeekSuppression = false
    this.particleBurstSerial = 0
    this.storeUnsubscribe = null
    this.hasPendingCreateNoteColorUpdate = false
    this.noteMeshes = []
    this.waveLayers = []
    this.waveSamplePoints = []
    this.persistentResources = []
  }

  resize(width: number, height: number): void {
    if (this.renderer == null || this.camera == null || !Number.isFinite(width) || !Number.isFinite(height)) {
      return
    }

    this.viewportWidth = Math.max(1, Math.round(width))
    this.viewportHeight = Math.max(1, Math.round(height))

    this.renderer.setPixelRatio(getDevicePixelRatio())
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false)
    this.bloomComposer?.setPixelRatio(getDevicePixelRatio())
    this.bloomComposer?.setSize(this.viewportWidth, this.viewportHeight)
    this.finalComposer?.setPixelRatio(getDevicePixelRatio())
    this.finalComposer?.setSize(this.viewportWidth, this.viewportHeight)
    this.updateBloomCompositeUniforms()

    this.camera.left = 0
    this.camera.right = this.viewportWidth
    this.camera.top = this.viewportHeight
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()

    this.rebuildStaticScene()
    this.rebuildWaveMeshes()
    this.clearParticleSystem(false)
    this.resetBurstDetectionState(this.currentTick)
    this.notesDirty = true
    this.renderDynamicState(this.currentTick)
  }

  renderFrame(tick: number): void {
    if (Number.isFinite(tick)) {
      this.currentTick = tick
    }

    this.consumePendingCreateNoteColorUpdate(getAppState())
    this.notesDirty = true
    this.renderDynamicState(this.currentTick)
  }

  getCanvas(): HTMLCanvasElement {
    if (this.canvas == null) {
      throw new Error('ThreeRenderer has not been initialized.')
    }

    return this.canvas
  }

  getKeyX(pitch: number): number {
    if (isBlackKey(pitch)) {
      return pitchToKeyX(pitch, this.viewportWidth) + (getBlackKeyWidth(this.viewportWidth) / 2)
    }

    const { width, x } = getWhiteKeyBounds(pitch, this.viewportWidth)
    return x + (width / 2)
  }

  getKeyboardY(): number {
    return getKeyboardLayoutMetrics(this.viewportHeight).keyboardY
  }

  setKeyboardOpacity(opacity: number): void {
    this.keyboardOpacity = clamp(opacity, 0, 1)
    this.applyKeyboardOpacity()
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.applyImpactReflections(this.noteMaterialTimeSeconds)
    this.renderScene()
  }

  setActiveKeyPitches(pitches: Iterable<number>): void {
    this.explicitActiveKeyPitches = new Set(Array.from(pitches, (pitch) => Math.round(pitch)))
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.renderScene()
  }

  private consumePendingCreateNoteColorUpdate(state: AppState): boolean {
    if (!this.hasPendingCreateNoteColorUpdate || this.renderer == null) {
      return false
    }

    this.hasPendingCreateNoteColorUpdate = false
    this.updateKeyHighlightColors(state)
    this.updateImpactReflectionColors(state)
    this.updateVisibleNoteMaterialColors(state)
    this.updateWaveLayerColors(state)
    this.updateActiveParticleColors(state)
    return true
  }

  private updateKeyHighlightColors(state: AppState): void {
    for (const [pitch, keyHighlight] of this.keyHighlightStates) {
      keyHighlight.material.color.setHex(resolveCreateModeNoteColor(pitch, state.createNoteColors))
      keyHighlight.material.needsUpdate = true
    }
  }

  private updateImpactReflectionColors(state: AppState): void {
    for (const impactReflection of this.impactReflectionStates.values()) {
      impactReflection.uniforms.reflectionColor.value.setHex(
        resolveCreateModeNoteColor(impactReflection.pitch, state.createNoteColors),
      )
      impactReflection.material.needsUpdate = true
    }
  }

  private updateVisibleNoteMaterialColors(state: AppState): void {
    for (const noteMesh of this.noteMeshes) {
      if (!noteMesh.visible) {
        continue
      }

      const notePitch = noteMesh.userData.notePitch as number | undefined
      if (notePitch == null) {
        continue
      }

      this.assignNoteMaterial(noteMesh, resolveCreateModeNoteColor(notePitch, state.createNoteColors))
    }
  }

  private readonly handleAnimationFrame = (frameTimeMs?: number): void => {
    if (this.renderer == null || this.scene == null || this.camera == null) {
      return
    }

    const state = getAppState()
    this.consumePendingCreateNoteColorUpdate(state)
    if (Number.isFinite(state.currentTick) && state.currentTick !== this.currentTick) {
      this.currentTick = state.currentTick
      this.notesDirty = true
    }

    this.syncNoteMaterialAnimationTime(frameTimeMs)
    this.syncParticleMaterialAnimationTime()
    this.updateParticleSystem(getAnimationTimeSeconds(frameTimeMs))
    const notesChanged = this.renderDynamicState(this.currentTick, state, false)
    const shouldAnimateNotes = this.visibleNoteMeshCount > 0
    const shouldAnimateHighlights = this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    const shouldAnimateImpactReflections = this.applyImpactReflections(this.noteMaterialTimeSeconds)
    this.detectNoteBursts(this.currentTick, state)

    if (!state.learnV3.isActive) {
      this.boundaryWaveTime += CREATE_MODE_BOUNDARY_WAVE_TIME_STEP
      this.updateWaveMeshes()
      this.renderScene()
      return
    }

    if (notesChanged || shouldAnimateNotes || shouldAnimateHighlights || shouldAnimateImpactReflections) {
      this.renderScene()
    }
  }

  private renderDynamicState(
    currentTick: number,
    state = getAppState(),
    shouldRender = true,
  ): boolean {
    const projectOrTempoChanged =
      this.lastRenderedProjectData !== state.projectData ||
      this.lastRenderedTempoMap !== state.precomputedTempoMap
    const learnStateChanged = this.lastRenderedLearnActive !== state.learnV3.isActive
    const shouldRefreshNotes =
      this.notesDirty ||
      this.lastRenderedTick !== currentTick ||
      this.lastRenderedWorldZoom !== state.worldZoom ||
      learnStateChanged ||
      projectOrTempoChanged

    if (!shouldRefreshNotes) {
      if (shouldRender) {
        this.renderScene()
      }
      return false
    }

    this.updateNoteLayer(currentTick, state)
    this.updatePlaybackActiveKeys(currentTick, state)
    this.syncWaveVisibility(state.learnV3.isActive)
    this.syncParticleVisibility(state.learnV3.isActive)

    if (projectOrTempoChanged || learnStateChanged) {
      this.clearParticleSystem(false)
      this.clearImpactReflections()
      this.particleBurstSerial = 0
      this.resetBurstDetectionState(currentTick)
    }

    this.notesDirty = false
    this.lastRenderedTick = currentTick
    this.lastRenderedWorldZoom = state.worldZoom
    this.lastRenderedLearnActive = state.learnV3.isActive
    this.lastRenderedProjectData = state.projectData
    this.lastRenderedTempoMap = state.precomputedTempoMap

    if (shouldRender) {
      this.renderScene()
    }

    return true
  }

  private rebuildStaticScene(): void {
    if (this.laneGroup == null || this.keyboardGroup == null) {
      return
    }

    this.disposeStaticScene()
    this.buildLaneGuides()
    this.buildKeyboard()
    this.applyKeyboardOpacity()
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.applyImpactReflections(this.noteMaterialTimeSeconds)
  }

  private buildLaneGuides(): void {
    const laneGroup = this.requireLaneGroup()

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (pitch % 12 !== 0) {
        continue
      }

      const x = pitchToKeyX(pitch, this.viewportWidth)
      const mesh = this.createStaticRectMesh(
        laneGroup,
        x,
        0,
        1,
        this.viewportHeight,
        CREATE_MODE_LANE_LINE_COLOR,
        CREATE_MODE_LANE_LINE_ALPHA,
        LANE_GUIDE_Z,
      )
      mesh.renderOrder = 0
    }
  }

  private buildKeyboard(): void {
    const keyboardGroup = this.requireKeyboardGroup()
    const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(this.viewportHeight)
    const roundedKeyboardHeight = Math.round(keyboardHeight)
    const blackKeyWidth = Math.max(1, Math.round(getBlackKeyWidth(this.viewportWidth)))
    const blackKeyHeight = Math.max(1, Math.round(keyboardHeight * CREATE_MODE_BLACK_KEY_HEIGHT_RATIO))

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (isBlackKey(pitch)) {
        continue
      }

      const whiteKeyBounds = getWhiteKeyBounds(pitch, this.viewportWidth)
      const hasSeparator = getWhiteKeyIndex(pitch) < PIANO_WHITE_KEY_COUNT - 1
      const whiteKeyWidth = hasSeparator
        ? Math.max(1, whiteKeyBounds.width - WHITE_KEY_SEPARATOR_WIDTH)
        : whiteKeyBounds.width
      const whiteKeyHeight = Math.max(1, roundedKeyboardHeight - WHITE_KEY_BOTTOM_INSET)

      this.createStaticRectMesh(
        keyboardGroup,
        whiteKeyBounds.x,
        keyboardY,
        whiteKeyWidth,
        whiteKeyHeight,
        WHITE_KEY_COLOR,
        1,
        WHITE_KEY_Z,
        true,
      )
      this.createStaticRectMesh(
        keyboardGroup,
        whiteKeyBounds.x,
        keyboardY + roundedKeyboardHeight - WHITE_KEY_BOTTOM_SHADOW_HEIGHT - WHITE_KEY_BOTTOM_INSET,
        whiteKeyWidth,
        WHITE_KEY_BOTTOM_SHADOW_HEIGHT,
        WHITE_KEY_SHADOW_COLOR,
        WHITE_KEY_SHADOW_ALPHA,
        WHITE_KEY_Z,
        true,
      )

      if (hasSeparator) {
        this.createStaticRectMesh(
          keyboardGroup,
          whiteKeyBounds.x + whiteKeyWidth,
          keyboardY,
          WHITE_KEY_SEPARATOR_WIDTH,
          whiteKeyHeight,
          WHITE_KEY_SEPARATOR_COLOR,
          0.45,
          WHITE_KEY_Z,
          true,
        )
      }

      const highlight = this.createStaticRectMesh(
        keyboardGroup,
        whiteKeyBounds.x,
        keyboardY,
        whiteKeyWidth,
        whiteKeyHeight,
        resolveCreateModeNoteColor(pitch, getAppState().createNoteColors),
        0,
        WHITE_KEY_Z,
      )
      highlight.layers.enable(BLOOM_LAYER)
      this.keyHighlightStates.set(pitch, {
        baseOpacity: WHITE_KEY_ACTIVE_ALPHA,
        currentStrength: 0,
        fromStrength: 0,
        material: highlight.material,
        targetStrength: 0,
        transitionDurationSeconds: 0,
        transitionStartSeconds: 0,
      })
      this.createImpactReflectionMesh(
        keyboardGroup,
        pitch,
        whiteKeyBounds.x,
        keyboardY,
        whiteKeyWidth,
        Math.max(8, Math.min(whiteKeyHeight, IMPACT_REFLECTION_HEIGHT)),
      )
    }

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) {
        continue
      }

      const keyX = Math.round(pitchToKeyX(pitch, this.viewportWidth))
      const blackFaceHeight = Math.max(1, blackKeyHeight - BLACK_KEY_BOTTOM_INSET)

      this.createStaticRectMesh(
        keyboardGroup,
        keyX,
        keyboardY + 1,
        blackKeyWidth,
        Math.max(1, blackKeyHeight - 1),
        BLACK_KEY_SHADOW_COLOR,
        BLACK_KEY_SHADOW_ALPHA,
        BLACK_KEY_Z,
        true,
      )
      this.createStaticRectMesh(
        keyboardGroup,
        keyX,
        keyboardY,
        blackKeyWidth,
        blackFaceHeight,
        BLACK_KEY_COLOR,
        1,
        BLACK_KEY_Z,
        true,
      )
      this.createStaticRectMesh(
        keyboardGroup,
        keyX + 1,
        keyboardY + blackKeyHeight - BLACK_KEY_BOTTOM_SHADOW_HEIGHT - BLACK_KEY_BOTTOM_INSET,
        Math.max(1, blackKeyWidth - 2),
        BLACK_KEY_BOTTOM_SHADOW_HEIGHT,
        BLACK_KEY_HIGHLIGHT_COLOR,
        BLACK_KEY_HIGHLIGHT_ALPHA,
        BLACK_KEY_Z,
        true,
      )

      const highlight = this.createStaticRectMesh(
        keyboardGroup,
        keyX,
        keyboardY,
        blackKeyWidth,
        blackFaceHeight,
        resolveCreateModeNoteColor(pitch, getAppState().createNoteColors),
        0,
        BLACK_KEY_Z,
      )
      highlight.layers.enable(BLOOM_LAYER)
      this.keyHighlightStates.set(pitch, {
        baseOpacity: BLACK_KEY_ACTIVE_ALPHA,
        currentStrength: 0,
        fromStrength: 0,
        material: highlight.material,
        targetStrength: 0,
        transitionDurationSeconds: 0,
        transitionStartSeconds: 0,
      })
      this.createImpactReflectionMesh(
        keyboardGroup,
        pitch,
        keyX,
        keyboardY,
        blackKeyWidth,
        Math.max(6, Math.min(blackFaceHeight, Math.round(IMPACT_REFLECTION_HEIGHT * 0.82))),
      )
    }
  }

  private updateNoteLayer(currentTick: number, state: AppState): void {
    const noteGroup = this.requireNoteGroup()
    if (state.projectData == null || state.precomputedTempoMap == null || !this.isSpatialIndexReady()) {
      hideObjects(this.noteMeshes)
      this.visibleNoteMeshCount = 0
      return
    }

    const { keyboardY } = getKeyboardLayoutMetrics(this.viewportHeight)
    const currentSeconds = tickToSeconds(currentTick, state.precomputedTempoMap)
    const visibleTickWindow = getVisibleTickWindow(
      currentTick,
      currentSeconds,
      state.precomputedTempoMap,
      keyboardY,
      state.worldZoom,
    )
    const visibleNotes = spatialIndex.getNotesInRegion(
      PIANO_MIN_PITCH,
      visibleTickWindow.minTick,
      PIANO_MAX_PITCH,
      visibleTickWindow.maxTick,
    )
    const nextNotesById = this.getNextNotesById(visibleNotes)

    let noteMeshIndex = 0
    for (const indexedNote of visibleNotes) {
      if (!isBlackKey(indexedNote.note.pitch)) {
        continue
      }

      const nextIndices = this.renderCreateModeNote(
        noteGroup,
        indexedNote,
        nextNotesById.get(indexedNote.note.id) ?? null,
        currentTick,
        currentSeconds,
        state,
        noteMeshIndex,
      )
      noteMeshIndex = nextIndices.noteMeshIndex
    }

    for (const indexedNote of visibleNotes) {
      if (isBlackKey(indexedNote.note.pitch)) {
        continue
      }

      const nextIndices = this.renderCreateModeNote(
        noteGroup,
        indexedNote,
        nextNotesById.get(indexedNote.note.id) ?? null,
        currentTick,
        currentSeconds,
        state,
        noteMeshIndex,
      )
      noteMeshIndex = nextIndices.noteMeshIndex
    }

    hideObjects(this.noteMeshes, noteMeshIndex)
    this.visibleNoteMeshCount = noteMeshIndex
  }

  private renderCreateModeNote(
    group: Group,
    indexedNote: IndexedNote,
    nextNote: IndexedNote | null,
    currentTick: number,
    currentSeconds: number,
    state: AppState,
    noteMeshIndex: number,
  ): {
    noteMeshIndex: number
  } {
    const rect = getNoteScreenRect(
      indexedNote.note,
      {
        canvasHeight: this.viewportHeight,
        canvasWidth: this.viewportWidth,
        currentSeconds,
        currentTick,
        tempoMap: state.precomputedTempoMap!,
        worldZoom: state.worldZoom,
      },
      nextNote?.note ?? null,
    )

    if (rect == null) {
      return {
        noteMeshIndex,
      }
    }

    const noteIsBlack = isBlackKey(indexedNote.note.pitch)
    const inset = noteIsBlack ? BLACK_KEY_NOTE_INSET : 0
    const verticalInset = noteIsBlack ? BLACK_KEY_VERTICAL_INSET : 0
    const adjustedRect = {
      h: Math.max(NOTE_MIN_HEIGHT, rect.h - (verticalInset * 2)),
      w: Math.max(4, rect.w - (inset * 2)),
      x: rect.x + inset,
      y: rect.y + verticalInset,
    }
    const noteColor = resolveCreateModeNoteColor(indexedNote.note.pitch, state.createNoteColors)
    const noteMesh = this.getOrCreateNoteMesh(group, noteMeshIndex)

    noteMesh.userData.notePitch = indexedNote.note.pitch
    this.assignNoteMaterial(noteMesh, noteColor)
    const roundedNoteUniforms = noteMesh.material.userData.roundedNoteUniforms as RoundedNoteUniforms | undefined
    if (roundedNoteUniforms != null) {
      roundedNoteUniforms.noteTravelPhaseOffset.value = resolveNoteTravelPhaseOffset(indexedNote.note)
    }
    noteMesh.position.set(
      adjustedRect.x + (adjustedRect.w / 2),
      this.toSceneRectY(adjustedRect.y, adjustedRect.h),
      noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z,
    )
    noteMesh.scale.set(adjustedRect.w, adjustedRect.h, 1)
    noteMesh.renderOrder = Math.round((noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z) * 10)
    noteMesh.visible = true

    return {
      noteMeshIndex: noteMeshIndex + 1,
    }
  }

  private updatePlaybackActiveKeys(currentTick: number, state: AppState): void {
    const activePitches = new Set<number>()

    if (state.projectData == null || spatialIndex.getTotalNoteCount() === 0) {
      this.playbackActiveKeyPitches = activePitches
      return
    }

    const candidates = spatialIndex.getNotesInRegion(
      PIANO_MIN_PITCH,
      currentTick,
      PIANO_MAX_PITCH,
      currentTick + ACTIVE_QUERY_TICK_SPAN,
    )

    for (const indexedNote of candidates) {
      if (indexedNote.note.startTick <= currentTick && indexedNote.note.visualEndTick >= currentTick) {
        activePitches.add(indexedNote.note.pitch)
      }
    }

    this.playbackActiveKeyPitches = activePitches
  }

  private initWaveLayers(): void {
    this.waveLayers = [
      this.createWaveLayerState({
        emissiveIntensity: WAVE_OUTER_AURA_EMISSIVE_INTENSITY,
        lineWidth: CREATE_MODE_BOUNDARY_OUTER_AURA_THICKNESS,
        opacity: CREATE_MODE_BOUNDARY_OUTER_AURA_ALPHA,
        role: 'outer',
        renderOrder: Math.round(WAVE_OUTER_Z * 10),
        z: WAVE_OUTER_Z,
      }),
      this.createWaveLayerState({
        emissiveIntensity: WAVE_MID_GLOW_EMISSIVE_INTENSITY,
        lineWidth: CREATE_MODE_BOUNDARY_MID_GLOW_THICKNESS,
        opacity: CREATE_MODE_BOUNDARY_MID_GLOW_ALPHA,
        role: 'mid',
        renderOrder: Math.round(WAVE_MID_Z * 10),
        z: WAVE_MID_Z,
      }),
      this.createWaveLayerState({
        emissiveIntensity: WAVE_CORE_EMISSIVE_INTENSITY,
        lineWidth: CREATE_MODE_BOUNDARY_CORE_THICKNESS,
        opacity: CREATE_MODE_BOUNDARY_CORE_ALPHA,
        role: 'core',
        renderOrder: Math.round(WAVE_CORE_Z * 10),
        z: WAVE_CORE_Z,
      }),
    ]
  }

  private createWaveLayerState(definition: WaveLayerDefinition): WaveLayerState {
    return {
      definition,
      materials: [],
      segments: [],
    }
  }

  private rebuildWaveMeshes(): void {
    const waveGroup = this.requireWaveGroup()
    const state = getAppState()

    for (const layer of this.waveLayers) {
      for (const material of layer.materials) {
        material.dispose()
      }
      layer.materials = []
    }
    clearGroup(waveGroup)
    this.waveSamplePoints = createWaveSamplePoints(this.viewportWidth)

    for (const layer of this.waveLayers) {
      layer.segments = []

      for (let index = 0; index < this.waveSamplePoints.length - 1; index += 1) {
        const midpointX = (this.waveSamplePoints[index] + this.waveSamplePoints[index + 1]) / 2
        const material = this.createWaveSegmentMaterial(
          layer.definition,
          this.resolveWaveSegmentColor(layer.definition, midpointX, state),
        )
        const mesh = new Mesh(this.requireRectGeometry(), material)
        mesh.renderOrder = layer.definition.renderOrder
        mesh.layers.enable(BLOOM_LAYER)
        waveGroup.add(mesh)
        layer.materials.push(material)
        layer.segments.push(mesh)
      }
    }

    this.updateWaveMeshes()
  }

  private createWaveSegmentMaterial(definition: WaveLayerDefinition, color: number): GlowMaterial {
    return new MeshLambertMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      emissive: color,
      emissiveIntensity: definition.emissiveIntensity,
      opacity: definition.opacity,
      transparent: true,
    })
  }

  private updateWaveLayerColors(state: AppState): void {
    for (const layer of this.waveLayers) {
      for (let index = 0; index < layer.materials.length; index += 1) {
        const x0 = this.waveSamplePoints[index] ?? 0
        const x1 = this.waveSamplePoints[index + 1] ?? x0
        const midpointX = (x0 + x1) / 2
        const color = this.resolveWaveSegmentColor(layer.definition, midpointX, state)
        const material = layer.materials[index]

        material.color.setHex(color)
        material.emissive.setHex(color)
        material.needsUpdate = true
      }
    }
  }

  private updateWaveMeshes(): void {
    if (this.waveSamplePoints.length < 2) {
      return
    }

    const { keyboardY } = getKeyboardLayoutMetrics(this.viewportHeight)

    for (const layer of this.waveLayers) {
      for (let index = 0; index < layer.segments.length; index += 1) {
        const x0 = this.waveSamplePoints[index]
        const x1 = this.waveSamplePoints[index + 1]
        const y0 = keyboardY + Math.sin((x0 / CREATE_MODE_BOUNDARY_WAVE_LENGTH) + this.boundaryWaveTime) * CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE
        const y1 = keyboardY + Math.sin((x1 / CREATE_MODE_BOUNDARY_WAVE_LENGTH) + this.boundaryWaveTime) * CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE
        const dx = x1 - x0
        const dy = y1 - y0
        const length = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)))
        const midpointX = (x0 + x1) / 2
        const midpointY = (y0 + y1) / 2
        const segment = layer.segments[index]

        segment.position.set(midpointX, this.toScenePointY(midpointY), layer.definition.z)
        segment.scale.set(length, layer.definition.lineWidth, 1)
        segment.rotation.z = Math.atan2(-dy, dx)
        segment.visible = true
      }
    }
  }

  private syncWaveVisibility(isLearnModeActive: boolean): void {
    if (this.waveGroup != null) {
      this.waveGroup.visible = !isLearnModeActive
    }
  }

  private syncParticleVisibility(isLearnModeActive: boolean): void {
    if (this.particleGroup != null) {
      this.particleGroup.visible = !isLearnModeActive
    }
  }

  private initParticleSystem(): void {
    const particleGroup = this.requireParticleGroup()
    const positions = new Float32Array(PARTICLE_POOL_CAPACITY * 3)
    const velocities = new Float32Array(PARTICLE_POOL_CAPACITY * 3)
    const pitchClasses = new Int8Array(PARTICLE_POOL_CAPACITY)
    const lifetimes = new Float32Array(PARTICLE_POOL_CAPACITY)
    const ages = new Float32Array(PARTICLE_POOL_CAPACITY)
    const baseSizes = new Float32Array(PARTICLE_POOL_CAPACITY)
    const sizes = new Float32Array(PARTICLE_POOL_CAPACITY)
    const baseAlphas = new Float32Array(PARTICLE_POOL_CAPACITY)
    const alphas = new Float32Array(PARTICLE_POOL_CAPACITY)
    const baseBrightnesses = new Float32Array(PARTICLE_POOL_CAPACITY)
    const brightnesses = new Float32Array(PARTICLE_POOL_CAPACITY)
    const seeds = new Float32Array(PARTICLE_POOL_CAPACITY)
    const colors = new Float32Array(PARTICLE_POOL_CAPACITY * 3)
    const drag = new Float32Array(PARTICLE_POOL_CAPACITY)
    const flowBiasX = new Float32Array(PARTICLE_POOL_CAPACITY)
    const flowStrengths = new Float32Array(PARTICLE_POOL_CAPACITY)
    const geometry = new BufferGeometry()
    const positionAttribute = new BufferAttribute(positions, 3)
    const sizeAttribute = new BufferAttribute(sizes, 1)
    const alphaAttribute = new BufferAttribute(alphas, 1)
    const seedAttribute = new BufferAttribute(seeds, 1)
    const brightnessAttribute = new BufferAttribute(brightnesses, 1)
    const colorAttribute = new BufferAttribute(colors, 3)
    const uniforms: ParticleUniforms = {
      particleTime: { value: 0 },
      pixelRatio: { value: getDevicePixelRatio() },
    }

    geometry.setAttribute('position', positionAttribute)
    geometry.setAttribute('aSize', sizeAttribute)
    geometry.setAttribute('aAlpha', alphaAttribute)
    geometry.setAttribute('aSeed', seedAttribute)
    geometry.setAttribute('aBrightness', brightnessAttribute)
    geometry.setAttribute('aColor', colorAttribute)
    geometry.setDrawRange(0, 0)

    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader: `
uniform float particleTime;
varying float vAlpha;
varying float vBrightness;
varying vec3 vColor;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(centered);
  if (distanceFromCenter > 0.5) {
    discard;
  }

  float halo = 1.0 - smoothstep(0.08, 0.32, distanceFromCenter);
  float core = 1.0 - smoothstep(0.0, 0.18, distanceFromCenter);
  float shimmer = 1.0 + (sin((particleTime * 7.0) + (distanceFromCenter * 16.0)) * 0.03);
  float alpha = halo * halo * vAlpha;
  vec3 color = vColor * (0.95 + (vBrightness * 1.35) + (core * 0.75));

  gl_FragColor = vec4(color * shimmer, alpha);
}`,
      transparent: true,
      uniforms,
      vertexShader: `
uniform float particleTime;
uniform float pixelRatio;
attribute float aAlpha;
attribute float aBrightness;
attribute vec3 aColor;
attribute float aSeed;
attribute float aSize;
varying float vAlpha;
varying float vBrightness;
varying vec3 vColor;

void main() {
  vAlpha = aAlpha;
  vBrightness = aBrightness;
  vColor = aColor;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * pixelRatio * (1.0 + (sin((particleTime * 6.0) + (aSeed * 11.0)) * 0.06));
}`,
    })
    const points = new Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = PARTICLE_RENDER_ORDER
    points.layers.enable(BLOOM_LAYER)
    particleGroup.add(points)

    this.persistentResources.push(geometry, material)
    this.particleSystem = {
      activeCount: 0,
      ages,
      alphaAttribute,
      alphas,
      baseAlphas,
      baseBrightnesses,
      baseSizes,
      brightnessAttribute,
      brightnesses,
      colorAttribute,
      colors,
      drag,
      flowBiasX,
      flowStrengths,
      geometry,
      lifetimes,
      material,
      pitchClasses,
      points,
      positionAttribute,
      positions,
      seedAttribute,
      seeds,
      sizeAttribute,
      sizes,
      uniforms,
      velocities,
    }
  }

  private clearParticleSystem(resetUpdateClock: boolean): void {
    const particleSystem = this.particleSystem
    if (particleSystem != null) {
      particleSystem.activeCount = 0
      particleSystem.geometry.setDrawRange(0, 0)
      this.markParticleAttributesDirty(particleSystem)
    }

    if (resetUpdateClock) {
      this.lastParticleUpdateTimeSeconds = Number.NaN
    }
  }

  private updateActiveParticleColors(state: AppState): void {
    const particleSystem = this.particleSystem
    if (particleSystem == null || particleSystem.activeCount === 0) {
      return
    }

    for (let particleIndex = 0; particleIndex < particleSystem.activeCount; particleIndex += 1) {
      const color = resolveCreateModeNoteColor(
        particleSystem.pitchClasses[particleIndex],
        state.createNoteColors,
      )
      const [red, green, blue] = colorToNormalizedRgb(color)
      const colorOffset = particleIndex * 3
      particleSystem.colors[colorOffset] = red
      particleSystem.colors[colorOffset + 1] = green
      particleSystem.colors[colorOffset + 2] = blue
    }

    particleSystem.colorAttribute.needsUpdate = true
  }

  private detectNoteBursts(currentTick: number, state: AppState): void {
    if (
      state.learnV3.isActive ||
      !state.isPlaying ||
      state.projectData == null ||
      state.precomputedTempoMap == null ||
      !this.isSpatialIndexReady() ||
      !Number.isFinite(currentTick)
    ) {
      this.hasPendingSeekSuppression = false
      this.resetBurstDetectionState(currentTick)
      return
    }

    if (!Number.isFinite(this.lastBurstDetectionTick)) {
      this.hasPendingSeekSuppression = false
      this.resetBurstDetectionState(currentTick)
      return
    }

    if (this.hasPendingSeekSuppression) {
      this.hasPendingSeekSuppression = false
      this.resetBurstDetectionState(currentTick)
      return
    }

    const tickDelta = currentTick - this.lastBurstDetectionTick
    if (tickDelta <= 0) {
      this.hasPendingSeekSuppression = false
      this.resetBurstDetectionState(currentTick)
      return
    }

    this.emitBurstsForTickRange(this.lastBurstDetectionTick, currentTick, state)
    this.hasPendingSeekSuppression = false
    this.resetBurstDetectionState(currentTick)
  }

  private emitBurstsForTickRange(
    minExclusiveTick: number,
    maxInclusiveTick: number,
    state: AppState,
  ): void {
    const particleSystem = this.particleSystem
    if (
      particleSystem == null ||
      state.projectData == null ||
      state.precomputedTempoMap == null ||
      maxInclusiveTick <= minExclusiveTick
    ) {
      return
    }

    const candidates = spatialIndex.getNotesInRegion(
      PIANO_MIN_PITCH,
      Math.floor(minExclusiveTick),
      PIANO_MAX_PITCH,
      Math.floor(maxInclusiveTick) + 1,
    )
    const emittedNoteIds = new Set<string>()
    const maxBurstsThisPass = Math.min(
      PARTICLE_MAX_NOTES_PER_DETECTION,
      Math.floor((PARTICLE_POOL_CAPACITY - particleSystem.activeCount) / PARTICLE_MIN_COUNT),
    )
    let emittedBurstCount = 0
    let particlesChanged = false

    for (const indexedNote of candidates) {
      const { note } = indexedNote
      if (
        emittedBurstCount >= maxBurstsThisPass ||
        (PARTICLE_POOL_CAPACITY - particleSystem.activeCount) < PARTICLE_MIN_COUNT ||
        emittedNoteIds.has(note.id) ||
        note.startTick <= minExclusiveTick ||
        note.startTick > maxInclusiveTick
      ) {
        continue
      }

      emittedNoteIds.add(note.id)
      this.triggerImpactReflection(note)
      const didEmitBurst = this.emitBurstForNote(indexedNote)
      particlesChanged = didEmitBurst || particlesChanged
      if (didEmitBurst) {
        emittedBurstCount += 1
      }
    }

    if (particlesChanged) {
      particleSystem.geometry.setDrawRange(0, particleSystem.activeCount)
      this.markParticleAttributesDirty(particleSystem)
    }
  }

  private emitBurstForNote(indexedNote: IndexedNote): boolean {
    const particleSystem = this.particleSystem
    if (particleSystem == null) {
      return false
    }

    const availableSlots = PARTICLE_POOL_CAPACITY - particleSystem.activeCount
    if (availableSlots <= 0) {
      return false
    }

    const intensity = clamp(indexedNote.note.velocity / 127, 0, 1)
    const targetParticleCount = Math.round(lerp(PARTICLE_MIN_COUNT, PARTICLE_MAX_COUNT, intensity))
    const particleCount = Math.min(availableSlots, targetParticleCount)
    if (particleCount <= 0) {
      return false
    }

    const burstX = this.getKeyX(indexedNote.note.pitch)
    const burstTopDownY = this.getBoundaryTopDownY(burstX)
    const burstSceneY = this.toScenePointY(burstTopDownY)
    const pitchClass = ((indexedNote.note.pitch % 12) + 12) % 12
    const [red, green, blue] = colorToNormalizedRgb(
      resolveCreateModeNoteColor(indexedNote.note.pitch, getAppState().createNoteColors),
    )
    const burstSeed = createDeterministicSeed(indexedNote.note.id, this.particleBurstSerial)
    const burstWindBiasX = randomBetweenFromSeed(
      -PARTICLE_BURST_WIND_BIAS_X,
      PARTICLE_BURST_WIND_BIAS_X,
      burstSeed,
      0,
    )
    this.particleBurstSerial += 1

    for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
      const slot = particleSystem.activeCount
      const positionOffset = slot * 3
      const lifetimeBase = lerp(PARTICLE_MIN_LIFETIME_SECONDS, PARTICLE_MAX_LIFETIME_SECONDS, intensity)
      const speedBase = lerp(PARTICLE_MIN_SPEED, PARTICLE_MAX_SPEED, intensity)
      const sizeBase = lerp(PARTICLE_MIN_SIZE, PARTICLE_MAX_SIZE, intensity)
      const alphaBase = lerp(PARTICLE_MIN_ALPHA, PARTICLE_MAX_ALPHA, intensity)
      const brightnessBase = lerp(PARTICLE_MIN_BRIGHTNESS, PARTICLE_MAX_BRIGHTNESS, intensity)
      const particleSeed = createDeterministicSeed(indexedNote.note.id, burstSeed, particleIndex)
      const speed = applyVarianceFromSeed(speedBase, PARTICLE_SPEED_VARIANCE, particleSeed, 1)
      const upwardRatio = lerp(
        PARTICLE_MIN_UPWARD_RATIO,
        PARTICLE_MAX_UPWARD_RATIO,
        randomFromSeed(particleSeed, 2),
      )
      let velocityX =
        randomBetweenFromSeed(-PARTICLE_SIDEWAYS_RATIO, PARTICLE_SIDEWAYS_RATIO, particleSeed, 3) * speed
      let velocityY = speed * upwardRatio

      velocityX += randomBetweenFromSeed(
        -PARTICLE_SPAWN_LATERAL_JITTER,
        PARTICLE_SPAWN_LATERAL_JITTER,
        particleSeed,
        4,
      ) * (0.35 + (intensity * 0.5))

      particleSystem.positions[positionOffset] = burstX
      particleSystem.positions[positionOffset + 1] = burstSceneY
      particleSystem.positions[positionOffset + 2] = PARTICLE_Z
      particleSystem.pitchClasses[slot] = pitchClass
      particleSystem.velocities[positionOffset] = velocityX
      particleSystem.velocities[positionOffset + 1] = velocityY
      particleSystem.velocities[positionOffset + 2] = 0
      particleSystem.ages[slot] = 0
      particleSystem.lifetimes[slot] = applyVarianceFromSeed(lifetimeBase, PARTICLE_LIFETIME_VARIANCE, particleSeed, 5)
      particleSystem.baseSizes[slot] = Math.max(
        1,
        applyVarianceFromSeed(sizeBase, PARTICLE_SIZE_VARIANCE, particleSeed, 6),
      )
      particleSystem.sizes[slot] = particleSystem.baseSizes[slot]
      particleSystem.baseAlphas[slot] = clamp(
        applyVarianceFromSeed(alphaBase, PARTICLE_ALPHA_VARIANCE, particleSeed, 7),
        0.08,
        1.2,
      )
      particleSystem.alphas[slot] = particleSystem.baseAlphas[slot]
      particleSystem.baseBrightnesses[slot] = Math.max(
        0.15,
        applyVarianceFromSeed(brightnessBase, PARTICLE_BRIGHTNESS_VARIANCE, particleSeed, 8),
      )
      particleSystem.brightnesses[slot] = particleSystem.baseBrightnesses[slot]
      particleSystem.seeds[slot] = randomFromSeed(particleSeed, 9)
      particleSystem.colors[positionOffset] = red
      particleSystem.colors[positionOffset + 1] = green
      particleSystem.colors[positionOffset + 2] = blue
      particleSystem.drag[slot] = lerp(PARTICLE_DRAG_MIN, PARTICLE_DRAG_MAX, randomFromSeed(particleSeed, 10))
      particleSystem.flowBiasX[slot] = burstWindBiasX + randomBetweenFromSeed(-14, 14, particleSeed, 11)
      particleSystem.flowStrengths[slot] = lerp(
        PARTICLE_FLOW_VARIATION_MIN,
        PARTICLE_FLOW_VARIATION_MAX,
        randomFromSeed(particleSeed, 12),
      ) * (0.85 + (intensity * 0.3))

      particleSystem.activeCount += 1
    }

    return true
  }

  private triggerImpactReflection(note: Note): void {
    const impactReflection = this.impactReflectionStates.get(note.pitch)
    if (impactReflection == null) {
      return
    }

    const intensity = clamp(note.velocity / 127, 0, 1)
    impactReflection.startTimeSeconds = this.noteMaterialTimeSeconds
    impactReflection.durationSeconds = lerp(
      IMPACT_REFLECTION_DURATION_MIN_SECONDS,
      IMPACT_REFLECTION_DURATION_MAX_SECONDS,
      intensity,
    )
    impactReflection.peakStrength = lerp(
      IMPACT_REFLECTION_PEAK_STRENGTH_MIN,
      IMPACT_REFLECTION_PEAK_STRENGTH_MAX,
      intensity,
    )
    impactReflection.currentStrength = impactReflection.peakStrength
    this.applyImpactReflectionState(impactReflection)
  }

  private updateParticleSystem(currentTimeSeconds: number): void {
    const particleSystem = this.particleSystem
    if (particleSystem == null) {
      return
    }

    if (!Number.isFinite(currentTimeSeconds)) {
      return
    }

    if (!Number.isFinite(this.lastParticleUpdateTimeSeconds)) {
      this.lastParticleUpdateTimeSeconds = currentTimeSeconds
      return
    }

    const deltaSeconds = currentTimeSeconds - this.lastParticleUpdateTimeSeconds
    this.lastParticleUpdateTimeSeconds = currentTimeSeconds

    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || particleSystem.activeCount === 0) {
      return
    }

    const physicsDeltaSeconds = Math.min(deltaSeconds, PARTICLE_MAX_PHYSICS_STEP_SECONDS)
    let particleIndex = 0

    while (particleIndex < particleSystem.activeCount) {
      const ageSeconds = particleSystem.ages[particleIndex] + deltaSeconds
      if (ageSeconds >= particleSystem.lifetimes[particleIndex]) {
        this.releaseParticleSlot(particleIndex)
        continue
      }

      particleSystem.ages[particleIndex] = ageSeconds
      const lifeProgress = ageSeconds / particleSystem.lifetimes[particleIndex]
      const remainingLife = 1 - lifeProgress
      const positionOffset = particleIndex * 3
      const currentX = particleSystem.positions[positionOffset]
      const currentY = particleSystem.positions[positionOffset + 1]
      const seed = particleSystem.seeds[particleIndex]
      const flowStrength = particleSystem.flowStrengths[particleIndex]
      const flowTop = this.sampleParticleFlowNoise(currentX, currentY + PARTICLE_FLOW_SAMPLE_EPSILON, ageSeconds, seed)
      const flowBottom = this.sampleParticleFlowNoise(currentX, currentY - PARTICLE_FLOW_SAMPLE_EPSILON, ageSeconds, seed)
      const flowLeft = this.sampleParticleFlowNoise(currentX - PARTICLE_FLOW_SAMPLE_EPSILON, currentY, ageSeconds, seed)
      const flowRight = this.sampleParticleFlowNoise(currentX + PARTICLE_FLOW_SAMPLE_EPSILON, currentY, ageSeconds, seed)
      const flowEnvelope = 0.75 + (remainingLife * 0.35)
      const lateralAcceleration =
        ((flowTop - flowBottom) * PARTICLE_FLOW_STRENGTH_X * flowStrength * flowEnvelope) +
        particleSystem.flowBiasX[particleIndex]
      const verticalAcceleration =
        ((flowLeft - flowRight) * PARTICLE_FLOW_STRENGTH_Y * flowStrength * flowEnvelope) -
        (PARTICLE_GRAVITY * (0.55 + (lifeProgress * 0.45)))
      const dragMultiplier = Math.max(0, 1 - (particleSystem.drag[particleIndex] * physicsDeltaSeconds))

      particleSystem.velocities[positionOffset] += lateralAcceleration * physicsDeltaSeconds
      particleSystem.velocities[positionOffset + 1] += verticalAcceleration * physicsDeltaSeconds
      particleSystem.velocities[positionOffset] *= dragMultiplier
      particleSystem.velocities[positionOffset + 1] *= dragMultiplier
      particleSystem.positions[positionOffset] += particleSystem.velocities[positionOffset] * physicsDeltaSeconds
      particleSystem.positions[positionOffset + 1] += particleSystem.velocities[positionOffset + 1] * physicsDeltaSeconds
      particleSystem.sizes[particleIndex] = particleSystem.baseSizes[particleIndex] * (0.9 + (remainingLife * 0.25))
      particleSystem.alphas[particleIndex] = particleSystem.baseAlphas[particleIndex] * remainingLife * remainingLife
      particleSystem.brightnesses[particleIndex] =
        particleSystem.baseBrightnesses[particleIndex] * (0.85 + (remainingLife * 0.35))
      particleIndex += 1
    }

    particleSystem.geometry.setDrawRange(0, particleSystem.activeCount)
    this.markParticleAttributesDirty(particleSystem)
  }

  private releaseParticleSlot(index: number): void {
    const particleSystem = this.particleSystem
    if (particleSystem == null || index < 0 || index >= particleSystem.activeCount) {
      return
    }

    const lastIndex = particleSystem.activeCount - 1
    if (index !== lastIndex) {
      copyParticleScalar(particleSystem.ages, lastIndex, index)
      copyParticleScalar(particleSystem.alphas, lastIndex, index)
      copyParticleScalar(particleSystem.baseAlphas, lastIndex, index)
      copyParticleScalar(particleSystem.baseBrightnesses, lastIndex, index)
      copyParticleScalar(particleSystem.baseSizes, lastIndex, index)
      copyParticleScalar(particleSystem.brightnesses, lastIndex, index)
      copyParticleScalar(particleSystem.drag, lastIndex, index)
      copyParticleScalar(particleSystem.flowBiasX, lastIndex, index)
      copyParticleScalar(particleSystem.flowStrengths, lastIndex, index)
      copyParticleScalar(particleSystem.lifetimes, lastIndex, index)
      copyParticleScalar(particleSystem.seeds, lastIndex, index)
      copyParticleScalar(particleSystem.sizes, lastIndex, index)
      copyParticleVector3(particleSystem.colors, lastIndex, index)
      copyParticleVector3(particleSystem.positions, lastIndex, index)
      copyParticleVector3(particleSystem.velocities, lastIndex, index)
    }

    particleSystem.activeCount = lastIndex
  }

  private markParticleAttributesDirty(particleSystem: ParticleSystemState): void {
    particleSystem.positionAttribute.needsUpdate = true
    particleSystem.sizeAttribute.needsUpdate = true
    particleSystem.alphaAttribute.needsUpdate = true
    particleSystem.seedAttribute.needsUpdate = true
    particleSystem.brightnessAttribute.needsUpdate = true
    particleSystem.colorAttribute.needsUpdate = true
  }

  private syncParticleMaterialAnimationTime(): void {
    const particleSystem = this.particleSystem
    if (particleSystem == null) {
      return
    }

    particleSystem.uniforms.particleTime.value = this.noteMaterialTimeSeconds
    particleSystem.uniforms.pixelRatio.value = getDevicePixelRatio()
  }

  private resetBurstDetectionState(currentTick: number): void {
    this.lastBurstDetectionTick = currentTick
  }

  private sampleParticleFlowNoise(positionX: number, positionY: number, ageSeconds: number, seed: number): number {
    const flowTime = ageSeconds * PARTICLE_FLOW_TIME_SCROLL
    const sampleX = (positionX / PARTICLE_FLOW_SCALE) + (seed * 17.13) + flowTime
    const sampleY = (positionY / PARTICLE_FLOW_SCALE) + (seed * 29.71) - (flowTime * 0.7)
    return sampleValueNoise2D(sampleX, sampleY, mixUint32(Math.floor(seed * 0xffff_ffff)))
  }

  private getBoundaryTopDownY(x: number): number {
    const { keyboardY } = getKeyboardLayoutMetrics(this.viewportHeight)
    return keyboardY + Math.sin((x / CREATE_MODE_BOUNDARY_WAVE_LENGTH) + this.boundaryWaveTime) * CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE
  }

  private createStaticRectMesh(
    group: Group,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    opacity: number,
    z: number,
    tracksKeyboardOpacity = false,
  ): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const material = new MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      opacity,
      transparent: true,
    })
    const mesh = new Mesh(this.requireRectGeometry(), material)
    mesh.position.set(x + (width / 2), this.toSceneRectY(y, height), z)
    mesh.scale.set(width, height, 1)
    mesh.renderOrder = Math.round(z * 10)
    group.add(mesh)

    this.staticResources.push(material)
    if (tracksKeyboardOpacity) {
      this.keyboardMaterialStates.push({
        baseOpacity: opacity,
        material,
      })
    }

    return mesh
  }

  private createImpactReflectionMesh(
    group: Group,
    pitch: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const uniforms: ImpactReflectionUniforms = {
      reflectionColor: {
        value: new Color(resolveCreateModeNoteColor(pitch, getAppState().createNoteColors)),
      },
      reflectionStrength: {
        value: 0,
      },
    }
    const material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: `
        uniform vec3 reflectionColor;
        uniform float reflectionStrength;

        varying vec2 vUv;

        void main() {
          float sideFade = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
          float verticalFade = pow(clamp(vUv.y, 0.0, 1.0), 1.8);
          float alpha = reflectionStrength * sideFade * verticalFade;

          gl_FragColor = vec4(reflectionColor, alpha);
        }
      `,
      transparent: true,
      uniforms,
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
    })
    const mesh = new Mesh(this.requireRectGeometry(), material)
    mesh.position.set(x + (width / 2), this.toSceneRectY(y, height), KEYBOARD_REFLECTION_Z)
    mesh.scale.set(width, height, 1)
    mesh.renderOrder = Math.round(KEYBOARD_REFLECTION_Z * 10)
    group.add(mesh)

    this.staticResources.push(material)
    this.impactReflectionStates.set(pitch, {
      currentStrength: 0,
      durationSeconds: 0,
      material,
      mesh,
      peakStrength: 0,
      pitch,
      startTimeSeconds: Number.NaN,
      uniforms,
    })
  }

  private clearImpactReflections(): void {
    for (const impactReflection of this.impactReflectionStates.values()) {
      impactReflection.currentStrength = 0
      impactReflection.durationSeconds = 0
      impactReflection.peakStrength = 0
      impactReflection.startTimeSeconds = Number.NaN
      this.applyImpactReflectionState(impactReflection)
    }
  }

  private resolveWaveSegmentColor(
    definition: WaveLayerDefinition,
    x: number,
    state: AppState,
  ): number {
    const clampedX = clamp(x, 0, Math.max(0, this.viewportWidth - 1))
    const pitch = getKeyAtScreenX(clampedX, this.viewportWidth) ?? PIANO_MIN_PITCH
    const wavePalette = createBoundaryWavePalette(
      resolveCreateModeNoteColor(pitch, state.createNoteColors),
    )

    switch (definition.role) {
      case 'outer':
        return wavePalette.outerAuraColor
      case 'mid':
        return wavePalette.midGlowColor
      case 'core':
        return wavePalette.coreColor
    }
  }

  private createNoteMaterial(color: number): GlowMaterial {
    const notePalette = createNoteMaterialPalette(color)
    const material = new MeshLambertMaterial({
      color: notePalette.coreDiffuseColor,
      depthTest: false,
      depthWrite: false,
      emissive: notePalette.haloEmissiveColor,
      emissiveIntensity: notePalette.haloEmissiveStrength,
      opacity: 1,
      transparent: true,
    })
    const roundedNoteUniforms: RoundedNoteUniforms = {
      noteCoreDiffuseColor: { value: new Color(notePalette.coreDiffuseColor) },
      noteCoreEmissiveColor: { value: new Color(notePalette.coreEmissiveColor) },
      noteCoreEmissiveStrength: { value: notePalette.coreEmissiveStrength },
      noteHaloDiffuseColor: { value: new Color(notePalette.haloDiffuseColor) },
      noteHaloEmissiveColor: { value: new Color(notePalette.haloEmissiveColor) },
      noteHaloEmissiveStrength: { value: notePalette.haloEmissiveStrength },
      noteSwirlBrightColor: { value: new Color(notePalette.swirlBrightColor) },
      noteSwirlRecessColor: { value: new Color(notePalette.swirlRecessColor) },
      noteMaterialTime: this.sharedNoteMaterialTimeUniform,
      noteTravelPhaseOffset: { value: 0 },
      roundedRectRadius: { value: getPillNoteCornerRadius(1, 1) },
      roundedRectSize: { value: new Vector2(1, 1) },
    }

    material.userData.noteMaterialColor = color
    material.userData.roundedNoteUniforms = roundedNoteUniforms
    material.onBeforeCompile = (shader: {
      fragmentShader: string
      uniforms: Record<string, { value: unknown }>
      vertexShader: string
    }) => {
      shader.uniforms.noteCoreDiffuseColor = roundedNoteUniforms.noteCoreDiffuseColor
      shader.uniforms.noteCoreEmissiveColor = roundedNoteUniforms.noteCoreEmissiveColor
      shader.uniforms.noteCoreEmissiveStrength = roundedNoteUniforms.noteCoreEmissiveStrength
      shader.uniforms.noteHaloDiffuseColor = roundedNoteUniforms.noteHaloDiffuseColor
      shader.uniforms.noteHaloEmissiveColor = roundedNoteUniforms.noteHaloEmissiveColor
      shader.uniforms.noteHaloEmissiveStrength = roundedNoteUniforms.noteHaloEmissiveStrength
      shader.uniforms.noteSwirlBrightColor = roundedNoteUniforms.noteSwirlBrightColor
      shader.uniforms.noteSwirlRecessColor = roundedNoteUniforms.noteSwirlRecessColor
      shader.uniforms.noteMaterialTime = roundedNoteUniforms.noteMaterialTime
      shader.uniforms.noteTravelPhaseOffset = roundedNoteUniforms.noteTravelPhaseOffset
      shader.uniforms.roundedRectRadius = roundedNoteUniforms.roundedRectRadius
      shader.uniforms.roundedRectSize = roundedNoteUniforms.roundedRectSize

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vRoundedRectUv;`,
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
vRoundedRectUv = uv;`,
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 noteCoreDiffuseColor;
uniform vec3 noteHaloDiffuseColor;
uniform vec3 noteCoreEmissiveColor;
uniform vec3 noteHaloEmissiveColor;
uniform vec3 noteSwirlBrightColor;
uniform vec3 noteSwirlRecessColor;
uniform float noteCoreEmissiveStrength;
uniform float noteHaloEmissiveStrength;
uniform float noteMaterialTime;
uniform float noteTravelPhaseOffset;
uniform float roundedRectRadius;
uniform vec2 roundedRectSize;
varying vec2 vRoundedRectUv;

float roundedRectSignedDistance(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - (halfSize - vec2(radius));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float swirlHash12(vec2 point) {
  vec3 point3 = fract(vec3(point.xyx) * 0.1031);
  point3 += dot(point3, point3.yzx + 33.33);
  return fract((point3.x + point3.y) * point3.z);
}

float swirlValueNoise2D(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  vec2 smoothFraction = fraction * fraction * (3.0 - (2.0 * fraction));
  float topLeft = swirlHash12(cell);
  float topRight = swirlHash12(cell + vec2(1.0, 0.0));
  float bottomLeft = swirlHash12(cell + vec2(0.0, 1.0));
  float bottomRight = swirlHash12(cell + vec2(1.0, 1.0));
  float top = mix(topLeft, topRight, smoothFraction.x);
  float bottom = mix(bottomLeft, bottomRight, smoothFraction.x);
  return mix(top, bottom, smoothFraction.y);
}`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
vec2 roundedRectHalfSize = roundedRectSize * 0.5;
vec2 roundedRectPoint = (vRoundedRectUv - 0.5) * roundedRectSize;
float roundedRectDistance = roundedRectSignedDistance(roundedRectPoint, roundedRectHalfSize, roundedRectRadius);
float roundedRectEdge = 1.0;
float roundedRectMask = 1.0 - smoothstep(0.0, roundedRectEdge, roundedRectDistance);
if (roundedRectMask <= 0.0) {
  discard;
}
diffuseColor.a *= roundedRectMask;

float roundedRectMinDimension = max(1.0, min(roundedRectSize.x, roundedRectSize.y));
float noteEdgeBand = clamp(roundedRectMinDimension * 0.22, 1.75, 4.5);
float noteDistanceToEdge = max(0.0, -roundedRectDistance);
float noteEdgeMix = 1.0 - smoothstep(0.0, noteEdgeBand, noteDistanceToEdge);

vec2 noteHighlightUv = (vRoundedRectUv - vec2(0.5)) / vec2(0.8, 1.35);
float noteHighlightMask = exp(-dot(noteHighlightUv, noteHighlightUv) * 2.6);
noteHighlightMask *= 1.0 - (noteEdgeMix * 0.5);

float noteSwirlHeightMix = smoothstep(${NOTE_SWIRL_SHORT_NOTE_START_HEIGHT.toFixed(1)}, ${NOTE_SWIRL_SHORT_NOTE_END_HEIGHT.toFixed(1)}, roundedRectSize.y);
float noteSwirlWarpStrength = mix(${NOTE_SWIRL_SHORT_NOTE_WARP_STRENGTH.toFixed(3)}, ${NOTE_SWIRL_WARP_STRENGTH.toFixed(3)}, noteSwirlHeightMix);
float noteSwirlMainFrequency = mix(${NOTE_SWIRL_SHORT_NOTE_MAIN_FREQUENCY.toFixed(3)}, ${NOTE_SWIRL_MAIN_FREQUENCY.toFixed(3)}, noteSwirlHeightMix);
vec2 noteSwirlInteriorUv = (vRoundedRectUv - vec2(0.5)) / vec2(0.96, 1.08);
float noteSwirlInteriorMask = exp(-dot(noteSwirlInteriorUv, noteSwirlInteriorUv) * 1.2);
noteSwirlInteriorMask *= 1.0 - (noteEdgeMix * 0.72);
vec2 noteSwirlLocalCoords = roundedRectPoint / roundedRectMinDimension;
float noteSwirlSeed = noteTravelPhaseOffset;
vec2 noteSwirlSeedA = vec2((noteSwirlSeed * 7.13) + 0.37, (noteSwirlSeed * 13.57) - 0.91);
vec2 noteSwirlSeedB = vec2((noteSwirlSeed * 11.47) + 2.31, (noteSwirlSeed * 17.29) + 1.77);
vec2 noteSwirlSeedC = vec2((noteSwirlSeed * 19.91) - 1.27, (noteSwirlSeed * 23.83) + 3.41);
vec2 noteSwirlSeedD = vec2((noteSwirlSeed * 29.13) + 4.92, (noteSwirlSeed * 31.71) - 2.63);
vec2 noteSwirlWarpSampleA = (noteSwirlLocalCoords * ${NOTE_SWIRL_WARP_FREQUENCY_A.toFixed(3)}) + noteSwirlSeedA + vec2(noteMaterialTime * 0.19, -noteMaterialTime * 0.14);
vec2 noteSwirlWarpSampleB = (noteSwirlLocalCoords * ${NOTE_SWIRL_WARP_FREQUENCY_B.toFixed(3)}) + noteSwirlSeedB + vec2(-noteMaterialTime * 0.13, noteMaterialTime * 0.17);
vec2 noteSwirlWarp = (vec2(
  swirlValueNoise2D(noteSwirlWarpSampleA),
  swirlValueNoise2D(noteSwirlWarpSampleB)
) - 0.5) * 2.0;
vec2 noteSwirlCoords = (noteSwirlLocalCoords * noteSwirlMainFrequency) + (noteSwirlWarp * noteSwirlWarpStrength);
float noteSwirlMainA = swirlValueNoise2D(noteSwirlCoords + noteSwirlSeedC + vec2(noteMaterialTime * 0.23, -noteMaterialTime * 0.18));
float noteSwirlMainB = swirlValueNoise2D(
  (noteSwirlCoords * ${NOTE_SWIRL_SECOND_OCTAVE_SCALE.toFixed(2)}) + noteSwirlSeedD + vec2(-noteMaterialTime * 0.31, noteMaterialTime * 0.27)
);
float noteSwirlField = mix(noteSwirlMainA, noteSwirlMainB, ${NOTE_SWIRL_SECOND_OCTAVE_WEIGHT.toFixed(2)});
float noteSwirlRidgedField = 1.0 - abs((noteSwirlField * 2.0) - 1.0);
noteSwirlRidgedField = pow(clamp(noteSwirlRidgedField, 0.0, 1.0), 1.15);
float noteSwirlBrightField = pow(noteSwirlRidgedField, 1.55) * noteSwirlInteriorMask;
float noteSwirlRecessField = max(0.0, pow(noteSwirlRidgedField, 0.78) - pow(noteSwirlRidgedField, 1.55)) * noteSwirlInteriorMask;

float noteShimmerField = sin((vRoundedRectUv.x * 3.4) + (noteMaterialTime * 0.52))
  * sin((vRoundedRectUv.y * 2.8) - (noteMaterialTime * 0.31));
float noteShimmer = 1.0 + (noteShimmerField * 0.05);
float noteBreathing = 1.0 + (sin(noteMaterialTime * 0.4) * 0.04);
float noteAnimatedHighlight = noteHighlightMask * noteShimmer;

vec3 noteFaceColor = mix(noteCoreDiffuseColor, noteHaloDiffuseColor, noteEdgeMix);
noteFaceColor = mix(noteFaceColor, noteHaloDiffuseColor, noteAnimatedHighlight * 0.08);
noteFaceColor = mix(noteFaceColor, noteSwirlBrightColor, noteSwirlBrightField * ${NOTE_SWIRL_BRIGHT_DIFFUSE_INTENSITY.toFixed(3)});
noteFaceColor = mix(noteFaceColor, noteSwirlRecessColor, noteSwirlRecessField * ${NOTE_SWIRL_RECESS_DIFFUSE_INTENSITY.toFixed(3)});
diffuseColor.rgb = noteFaceColor;

vec3 roundedNoteEmissiveRadiance = mix(
  noteCoreEmissiveColor * noteCoreEmissiveStrength,
  noteHaloEmissiveColor * noteHaloEmissiveStrength,
  noteEdgeMix
);
roundedNoteEmissiveRadiance *= noteBreathing;
roundedNoteEmissiveRadiance += noteHaloEmissiveColor * (noteAnimatedHighlight * 0.12 * noteHaloEmissiveStrength);
roundedNoteEmissiveRadiance += noteSwirlBrightColor * (noteSwirlBrightField * ${NOTE_SWIRL_BRIGHT_EMISSIVE_INTENSITY.toFixed(3)} * noteHaloEmissiveStrength);
roundedNoteEmissiveRadiance = max(
  vec3(0.0),
  roundedNoteEmissiveRadiance - (
    noteSwirlBrightColor
    * (noteSwirlRecessField * ${NOTE_SWIRL_RECESS_EMISSIVE_INTENSITY.toFixed(3)} * noteHaloEmissiveStrength)
  )
);
roundedNoteEmissiveRadiance *= roundedRectMask;`,
        )
        .replace(
          'vec3 totalEmissiveRadiance = emissive;',
          'vec3 totalEmissiveRadiance = roundedNoteEmissiveRadiance;',
        )
    }
    material.customProgramCacheKey = () => 'rounded-note-pill-v7'
    return material
  }

  private getOrCreateNoteMesh(group: Group, index: number): Mesh<PlaneGeometry, GlowMaterial> {
    const existing = this.noteMeshes[index]
    if (existing != null) {
      return existing
    }

    const material = this.createNoteMaterial(
      resolveCreateModeNoteColor(PIANO_MIN_PITCH, getAppState().createNoteColors),
    )
    const mesh = new Mesh(this.requireRectGeometry(), material)
    mesh.visible = false
    mesh.layers.enable(BLOOM_LAYER)
    mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, noteMaterial) => {
      const roundedNoteUniforms = noteMaterial.userData.roundedNoteUniforms as RoundedNoteUniforms | undefined
      if (roundedNoteUniforms == null) {
        return
      }

      const noteWidth = Math.max(1, mesh.scale.x)
      const noteHeight = Math.max(1, mesh.scale.y)
      roundedNoteUniforms.roundedRectSize.value.set(noteWidth, noteHeight)
      roundedNoteUniforms.roundedRectRadius.value = getPillNoteCornerRadius(noteWidth, noteHeight)
    }
    group.add(mesh)
    this.noteMeshes.push(mesh)
    return mesh
  }

  private assignNoteMaterial(noteMesh: Mesh<PlaneGeometry, GlowMaterial>, color: number): void {
    const currentColor = noteMesh.material.userData.noteMaterialColor as number | undefined
    if (currentColor === color) {
      return
    }

    this.applyNoteMaterialPalette(noteMesh.material, color)
  }

  private applyNoteMaterialPalette(material: GlowMaterial, color: number): void {
    const notePalette = createNoteMaterialPalette(color)
    const roundedNoteUniforms = material.userData.roundedNoteUniforms as RoundedNoteUniforms | undefined

    material.userData.noteMaterialColor = color
    material.color.setHex(notePalette.coreDiffuseColor)
    material.emissive.setHex(notePalette.haloEmissiveColor)
    material.emissiveIntensity = notePalette.haloEmissiveStrength

    if (roundedNoteUniforms == null) {
      return
    }

    roundedNoteUniforms.noteCoreDiffuseColor.value.setHex(notePalette.coreDiffuseColor)
    roundedNoteUniforms.noteCoreEmissiveColor.value.setHex(notePalette.coreEmissiveColor)
    roundedNoteUniforms.noteCoreEmissiveStrength.value = notePalette.coreEmissiveStrength
    roundedNoteUniforms.noteHaloDiffuseColor.value.setHex(notePalette.haloDiffuseColor)
    roundedNoteUniforms.noteHaloEmissiveColor.value.setHex(notePalette.haloEmissiveColor)
    roundedNoteUniforms.noteHaloEmissiveStrength.value = notePalette.haloEmissiveStrength
    roundedNoteUniforms.noteSwirlBrightColor.value.setHex(notePalette.swirlBrightColor)
    roundedNoteUniforms.noteSwirlRecessColor.value.setHex(notePalette.swirlRecessColor)
  }

  private syncNoteMaterialAnimationTime(frameTimeMs?: number): void {
    this.noteMaterialTimeSeconds = getAnimationTimeSeconds(frameTimeMs)
    this.sharedNoteMaterialTimeUniform.value = this.noteMaterialTimeSeconds
  }

  private applyKeyboardOpacity(): void {
    for (const { baseOpacity, material } of this.keyboardMaterialStates) {
      material.opacity = clamp(baseOpacity * this.keyboardOpacity, 0, 1)
      material.needsUpdate = true
    }
  }

  private applyActiveKeyHighlights(currentTimeSeconds = this.noteMaterialTimeSeconds): boolean {
    const activePitches = new Set([
      ...this.explicitActiveKeyPitches,
      ...this.playbackActiveKeyPitches,
    ])
    let hasAnimatingHighlights = false

    for (const [pitch, state] of this.keyHighlightStates) {
      const desiredStrength = activePitches.has(pitch) ? 1 : 0
      const resolvedCurrentStrength = this.getKeyHighlightStrength(state, currentTimeSeconds)

      if (desiredStrength !== state.targetStrength) {
        state.currentStrength = resolvedCurrentStrength
        state.fromStrength = resolvedCurrentStrength
        state.targetStrength = desiredStrength
        state.transitionDurationSeconds = desiredStrength > resolvedCurrentStrength
          ? KEY_HIGHLIGHT_FADE_IN_SECONDS
          : KEY_HIGHLIGHT_FADE_OUT_SECONDS
        state.transitionStartSeconds = currentTimeSeconds
      }

      const nextStrength = this.getKeyHighlightStrength(state, currentTimeSeconds)
      state.currentStrength = nextStrength
      if (Math.abs(nextStrength - state.targetStrength) > 0.001) {
        hasAnimatingHighlights = true
      } else {
        state.currentStrength = state.targetStrength
        state.fromStrength = state.targetStrength
      }

      state.material.color.setHex(resolveCreateModeNoteColor(pitch, getAppState().createNoteColors))
      state.material.opacity = clamp(state.baseOpacity * state.currentStrength * this.keyboardOpacity, 0, 1)
      state.material.needsUpdate = true
    }

    return hasAnimatingHighlights
  }

  private applyImpactReflections(currentTimeSeconds = this.noteMaterialTimeSeconds): boolean {
    let hasAnimatingReflections = false

    for (const impactReflection of this.impactReflectionStates.values()) {
      impactReflection.currentStrength = this.getImpactReflectionStrength(impactReflection, currentTimeSeconds)
      this.applyImpactReflectionState(impactReflection)
      if (impactReflection.currentStrength > 0.001) {
        hasAnimatingReflections = true
      }
    }

    return hasAnimatingReflections
  }

  private applyImpactReflectionState(impactReflection: ImpactReflectionState): void {
    impactReflection.uniforms.reflectionStrength.value = clamp(
      impactReflection.currentStrength * this.keyboardOpacity,
      0,
      1,
    )
    impactReflection.material.needsUpdate = true
  }

  private getImpactReflectionStrength(
    impactReflection: ImpactReflectionState,
    currentTimeSeconds: number,
  ): number {
    if (
      !Number.isFinite(currentTimeSeconds) ||
      !Number.isFinite(impactReflection.startTimeSeconds) ||
      impactReflection.durationSeconds <= 0
    ) {
      return 0
    }

    const elapsedSeconds = Math.max(0, currentTimeSeconds - impactReflection.startTimeSeconds)
    if (elapsedSeconds >= impactReflection.durationSeconds) {
      return 0
    }

    const progress = clamp(elapsedSeconds / impactReflection.durationSeconds, 0, 1)
    return impactReflection.peakStrength * (1 - easeOutQuad(progress))
  }

  private getKeyHighlightStrength(state: KeyHighlightState, currentTimeSeconds: number): number {
    if (!Number.isFinite(currentTimeSeconds) || state.transitionDurationSeconds <= 0) {
      return state.targetStrength
    }

    const elapsedSeconds = Math.max(0, currentTimeSeconds - state.transitionStartSeconds)
    const progress = clamp(elapsedSeconds / state.transitionDurationSeconds, 0, 1)
    const easedProgress = state.targetStrength >= state.fromStrength
      ? easeOutCubic(progress)
      : easeOutQuad(progress)

    return lerp(state.fromStrength, state.targetStrength, easedProgress)
  }

  private disposeStaticScene(): void {
    if (this.laneGroup != null) {
      clearGroup(this.laneGroup)
    }
    if (this.keyboardGroup != null) {
      clearGroup(this.keyboardGroup)
    }

    for (const resource of this.staticResources) {
      resource.dispose()
    }

    this.staticResources = []
    this.keyboardMaterialStates = []
    this.keyHighlightStates.clear()
    this.impactReflectionStates.clear()
  }

  private disposeWaveMeshes(): void {
    if (this.waveGroup != null) {
      clearGroup(this.waveGroup)
    }

    for (const layer of this.waveLayers) {
      for (const material of layer.materials) {
        material.dispose()
      }
      layer.materials = []
      layer.segments = []
    }

    this.waveSamplePoints = []
  }

  private clearDynamicNoteObjects(): void {
    if (this.noteGroup != null) {
      clearGroup(this.noteGroup)
    }

    for (const noteMesh of this.noteMeshes) {
      noteMesh.material.dispose()
    }
  }

  private initPostprocessing(): void {
    if (this.renderer == null || this.scene == null || this.camera == null) {
      return
    }

    this.bloomComposer = new EffectComposer(this.renderer)
    this.bloomComposer.renderToScreen = false
    this.bloomComposer.setPixelRatio(getDevicePixelRatio())
    this.bloomComposer.setSize(this.viewportWidth, this.viewportHeight)

    this.bloomRenderPass = new RenderPass(this.scene, this.camera)
    this.bloomPass = new UnrealBloomPass(
      new Vector2(this.viewportWidth, this.viewportHeight),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    )
    this.bloomComposer.addPass(this.bloomRenderPass)
    this.bloomComposer.addPass(this.bloomPass)

    this.finalComposer = new EffectComposer(this.renderer)
    this.finalComposer.setPixelRatio(getDevicePixelRatio())
    this.finalComposer.setSize(this.viewportWidth, this.viewportHeight)

    this.finalRenderPass = new RenderPass(this.scene, this.camera)
    this.bloomCompositePass = new ShaderPass({
      uniforms: {
        baseTexture: { value: null },
        bloomClipY: { value: 0 },
        bloomClipFeather: { value: 0 },
        bloomDebugLineAlpha: { value: BLOOM_CLIP_DEBUG_LINE_ALPHA },
        bloomDebugLineHalfThickness: { value: 0 },
        bloomDebugView: { value: SHOW_BLOOM_DEBUG_VIEW ? 1 : 0 },
        bloomTexture: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform float bloomClipY;
        uniform float bloomClipFeather;
        uniform float bloomDebugLineAlpha;
        uniform float bloomDebugLineHalfThickness;
        uniform float bloomDebugView;
        uniform sampler2D bloomTexture;

        varying vec2 vUv;

        void main() {
          vec4 baseColor = texture2D(baseTexture, vUv);
          vec4 bloomColor = texture2D(bloomTexture, vUv);

          if (bloomDebugView > 0.5) {
            gl_FragColor = vec4(bloomColor.rgb, 1.0);
            return;
          }

          float bloomMask = smoothstep(bloomClipY - bloomClipFeather, bloomClipY + bloomClipFeather, vUv.y);
          float clipDebugLine = 1.0 - smoothstep(
            bloomDebugLineHalfThickness,
            bloomDebugLineHalfThickness * 2.0,
            abs(vUv.y - bloomClipY)
          );
          vec3 composedColor = baseColor.rgb + (bloomColor.rgb * bloomMask);
          vec3 debugColor = mix(composedColor, vec3(1.0, 0.0, 1.0), clipDebugLine * bloomDebugLineAlpha);

          gl_FragColor = vec4(debugColor, baseColor.a);
        }
      `,
    }, 'baseTexture')
    this.bloomCompositePass.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture
    this.outputPass = new OutputPass()

    this.finalComposer.addPass(this.finalRenderPass)
    this.finalComposer.addPass(this.bloomCompositePass)
    this.finalComposer.addPass(this.outputPass)

    this.updateBloomCompositeUniforms()
    this.persistentResources.push(
      this.bloomPass,
      this.bloomComposer,
      this.bloomCompositePass,
      this.outputPass,
      this.finalComposer,
    )
  }

  private updateBloomCompositeUniforms(): void {
    if (this.bloomCompositePass == null || this.bloomComposer == null || this.viewportHeight <= 0) {
      return
    }

    this.bloomCompositePass.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture
    this.bloomCompositePass.uniforms.bloomClipY.value = 1 - (this.getBloomClipTopDownY() / this.viewportHeight)
    this.bloomCompositePass.uniforms.bloomClipFeather.value = BLOOM_CLIP_FEATHER_PIXELS / this.viewportHeight
    this.bloomCompositePass.uniforms.bloomDebugLineHalfThickness.value = 0.5 / this.viewportHeight
  }

  private getBloomClipTopDownY(): number {
    const { keyboardY } = getKeyboardLayoutMetrics(this.viewportHeight)
    const widestWaveLineWidth = this.waveLayers.reduce(
      (widest, layer) => Math.max(widest, layer.definition.lineWidth),
      CREATE_MODE_BOUNDARY_CORE_THICKNESS,
    )

    // Keep the full wave thickness above the cutoff, plus a small safety buffer,
    // so the keyboard region is the first area that actually gets clipped.
    return Math.min(
      this.viewportHeight,
      keyboardY + (widestWaveLineWidth / 2) + BLOOM_CLIP_DEBUG_LINE_BUFFER_PIXELS,
    )
  }

  private renderScene(): void {
    if (this.renderer == null || this.scene == null || this.camera == null) {
      return
    }

    if (this.bloomComposer != null && this.finalComposer != null) {
      const originalLayerMask = this.camera.layers.mask

      this.camera.layers.set(BLOOM_LAYER)
      this.bloomComposer.render()
      this.camera.layers.mask = originalLayerMask
      this.finalComposer.render()
      return
    }

    this.renderer.render(this.scene, this.camera)
  }

  private toScenePointY(topDownY: number): number {
    return this.viewportHeight - topDownY
  }

  private toSceneRectY(topDownY: number, height: number): number {
    return this.viewportHeight - (topDownY + (height / 2))
  }

  private requireRectGeometry(): PlaneGeometry {
    if (this.rectGeometry == null) {
      throw new Error('ThreeRenderer rectangle geometry has not been initialized.')
    }

    return this.rectGeometry
  }

  private requireLaneGroup(): Group {
    if (this.laneGroup == null) {
      throw new Error('ThreeRenderer lane group has not been initialized.')
    }

    return this.laneGroup
  }

  private requireKeyboardGroup(): Group {
    if (this.keyboardGroup == null) {
      throw new Error('ThreeRenderer keyboard group has not been initialized.')
    }

    return this.keyboardGroup
  }

  private requireNoteGroup(): Group {
    if (this.noteGroup == null) {
      throw new Error('ThreeRenderer note group has not been initialized.')
    }

    return this.noteGroup
  }

  private requireParticleGroup(): Group {
    if (this.particleGroup == null) {
      throw new Error('ThreeRenderer particle group has not been initialized.')
    }

    return this.particleGroup
  }

  private requireWaveGroup(): Group {
    if (this.waveGroup == null) {
      throw new Error('ThreeRenderer wave group has not been initialized.')
    }

    return this.waveGroup
  }

  private isSpatialIndexReady(): boolean {
    return typeof spatialIndex.isBuilt === 'function'
      ? spatialIndex.isBuilt()
      : spatialIndex.getTotalNoteCount() > 0
  }

  private getNextNotesById(visibleNotes: IndexedNote[]): Map<string, IndexedNote> {
    const groupedNotes = new Map<string, IndexedNote[]>()

    for (const indexedNote of visibleNotes) {
      const key = `${indexedNote.trackId}:${indexedNote.note.pitch}`
      const notesForKey = groupedNotes.get(key)
      if (notesForKey == null) {
        groupedNotes.set(key, [indexedNote])
        continue
      }

      notesForKey.push(indexedNote)
    }

    const nextNotesById = new Map<string, IndexedNote>()
    for (const notesForKey of groupedNotes.values()) {
      notesForKey.sort((left, right) => left.note.startTick - right.note.startTick)
      for (let index = 0; index < notesForKey.length - 1; index += 1) {
        nextNotesById.set(notesForKey[index].note.id, notesForKey[index + 1])
      }
    }

    return nextNotesById
  }
}

function clearGroup(group: Group): void {
  while (group.children.length > 0) {
    group.remove(group.children[0])
  }
}

function hideObjects(objects: Array<{ visible: boolean }>, startIndex = 0): void {
  for (let index = startIndex; index < objects.length; index += 1) {
    objects[index].visible = false
  }
}

function createWaveSamplePoints(width: number): number[] {
  const points: number[] = [0]

  for (let x = CREATE_MODE_BOUNDARY_SEGMENT_WIDTH; x <= width; x += CREATE_MODE_BOUNDARY_SEGMENT_WIDTH) {
    points.push(x)
  }

  if (points[points.length - 1] !== width) {
    points.push(width)
  }

  return points
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(start: number, end: number, progress: number): number {
  return start + ((end - start) * clamp(progress, 0, 1))
}

function easeOutCubic(progress: number): number {
  const clampedProgress = clamp(progress, 0, 1)
  return 1 - Math.pow(1 - clampedProgress, 3)
}

function easeOutQuad(progress: number): number {
  const clampedProgress = clamp(progress, 0, 1)
  return 1 - ((1 - clampedProgress) * (1 - clampedProgress))
}

function randomBetweenFromSeed(min: number, max: number, seed: number, stream: number): number {
  return min + ((max - min) * randomFromSeed(seed, stream))
}

function applyVarianceFromSeed(baseValue: number, variance: number, seed: number, stream: number): number {
  return baseValue * (1 + randomBetweenFromSeed(-variance, variance, seed, stream))
}

function createDeterministicSeed(noteId: string, ...components: number[]): number {
  let seed = hashString(noteId)
  for (const component of components) {
    seed = mixUint32(seed ^ mixUint32(component))
  }

  return seed
}

function randomFromSeed(seed: number, stream: number): number {
  return mixUint32(seed ^ Math.imul(stream + 1, 0x9e3779b9)) / 0xffff_ffff
}

function sampleValueNoise2D(x: number, y: number, seed: number): number {
  const xFloor = Math.floor(x)
  const yFloor = Math.floor(y)
  const xFraction = smoothInterpolation(x - xFloor)
  const yFraction = smoothInterpolation(y - yFloor)
  const topLeft = randomFromGrid(xFloor, yFloor, seed)
  const topRight = randomFromGrid(xFloor + 1, yFloor, seed)
  const bottomLeft = randomFromGrid(xFloor, yFloor + 1, seed)
  const bottomRight = randomFromGrid(xFloor + 1, yFloor + 1, seed)
  const top = lerp(topLeft, topRight, xFraction)
  const bottom = lerp(bottomLeft, bottomRight, xFraction)
  return (lerp(top, bottom, yFraction) * 2) - 1
}

function randomFromGrid(x: number, y: number, seed: number): number {
  return mixUint32(seed ^ Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263)) / 0xffff_ffff
}

function smoothInterpolation(value: number): number {
  return value * value * (3 - (2 * value))
}

function hashString(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

function mixUint32(value: number): number {
  let mixed = (value >>> 0) + 0x6D2B79F5
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
  return (mixed ^ (mixed >>> 14)) >>> 0
}

function copyParticleScalar(values: Float32Array, sourceIndex: number, targetIndex: number): void {
  values[targetIndex] = values[sourceIndex]
}

function copyParticleVector3(values: Float32Array, sourceIndex: number, targetIndex: number): void {
  const sourceOffset = sourceIndex * 3
  const targetOffset = targetIndex * 3
  values[targetOffset] = values[sourceOffset]
  values[targetOffset + 1] = values[sourceOffset + 1]
  values[targetOffset + 2] = values[sourceOffset + 2]
}

function colorToNormalizedRgb(color: number): [number, number, number] {
  return [
    ((color >> 16) & 0xff) / 0xff,
    ((color >> 8) & 0xff) / 0xff,
    (color & 0xff) / 0xff,
  ]
}

function createBoundaryWavePalette(color: number): BoundaryWavePalette {
  const notePalette = createNoteMaterialPalette(color)

  return {
    coreColor: notePalette.haloEmissiveColor,
    midGlowColor: notePalette.haloDiffuseColor,
    outerAuraColor: notePalette.coreDiffuseColor,
  }
}

export function createNoteMaterialPalette(color: number): NoteMaterialPalette {
  const baseHsl = colorToHsl(color)
  const isAchromatic = baseHsl.saturation < NOTE_ACHROMATIC_SATURATION_THRESHOLD
  const paletteHue = isAchromatic ? NOTE_ACHROMATIC_FALLBACK_HUE : baseHsl.hue
  const baseSaturation = isAchromatic
    ? NOTE_ACHROMATIC_FALLBACK_SATURATION
    : clamp(baseHsl.saturation, 0.48, 0.9)
  const baseLightness = clamp(baseHsl.lightness, 0.34, 0.5)
  const highLuminanceBias = clamp((getColorRelativeLuminance(color) - 0.55) / 0.3, 0, 1)
  const haloLightnessDelta = lerp(0.12, 0.1, highLuminanceBias)
  const haloDiffuseSaturation = clamp(baseSaturation - 0.08, 0.24, 0.86)
  const swirlBrightSaturation = clamp(baseSaturation - 0.04, 0.24, 0.84)
  const swirlRecessSaturation = clamp(baseSaturation + 0.04, 0.24, 0.96)
  const coreDiffuseColor = hslToColor({
    hue: paletteHue,
    lightness: baseLightness,
    saturation: clamp(baseSaturation + 0.08, 0.24, 0.96),
  })
  let haloDiffuseLightness = clamp(baseLightness + haloLightnessDelta, 0.46, 0.62)
  let swirlBrightLightness = clamp(baseLightness + 0.22, 0.58, 0.72)
  let swirlRecessLightness = clamp(baseLightness - 0.13, 0.2, 0.4)
  let swirlBrightColor = hslToColor({
    hue: paletteHue,
    lightness: swirlBrightLightness,
    saturation: swirlBrightSaturation,
  })
  haloDiffuseLightness = resolveLightnessForLuminance({
    direction: -1,
    hue: paletteHue,
    max: haloDiffuseLightness,
    min: 0.44,
    saturation: haloDiffuseSaturation,
    start: haloDiffuseLightness,
    targetLuminance: getColorRelativeLuminance(swirlBrightColor) - NOTE_SWIRL_BRIGHT_MIN_LUMINANCE_DELTA,
  })
  let haloDiffuseColor = hslToColor({
    hue: paletteHue,
    lightness: haloDiffuseLightness,
    saturation: haloDiffuseSaturation,
  })
  swirlBrightLightness = resolveLightnessForLuminance({
    direction: 1,
    hue: paletteHue,
    max: 0.72,
    min: swirlBrightLightness,
    saturation: swirlBrightSaturation,
    start: swirlBrightLightness,
    targetLuminance: getColorRelativeLuminance(haloDiffuseColor) + NOTE_SWIRL_BRIGHT_MIN_LUMINANCE_DELTA,
  })
  swirlBrightColor = hslToColor({
    hue: paletteHue,
    lightness: swirlBrightLightness,
    saturation: swirlBrightSaturation,
  })
  haloDiffuseLightness = resolveLightnessForLuminance({
    direction: -1,
    hue: paletteHue,
    max: haloDiffuseLightness,
    min: 0.44,
    saturation: haloDiffuseSaturation,
    start: haloDiffuseLightness,
    targetLuminance: getColorRelativeLuminance(swirlBrightColor) - NOTE_SWIRL_BRIGHT_MIN_LUMINANCE_DELTA,
  })
  haloDiffuseColor = hslToColor({
    hue: paletteHue,
    lightness: haloDiffuseLightness,
    saturation: haloDiffuseSaturation,
  })
  swirlRecessLightness = resolveLightnessForLuminance({
    direction: -1,
    hue: paletteHue,
    max: swirlRecessLightness,
    min: 0.16,
    saturation: swirlRecessSaturation,
    start: swirlRecessLightness,
    targetLuminance: getColorRelativeLuminance(haloDiffuseColor) - NOTE_SWIRL_RECESS_MIN_LUMINANCE_DELTA,
  })
  const swirlRecessColor = hslToColor({
    hue: paletteHue,
    lightness: swirlRecessLightness,
    saturation: swirlRecessSaturation,
  })
  const coreEmissiveColor = hslToColor({
    hue: paletteHue,
    lightness: clamp(baseLightness + 0.07, 0.42, 0.58),
    saturation: clamp(baseSaturation + 0.02, 0.3, 0.9),
  })
  const haloEmissiveColor = hslToColor({
    hue: paletteHue,
    lightness: clamp(baseLightness + 0.17, 0.52, 0.68),
    saturation: clamp(baseSaturation - 0.02, 0.3, 0.86),
  })

  return {
    coreDiffuseColor,
    coreEmissiveColor,
    coreEmissiveStrength: resolveEmissiveStrength(
      coreDiffuseColor,
      coreEmissiveColor,
      NOTE_CORE_TARGET_TOTAL_LUMINANCE,
      NOTE_CORE_EMISSIVE_STRENGTH_MIN,
      NOTE_CORE_EMISSIVE_STRENGTH_MAX,
    ),
    haloDiffuseColor,
    haloEmissiveColor,
    haloEmissiveStrength: resolveEmissiveStrength(
      haloDiffuseColor,
      haloEmissiveColor,
      NOTE_HALO_TARGET_TOTAL_LUMINANCE,
      NOTE_HALO_EMISSIVE_STRENGTH_MIN,
      NOTE_HALO_EMISSIVE_STRENGTH_MAX,
    ),
    swirlBrightColor,
    swirlRecessColor,
  }
}

interface HslColor {
  hue: number
  lightness: number
  saturation: number
}

function colorToHsl(color: number): HslColor {
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff
  const normalizedRed = red / 0xff
  const normalizedGreen = green / 0xff
  const normalizedBlue = blue / 0xff
  const maxChannel = Math.max(normalizedRed, normalizedGreen, normalizedBlue)
  const minChannel = Math.min(normalizedRed, normalizedGreen, normalizedBlue)
  const lightness = (maxChannel + minChannel) / 2

  if (maxChannel === minChannel) {
    return {
      hue: 0,
      lightness,
      saturation: 0,
    }
  }

  const chroma = maxChannel - minChannel
  const saturation = lightness > 0.5
    ? chroma / (2 - maxChannel - minChannel)
    : chroma / (maxChannel + minChannel)
  let hue = 0

  if (maxChannel === normalizedRed) {
    hue = ((normalizedGreen - normalizedBlue) / chroma) + (normalizedGreen < normalizedBlue ? 6 : 0)
  } else if (maxChannel === normalizedGreen) {
    hue = ((normalizedBlue - normalizedRed) / chroma) + 2
  } else {
    hue = ((normalizedRed - normalizedGreen) / chroma) + 4
  }

  return {
    hue: hue / 6,
    lightness,
    saturation,
  }
}

function hslToColor(color: HslColor): number {
  const hue = ((color.hue % 1) + 1) % 1
  const saturation = clamp(color.saturation, 0, 1)
  const lightness = clamp(color.lightness, 0, 1)

  if (saturation <= 0) {
    const channel = clampChannel(lightness * 0xff)
    return (channel << 16) | (channel << 8) | channel
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - (lightness * saturation)
  const p = (2 * lightness) - q
  const red = hueToRgbChannel(p, q, hue + (1 / 3))
  const green = hueToRgbChannel(p, q, hue)
  const blue = hueToRgbChannel(p, q, hue - (1 / 3))

  return (
    (clampChannel(red * 0xff) << 16)
    | (clampChannel(green * 0xff) << 8)
    | clampChannel(blue * 0xff)
  )
}

function hueToRgbChannel(p: number, q: number, hue: number): number {
  let normalizedHue = hue
  if (normalizedHue < 0) {
    normalizedHue += 1
  }
  if (normalizedHue > 1) {
    normalizedHue -= 1
  }

  if (normalizedHue < 1 / 6) {
    return p + ((q - p) * 6 * normalizedHue)
  }
  if (normalizedHue < 1 / 2) {
    return q
  }
  if (normalizedHue < 2 / 3) {
    return p + ((q - p) * ((2 / 3) - normalizedHue) * 6)
  }

  return p
}

interface LightnessSearch {
  direction: -1 | 1
  hue: number
  max: number
  min: number
  saturation: number
  start: number
  targetLuminance: number
}

function resolveLightnessForLuminance(search: LightnessSearch): number {
  const start = clamp(search.start, search.min, search.max)
  const targetLuminance = clamp(search.targetLuminance, 0, 1)
  const steps = 64

  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps
    const lightness = search.direction > 0
      ? lerp(start, search.max, progress)
      : lerp(start, search.min, progress)
    const color = hslToColor({
      hue: search.hue,
      lightness,
      saturation: search.saturation,
    })
    const luminance = getColorRelativeLuminance(color)

    if (
      (search.direction > 0 && luminance >= targetLuminance) ||
      (search.direction < 0 && luminance <= targetLuminance)
    ) {
      return lightness
    }
  }

  return search.direction > 0 ? search.max : search.min
}

function resolveEmissiveStrength(
  diffuseColor: number,
  emissiveColor: number,
  targetTotalLuminance: number,
  minStrength: number,
  maxStrength: number,
): number {
  const diffuseLuminance = getColorRelativeLuminance(diffuseColor)
  const emissiveLuminance = Math.max(0.08, getColorRelativeLuminance(emissiveColor))

  return clamp(
    (targetTotalLuminance - diffuseLuminance) / emissiveLuminance,
    minStrength,
    maxStrength,
  )
}

export function getColorRelativeLuminance(color: number): number {
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff

  return ((red * 0.299) + (green * 0.587) + (blue * 0.114)) / 0xff
}

function clampChannel(value: number): number {
  return Math.round(clamp(value, 0, 0xff))
}

function getPillNoteCornerRadius(width: number, height: number): number {
  const minDimension = Math.max(1, Math.min(width, height))
  return Math.min(minDimension * NOTE_ROUNDED_CORNER_RATIO, NOTE_MAX_CORNER_RADIUS)
}

function getAnimationTimeSeconds(frameTimeMs?: number): number {
  if (Number.isFinite(frameTimeMs)) {
    return (frameTimeMs as number) / 1000
  }

  if (typeof performance !== 'undefined') {
    const performanceNow = performance.now()
    if (Number.isFinite(performanceNow)) {
      return performanceNow / 1000
    }
  }

  return Date.now() / 1000
}

function resolveNoteTravelPhaseOffset(note: Note): number {
  const normalizedNoteId = typeof note.id === 'string' && note.id.trim().length > 0
    ? note.id
    : `${Math.round(note.pitch)}:${Math.round(note.startTick)}`
  const phaseSeed = createDeterministicSeed(normalizedNoteId, Math.round(note.pitch), Math.round(note.startTick))
  return randomFromSeed(phaseSeed, 0)
}

function getDevicePixelRatio(): number {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio)) {
    return 1
  }

  return Math.max(1, window.devicePixelRatio)
}

export const threeRenderer = new ThreeRenderer()
