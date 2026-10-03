import {
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
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import {
  buildHandMotionTimeline,
  sampleHandMotionTimeline,
  type HandMotionTimeline,
} from '../hands'
import type { Note } from '../midi/types'
import { type PlaybackEventMap, playbackEngine } from '../playback/PlaybackEngine'
import { type IndexedNote, spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore } from '../store/store'
import { tickToSeconds } from '../tempo/tempoMap'
import { hexToPixi, resolveCreateModeNoteColor } from './colorUtils'
import { GhostHandsLayer } from './GhostHandsLayer'
import { ReactiveLightingLayer } from './ReactiveLightingLayer'
import {
  BLACK_KEY_ACTIVE_ALPHA,
  BLACK_KEY_BOTTOM_SHADOW_HEIGHT,
  BLACK_KEY_COLOR,
  BLACK_KEY_HIGHLIGHT_COLOR,
  BLACK_KEY_SHADOW_COLOR,
  KEYBOARD_HEIGHT,
  NOTE_MIN_HEIGHT,
  WHITE_KEY_ACTIVE_ALPHA,
  WHITE_KEY_BOTTOM_SHADOW_HEIGHT,
  WHITE_KEY_COLOR,
  WHITE_KEY_SEPARATOR_COLOR,
  WHITE_KEY_SEPARATOR_WIDTH,
  WHITE_KEY_SHADOW_COLOR,
  DEFAULT_RENDER_LAYOUT_CONTEXT,
  getKeyboardLayoutMetrics,
  normalizeRenderLayoutContext,
  type RenderLayoutContext,
} from './layoutConstants'
import { getNoteScreenRect, getVisibleTickWindow } from './noteMotion'
/*
INPUT: Application playback state, note data, and WebGL canvas dimensions.
OUTPUT: Lumina Piano's Three.js keyboard and visualizer scene renderer.
PURPOSE: Draws the shared keyboard scene and exposes narrowly-scoped view modes for camera, recording, and Transcriptor surfaces.
*/

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
import type {
  LiveMidiNote,
  VisualizerRenderFrameOptions,
  VisualizerRenderer,
  VisualizerResizeOptions,
} from './VisualizerRenderer'

type AppState = ReturnType<typeof getAppState>

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
const BLACK_KEY_SHADOW_ALPHA = 0.55
const WHITE_KEY_SHADOW_ALPHA = 0.3
const BLACK_KEY_HIGHLIGHT_ALPHA = 0.6
const KEYBOARD_TEXTURE_MAX_WIDTH = 6_144
const KEYBOARD_TEXTURE_MAX_HEIGHT = 1_536
const KEYBOARD_RAIL_HEIGHT_RATIO = 0.032
const WHITE_KEY_FRONT_FACE_RATIO = 0.085
const BLACK_KEY_FRONT_FACE_RATIO = 0.14
const KEYBOARD_WHITE_TOP = '#ffffff'
const KEYBOARD_WHITE_MIDDLE = '#fbfaf7'
const KEYBOARD_WHITE_BOTTOM = '#efede8'
const KEYBOARD_WHITE_FRONT_TOP = '#d3d1cb'
const KEYBOARD_WHITE_FRONT_BOTTOM = '#aaa8a3'
const KEYBOARD_WHITE_SEPARATOR = 'rgba(93, 94, 96, 0.72)'
const KEYBOARD_WHITE_EDGE_LIGHT = 'rgba(255, 255, 255, 0.9)'
const KEYBOARD_BLACK_TOP = '#090a0b'
const KEYBOARD_BLACK_MIDDLE = '#020203'
const KEYBOARD_BLACK_BOTTOM = '#000000'
const KEYBOARD_BLACK_SIDE_LIGHT = 'rgba(38, 42, 47, 0.72)'
const KEYBOARD_BLACK_SIDE_DARK = 'rgba(0, 0, 0, 0.96)'
const KEYBOARD_BLACK_FRONT_TOP = '#000000'
const KEYBOARD_BLACK_FRONT_MIDDLE = '#0a0b0d'
const KEYBOARD_BLACK_FRONT_BOTTOM = '#000000'
const KEYBOARD_BLACK_EDGE_LIGHT = 'rgba(92, 98, 106, 0.46)'
const BLACK_KEY_NOTE_INSET = 2
const BLACK_KEY_VERTICAL_INSET = 3
const LANE_GUIDE_Z = 0
const WHITE_KEY_Z = 1
const BLACK_KEY_Z = 2
const WHITE_KEY_HIGHLIGHT_Z = WHITE_KEY_Z + 0.4
const BLACK_KEY_SURFACE_Z = BLACK_KEY_Z
const BLACK_KEY_HIGHLIGHT_Z = BLACK_KEY_Z + 0.4
const KEYBOARD_DEPTH_Z = BLACK_KEY_Z + 0.7
const BLACK_NOTE_Z = 4
const WHITE_NOTE_Z = 6
const WAVE_OUTER_Z = 8
const WAVE_MID_Z = 9
const WAVE_CORE_Z = 10
const KEYBOARD_REFLECTION_Z = 3
const KEYBOARD_SABER_Z = 0.5
const KEYBOARD_SABER_HEIGHT_RATIO = 0.3
const KEYBOARD_SABER_MIN_HEIGHT = 72
const NOTE_AMBIENT_LIGHT_COLOR = 0xffffff
const NOTE_AMBIENT_LIGHT_INTENSITY = 1
const LIVE_MIDI_NOTE_TRAVEL_MS = 700
const LIVE_MIDI_NOTE_MIN_HEIGHT = 22
const LIVE_MIDI_NOTE_MAX_HEIGHT = 42
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
// Hold the original soft, distant-note look throughout the fall. This is a
// constant material treatment, not a depth/position effect, so the animated
// swirl and shimmer remain visible from spawn through impact.
const NOTE_BASE_BRIGHTNESS_SCALE = 0.68
const NOTE_BASE_DESATURATION = 0.22
const NOTE_CORE_TARGET_TOTAL_LUMINANCE = 0.9
const NOTE_HALO_TARGET_TOTAL_LUMINANCE = 1.22
const NOTE_CORE_EMISSIVE_STRENGTH_MIN = 0.2
const NOTE_CORE_EMISSIVE_STRENGTH_MAX = 8
const NOTE_HALO_EMISSIVE_STRENGTH_MIN = 0.45
const NOTE_HALO_EMISSIVE_STRENGTH_MAX = 8
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
const KEYBOARD_LABEL_Z = 7
const KEYBOARD_LABEL_RENDER_ORDER = 70
const NOTE_LABEL_Z_OFFSET = 0.25
const NOTE_LABEL_RENDER_ORDER = 75
const KEYBOARD_LABEL_VERTICAL_POSITION = 0.76
const NOTE_LABEL_MIN_RECT_HEIGHT = 20
const NOTE_LABEL_MIN_RECT_WIDTH = 12
const LABEL_TEXTURE_WIDTH = 256
const LABEL_TEXTURE_HEIGHT = 96
const WHITE_KEY_LABEL_COLOR = '#171717'
const BLACK_KEY_LABEL_COLOR = '#f5f5f5'
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
  noteStyleMode: {
    value: number
  }
  noteGlowStrength: {
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
  velocity: number
  startTimeSeconds: number
  uniforms: ImpactReflectionUniforms
}

interface KeyboardSaberUniforms {
  beamColor: {
    value: Color
  }
  beamStrength: {
    value: number
  }
}

interface KeyboardSaberState {
  material: ShaderMaterial
  mesh: Mesh<PlaneGeometry, ShaderMaterial>
  pitch: number
  uniforms: KeyboardSaberUniforms
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

/**
 * Note-local HDR calibration. UnrealBloomPass remains intentionally separate:
 * changing it would also alter particles, keys, and boundary waves.
 */
export interface NoteBloomCalibration {
  coreEmissiveStrengthMax: number
  coreTargetTotalLuminance: number
  haloEmissiveStrengthMax: number
  haloTargetTotalLuminance: number
}

export const DEFAULT_NOTE_BLOOM_CALIBRATION: Readonly<NoteBloomCalibration> = Object.freeze({
  coreEmissiveStrengthMax: NOTE_CORE_EMISSIVE_STRENGTH_MAX,
  coreTargetTotalLuminance: NOTE_CORE_TARGET_TOTAL_LUMINANCE,
  haloEmissiveStrengthMax: NOTE_HALO_EMISSIVE_STRENGTH_MAX,
  haloTargetTotalLuminance: NOTE_HALO_TARGET_TOTAL_LUMINANCE,
})

interface BoundaryWavePalette {
  coreColor: number
  midGlowColor: number
  outerAuraColor: number
}

interface SharedFloatUniform {
  value: number
}

interface BackgroundUniforms {
  backgroundAspect: { value: number }
  backgroundColor: { value: Color }
  backgroundStyle: { value: number }
  backgroundTime: SharedFloatUniform
}

interface ParticleUniforms {
  particleTime: {
    value: number
  }
  pixelRatio: {
    value: number
  }
  wispMode: {
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
  noteVelocities: Uint8Array
  pitches: Int8Array
  points: Points<BufferGeometry, ParticleMaterial>
  positionAttribute: BufferAttribute
  positions: Float32Array
  seedAttribute: BufferAttribute
  seeds: Float32Array
  sizeAttribute: BufferAttribute
  sizes: Float32Array
  uniforms: ParticleUniforms
  velocityAttribute: BufferAttribute
  velocities: Float32Array
}

interface LabelTextureState {
  aspectRatio: number
  texture: CanvasTexture
}

interface LabelSpriteState {
  aspectRatio: number
  color: string
  material: SpriteMaterial
  sprite: Sprite
  text: string
}

interface KeyboardSurfaceTextures {
  base: CanvasTexture
  depth: CanvasTexture
  details: CanvasTexture
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
  private backgroundMesh: Mesh<PlaneGeometry, ShaderMaterial> | null = null
  private backgroundUniforms: BackgroundUniforms | null = null
  private rectGeometry: PlaneGeometry | null = null
  private laneGroup: Group | null = null
  private keyboardGroup: Group | null = null
  private noteGroup: Group | null = null
  private particleGroup: Group | null = null
  private waveGroup: Group | null = null
  private ghostHandsLayer: GhostHandsLayer | null = null
  private reactiveLightingLayer: ReactiveLightingLayer | null = null
  private handMotionTimeline: HandMotionTimeline | null = null
  private lastHandProjectData: AppState['projectData'] | null = null
  private staticResources: Array<{ dispose(): void }> = []
  private persistentResources: Array<{ dispose(): void }> = []
  private keyboardMaterialStates: KeyboardMaterialState[] = []
  private keyHighlightStates = new Map<number, KeyHighlightState>()
  private impactReflectionStates = new Map<number, ImpactReflectionState>()
  private keyboardSaberStates = new Map<number, KeyboardSaberState>()
  private explicitActiveKeyPitches = new Set<number>()
  private playbackActiveKeyPitches = new Set<number>()
  private liveSourceActiveKeyPitches = new Set<number>()
  private keyboardOpacity = 1
  private viewportWidth = 1
  private viewportHeight = 1
  private layoutContext: RenderLayoutContext = DEFAULT_RENDER_LAYOUT_CONTEXT
  private effectivePixelRatio = resolveDevicePixelRatio()
  private postprocessScale = 1
  private composerPixelRatio = resolveComposerPixelRatio(this.effectivePixelRatio, this.postprocessScale)
  private hasAppliedResize = false
  private currentTick = 0
  private boundaryWaveTime = 0
  private noteMeshes: Array<Mesh<PlaneGeometry, GlowMaterial>> = []
  private keyboardLabelSprites: LabelSpriteState[] = []
  private noteLabelSprites: LabelSpriteState[] = []
  private liveMidiNotes: LiveMidiNote[] = []
  private liveNoteSources = new Map<string, LiveMidiNote[]>()
  /** Active source notes spawn entries here which finish their visual fall after release. */
  private liveFallingNotes = new Map<string, LiveMidiNote>()
  private liveNoteSourceActivityMs = new Map<string, number>()
  private liveNoteMeshes: Array<Mesh<PlaneGeometry, GlowMaterial>> = []
  private liveNoteLabelSprites: LabelSpriteState[] = []
  private visibleLiveNoteMeshCount = 0
  private sharedNoteMaterialTimeUniform: SharedFloatUniform = { value: 0 }
  private waveLayers: WaveLayerState[] = []
  private waveSamplePoints: number[] = []
  private labelTextures = new Map<string, LabelTextureState>()
  private notesDirty = true
  private noteMaterialTimeSeconds = 0
  private visibleNoteMeshCount = 0
  private lastRenderedTick = Number.NaN
  private lastRenderedWorldZoom = Number.NaN
  private lastRenderedProjectData: AppState['projectData'] | null = null
  private lastRenderedTempoMap: AppState['precomputedTempoMap'] | null = null
  private particleSystem: ParticleSystemState | null = null
  private lastParticleUpdateTimeSeconds = Number.NaN
  private lastBurstDetectionTick = Number.NaN
  private lastOfflineBurstDetectionTick = Number.NaN
  private lastOfflineWaveAnimationTimeSeconds = Number.NaN
  private hasPendingSeekSuppression = false
  private particleBurstSerial = 0
  private storeUnsubscribe: (() => void) | null = null
  private hasPendingCreateNoteColorUpdate = false
  private animationLoopAttached = false
  private isOfflineRendering = false
  private shouldRestoreAnimationLoopAfterOfflineRender = false
  private savedBoundaryWaveTimeForOfflineRender = 0
  private guideOnly = false
  private keyboardOnly = false
  private reviewTimelineTick: number | null = null

  private readonly handlePlaybackSeek: PlaybackEventMap['onSeek'] = (currentTick) => {
    this.hasPendingSeekSuppression = true
    this.resetBurstDetectionState(currentTick)
  }

  private readonly handleStoreChange = (nextState: AppState, previousState: AppState): void => {
    if (nextState.createNoteColors !== previousState.createNoteColors) {
      this.hasPendingCreateNoteColorUpdate = true
    }

    if (
      nextState.particleSettings.colorMode !== previousState.particleSettings.colorMode
      || nextState.particleSettings.customColor !== previousState.particleSettings.customColor
    ) {
      this.updateActiveParticleColors(nextState)
      this.renderScene()
    }

    if (nextState.backgroundColor !== previousState.backgroundColor) {
      this.applyBackgroundColor(nextState.backgroundColor)
    }
    if (nextState.backgroundStyle !== previousState.backgroundStyle) {
      this.applyBackgroundAppearance(nextState)
    }

    const keyboardLabelSettingsChanged =
      nextState.noteLabelsOnKeys !== previousState.noteLabelsOnKeys ||
      nextState.noteLabelSize !== previousState.noteLabelSize ||
      nextState.noteLabelFormat !== previousState.noteLabelFormat
    const fallingNoteLabelSettingsChanged =
      nextState.noteLabelsOnNotes !== previousState.noteLabelsOnNotes ||
      nextState.noteLabelFormat !== previousState.noteLabelFormat ||
      nextState.noteLabelColor !== previousState.noteLabelColor ||
      nextState.noteLabelSize !== previousState.noteLabelSize

    if (keyboardLabelSettingsChanged && this.renderer != null) {
      this.rebuildStaticScene()
    }
    if (fallingNoteLabelSettingsChanged) {
      this.notesDirty = true
    }

    if (
      nextState.noteStyle !== previousState.noteStyle
      || nextState.noteGlow !== previousState.noteGlow
      || nextState.noteOpacity !== previousState.noteOpacity
    ) {
      this.applyNoteAppearance(nextState)
    }

    if (nextState.fallSpeed !== previousState.fallSpeed) {
      this.notesDirty = true
      this.renderFrame(this.currentTick)
    }

    if (nextState.noteWidth !== previousState.noteWidth) {
      this.notesDirty = true
      this.renderFrame(this.currentTick)
    }

    if (nextState.lightingIntensity !== previousState.lightingIntensity) {
      this.updateReactiveLighting(nextState)
      this.renderScene()
    }

    if (nextState.keyboardSaber !== previousState.keyboardSaber) {
      this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
      this.renderScene()
    }

    if (
      nextState.handVisualization !== previousState.handVisualization
      || nextState.projectData !== previousState.projectData
    ) {
      this.updateGhostHands(this.reviewTimelineTick ?? this.currentTick, nextState)
      this.renderScene()
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
    this.lastRenderedProjectData = null
    this.lastRenderedTempoMap = null

    this.scene = new Scene()

    this.camera = new OrthographicCamera(0, 1, 0, 1, 0.1, 100)
    this.camera.position.set(0, 0, 10)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      canvas,
    })
    this.applyBackgroundColor(getAppState().backgroundColor)
    this.effectivePixelRatio = resolveDevicePixelRatio()
    this.postprocessScale = 1
    this.composerPixelRatio = resolveComposerPixelRatio(this.effectivePixelRatio, this.postprocessScale)
    this.renderer.setPixelRatio(this.effectivePixelRatio)
    this.renderer.toneMapping = LinearToneMapping
    this.renderer.toneMappingExposure = 1

    this.rectGeometry = new PlaneGeometry(1, 1)
    this.laneGroup = new Group()
    this.keyboardGroup = new Group()
    this.noteGroup = new Group()
    this.particleGroup = new Group()
    this.waveGroup = new Group()
    this.ghostHandsLayer = new GhostHandsLayer(this.rectGeometry)
    this.reactiveLightingLayer = new ReactiveLightingLayer(this.rectGeometry)
    this.ambientLight = new AmbientLight(NOTE_AMBIENT_LIGHT_COLOR, NOTE_AMBIENT_LIGHT_INTENSITY)

    this.initBackgroundSurface()
    if (this.backgroundMesh != null) this.scene.add(this.backgroundMesh)
    this.scene.add(this.laneGroup)
    this.scene.add(this.keyboardGroup)
    this.scene.add(this.noteGroup)
    this.scene.add(this.particleGroup)
    this.scene.add(this.waveGroup)
    this.scene.add(this.reactiveLightingLayer.group)
    this.scene.add(this.ghostHandsLayer.group)
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
    this.attachAnimationLoop()
    this.renderFrame(this.currentTick)
  }

  async destroy(): Promise<void> {
    playbackEngine.off('onSeek', this.handlePlaybackSeek)
    this.storeUnsubscribe?.()
    this.storeUnsubscribe = null
    this.clearDynamicNoteObjects()
    this.clearParticleSystem(true)
    this.disposeStaticScene()
    this.disposeLabelTextures()
    this.disposeWaveMeshes()
    this.ghostHandsLayer?.dispose()
    this.reactiveLightingLayer?.dispose()

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
    if (this.backgroundMesh != null && this.scene != null) {
      this.scene.remove(this.backgroundMesh)
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
    if (this.ghostHandsLayer != null && this.scene != null) {
      this.scene.remove(this.ghostHandsLayer.group)
    }
    if (this.reactiveLightingLayer != null && this.scene != null) {
      this.scene.remove(this.reactiveLightingLayer.group)
    }
    if (this.ambientLight != null && this.scene != null) {
      this.scene.remove(this.ambientLight)
    }

    for (const resource of this.persistentResources) {
      resource.dispose()
    }

    this.rectGeometry?.dispose()

    if (this.renderer != null) {
      this.detachAnimationLoop()
      const rendererWithContextLoss = this.renderer as WebGLRenderer & {
        forceContextLoss?: () => void
      }
      rendererWithContextLoss.forceContextLoss?.()
      this.renderer.dispose()
    }

    this.laneGroup = null
    this.backgroundMesh = null
    this.backgroundUniforms = null
    this.keyboardGroup = null
    this.noteGroup = null
    this.particleGroup = null
    this.waveGroup = null
    this.ghostHandsLayer = null
    this.reactiveLightingLayer = null
    this.handMotionTimeline = null
    this.lastHandProjectData = null
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
    this.liveSourceActiveKeyPitches.clear()
    this.liveNoteSources.clear()
    this.liveFallingNotes.clear()
    this.liveNoteSourceActivityMs.clear()
    this.keyboardOpacity = 1
    this.viewportWidth = 1
    this.viewportHeight = 1
    this.hasAppliedResize = false
    this.layoutContext = DEFAULT_RENDER_LAYOUT_CONTEXT
    this.effectivePixelRatio = resolveDevicePixelRatio()
    this.postprocessScale = 1
    this.composerPixelRatio = resolveComposerPixelRatio(this.effectivePixelRatio, this.postprocessScale)
    this.currentTick = 0
    this.boundaryWaveTime = 0
    this.noteMaterialTimeSeconds = 0
    this.sharedNoteMaterialTimeUniform.value = 0
    this.notesDirty = true
    this.visibleNoteMeshCount = 0
    this.lastRenderedTick = Number.NaN
    this.lastRenderedWorldZoom = Number.NaN
    this.lastRenderedProjectData = null
    this.lastRenderedTempoMap = null
    this.particleSystem = null
    this.lastParticleUpdateTimeSeconds = Number.NaN
    this.lastBurstDetectionTick = Number.NaN
    this.lastOfflineBurstDetectionTick = Number.NaN
    this.lastOfflineWaveAnimationTimeSeconds = Number.NaN
    this.hasPendingSeekSuppression = false
    this.particleBurstSerial = 0
    this.storeUnsubscribe = null
    this.hasPendingCreateNoteColorUpdate = false
    this.animationLoopAttached = false
    this.isOfflineRendering = false
    this.layoutContext = DEFAULT_RENDER_LAYOUT_CONTEXT
    this.shouldRestoreAnimationLoopAfterOfflineRender = false
    this.noteMeshes = []
    this.keyboardLabelSprites = []
    this.noteLabelSprites = []
    this.liveMidiNotes = []
    this.liveNoteMeshes = []
    this.liveNoteLabelSprites = []
    this.visibleLiveNoteMeshCount = 0
    this.waveLayers = []
    this.waveSamplePoints = []
    this.labelTextures.clear()
    this.persistentResources = []
    this.guideOnly = false
    this.reviewTimelineTick = null
  }

  isReady(): boolean {
    return this.canvas != null && this.renderer != null && this.scene != null && this.camera != null
  }

  beginOfflineRender(): void {
    if (this.renderer == null || this.isOfflineRendering) {
      return
    }

    this.shouldRestoreAnimationLoopAfterOfflineRender = this.animationLoopAttached
    this.isOfflineRendering = true
    this.lastOfflineBurstDetectionTick = Number.NaN
    this.lastOfflineWaveAnimationTimeSeconds = Number.NaN
    this.lastParticleUpdateTimeSeconds = Number.NaN
    this.particleBurstSerial = 0
    this.clearParticleSystem(true)
    this.savedBoundaryWaveTimeForOfflineRender = this.boundaryWaveTime
    this.boundaryWaveTime = 0
    this.detachAnimationLoop()
  }

  endOfflineRender(): void {
    if (!this.isOfflineRendering) {
      return
    }

    this.isOfflineRendering = false
    this.lastOfflineBurstDetectionTick = Number.NaN
    this.lastOfflineWaveAnimationTimeSeconds = Number.NaN
    this.boundaryWaveTime = this.savedBoundaryWaveTimeForOfflineRender
    this.updateWaveMeshes()
    const shouldRestoreAnimationLoop = this.shouldRestoreAnimationLoopAfterOfflineRender
    this.shouldRestoreAnimationLoopAfterOfflineRender = false

    if (shouldRestoreAnimationLoop) {
      this.attachAnimationLoop()
    }
  }

  resize(width: number, height: number, options?: VisualizerResizeOptions): void {
    if (this.renderer == null || this.camera == null || !Number.isFinite(width) || !Number.isFinite(height)) {
      return
    }

    const nextViewportWidth = Math.max(1, Math.round(width))
    const nextViewportHeight = Math.max(1, Math.round(height))
    const nextLayoutContext = normalizeRenderLayoutContext(options?.layoutContext ?? this.layoutContext)
    const nextEffectivePixelRatio = resolveDevicePixelRatio(options?.pixelRatio)
    const nextPostprocessScale = resolvePostprocessScale(options?.postprocessScale)
    const nextComposerPixelRatio = resolveComposerPixelRatio(nextEffectivePixelRatio, nextPostprocessScale)

    if (
      this.hasAppliedResize &&
      this.viewportWidth === nextViewportWidth &&
      this.viewportHeight === nextViewportHeight &&
      this.effectivePixelRatio === nextEffectivePixelRatio &&
      this.postprocessScale === nextPostprocessScale &&
      this.layoutContext.keyboardHeightRatio === nextLayoutContext.keyboardHeightRatio &&
      this.layoutContext.preserveKeyboardHeightRatio === nextLayoutContext.preserveKeyboardHeightRatio &&
      this.layoutContext.noteFieldTravelSeconds === nextLayoutContext.noteFieldTravelSeconds
    ) {
      return
    }

    this.viewportWidth = nextViewportWidth
    this.viewportHeight = nextViewportHeight
    this.layoutContext = nextLayoutContext
    this.effectivePixelRatio = nextEffectivePixelRatio
    this.postprocessScale = nextPostprocessScale
    this.composerPixelRatio = nextComposerPixelRatio
    this.hasAppliedResize = true

    this.renderer.setPixelRatio(this.effectivePixelRatio)
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false)
    this.bloomComposer?.setPixelRatio(this.composerPixelRatio)
    this.bloomComposer?.setSize(this.viewportWidth, this.viewportHeight)
    this.finalComposer?.setPixelRatio(this.composerPixelRatio)
    this.finalComposer?.setSize(this.viewportWidth, this.viewportHeight)
    this.updateBloomCompositeUniforms()

    this.camera.left = 0
    this.camera.right = this.viewportWidth
    this.camera.top = this.viewportHeight
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()

    if (this.backgroundMesh != null) {
      this.backgroundMesh.position.set(this.viewportWidth / 2, this.viewportHeight / 2, -10)
      this.backgroundMesh.scale.set(this.viewportWidth, this.viewportHeight, 1)
    }
    if (this.backgroundUniforms != null) {
      this.backgroundUniforms.backgroundAspect.value = this.viewportWidth / this.viewportHeight
    }

    this.rebuildStaticScene()
    this.rebuildWaveMeshes()
    this.clearParticleSystem(false)
    this.resetBurstDetectionState(this.currentTick)
    this.notesDirty = true
    this.renderDynamicState(this.currentTick)
    this.updateLiveMidiNoteLayer()
  }

  renderFrame(tick: number, options?: VisualizerRenderFrameOptions): void {
    if (Number.isFinite(tick)) {
      this.currentTick = tick
    }

    const state = getAppState()
    const renderTick = this.reviewTimelineTick ?? this.currentTick
    if (this.guideOnly) {
      this.renderGuideOnlyFrame()
      return
    }
    if (this.keyboardOnly) {
      this.syncNoteMaterialAnimationTime()
      this.renderKeyboardOnlyFrame()
      return
    }
    this.consumePendingCreateNoteColorUpdate(state)
    this.notesDirty = true
    const animationTimeSeconds = options?.animationTimeSeconds
    const isOfflineAnimationFrame =
      this.isOfflineRendering &&
      Number.isFinite(animationTimeSeconds)
    if (
      Number.isFinite(animationTimeSeconds) &&
      (animationTimeSeconds as number) < this.noteMaterialTimeSeconds
    ) {
      this.resetSimulatedAnimationState(animationTimeSeconds as number)
    }

    this.syncNoteMaterialAnimationTime(undefined, animationTimeSeconds)
    this.syncParticleMaterialAnimationTime()
    if (isOfflineAnimationFrame) {
      this.updateParticleSystem(animationTimeSeconds as number)
    }

    const notesChanged = this.renderDynamicState(renderTick, state, false)
    const hasLiveMidiNotes = this.updateLiveMidiNoteLayer()
    const shouldAnimateHighlights = this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    const shouldAnimateImpactReflections = this.applyImpactReflections(this.noteMaterialTimeSeconds)
    this.updateGhostHands(renderTick, state)

    if (isOfflineAnimationFrame) {
      this.detectOfflineNoteBursts(renderTick, state)
      this.advanceOfflineWaveAnimation(animationTimeSeconds as number)
    }

    if (!isOfflineAnimationFrame) {
      this.boundaryWaveTime += CREATE_MODE_BOUNDARY_WAVE_TIME_STEP
      this.updateWaveMeshes()
    }
    if (isOfflineAnimationFrame || notesChanged || hasLiveMidiNotes || shouldAnimateHighlights || shouldAnimateImpactReflections) {
      this.renderScene()
    }
  }

  getCanvas(): HTMLCanvasElement {
    if (this.canvas == null) {
      throw new Error('ThreeRenderer has not been initialized.')
    }

    return this.canvas
  }

  getRenderLayoutContext(): RenderLayoutContext {
    const { keyboardHeight } = this.getKeyboardMetrics()
    return {
      keyboardHeightRatio: keyboardHeight / Math.max(1, this.viewportHeight),
      preserveKeyboardHeightRatio: true,
      noteFieldTravelSeconds: this.layoutContext.noteFieldTravelSeconds,
    }
  }

  getKeyX(pitch: number): number {
    if (isBlackKey(pitch)) {
      return pitchToKeyX(pitch, this.viewportWidth) + (getBlackKeyWidth(this.viewportWidth) / 2)
    }

    const { width, x } = getWhiteKeyBounds(pitch, this.viewportWidth)
    return x + (width / 2)
  }

  private getNormalizedKeyboardPosition(pitch: number): number {
    const lowKeyX = this.getKeyX(PIANO_MIN_PITCH)
    const highKeyX = this.getKeyX(PIANO_MAX_PITCH)
    const span = highKeyX - lowKeyX
    if (span <= 0) {
      return 0
    }

    return clamp((this.getKeyX(pitch) - lowKeyX) / span, 0, 1)
  }

  private getKeyboardMetrics() {
    return getKeyboardLayoutMetrics(this.viewportHeight, this.layoutContext)
  }

  private updateGhostHands(tick: number, state = getAppState()): void {
    const layer = this.ghostHandsLayer
    const project = state.projectData
    if (
      layer == null
      || project == null
      || !state.handVisualization.enabled
      || this.guideOnly
      || this.keyboardOnly
    ) {
      layer?.hide()
      return
    }

    if (this.lastHandProjectData !== project || this.handMotionTimeline == null) {
      this.handMotionTimeline = buildHandMotionTimeline(project)
      this.lastHandProjectData = project
    }

    const { keyboardHeight, keyboardY } = this.getKeyboardMetrics()
    layer.update(sampleHandMotionTimeline(this.handMotionTimeline, tick), {
      keyboardHeight,
      keyboardY,
      opacity: state.handVisualization.opacity / 100,
      viewportHeight: this.viewportHeight,
      viewportWidth: this.viewportWidth,
    })
  }

  private updateReactiveLighting(state = getAppState()): void {
    const layer = this.reactiveLightingLayer
    if (layer == null || this.guideOnly || this.keyboardOnly || state.lightingIntensity <= 0) {
      layer?.hide()
      return
    }

    const { keyboardHeight, keyboardY } = this.getKeyboardMetrics()
    layer.update(
      [...this.keyHighlightStates.entries()].map(([pitch, highlight]) => ({
        color: typeof highlight.material.color.getHex === 'function'
          ? highlight.material.color.getHex()
          : this.resolveCreateModeColor(pitch, state.createNoteColors),
        pitch,
        strength: highlight.currentStrength * this.keyboardOpacity,
      })),
      {
        intensity: state.lightingIntensity / 100,
        keyboardHeight,
        keyboardY,
        viewportHeight: this.viewportHeight,
        viewportWidth: this.viewportWidth,
      },
    )
  }

  private getLayoutScale(): number {
    return this.getKeyboardMetrics().keyboardHeight / KEYBOARD_HEIGHT
  }

  private resolveCreateModeColor(
    pitch: number,
    createNoteColors: AppState['createNoteColors'],
    velocity = 80,
    timelineTick = this.reviewTimelineTick ?? this.currentTick,
  ): number {
    const ticksPerQuarter = getAppState().projectData?.ticksPerQuarter ?? 480
    const timelinePosition = Number.isFinite(timelineTick)
      ? timelineTick / (ticksPerQuarter * 16)
      : 0
    return resolveCreateModeNoteColor(
      pitch,
      createNoteColors,
      this.getNormalizedKeyboardPosition(pitch),
      velocity,
      timelinePosition,
    )
  }

  /** Keeps the scene and WebGL clear pass in sync with appearance/preset background changes. */
  private applyBackgroundColor(color: string): void {
    const resolvedColor = new Color(color)
    if (this.scene != null) {
      this.scene.background = resolvedColor
    }
    this.renderer?.setClearColor(resolvedColor, 1)
    this.backgroundUniforms?.backgroundColor.value.setHex(hexToPixi(color))
  }

  private applyBackgroundAppearance(state: AppState): void {
    if (this.backgroundUniforms == null) {
      return
    }

    this.backgroundUniforms.backgroundColor.value.setHex(hexToPixi(state.backgroundColor))
    this.backgroundUniforms.backgroundStyle.value = backgroundStyleMode(state.backgroundStyle)
    this.renderScene()
  }

  private initBackgroundSurface(): void {
    const state = getAppState()
    const uniforms: BackgroundUniforms = {
      backgroundAspect: { value: 1 },
      backgroundColor: { value: new Color(state.backgroundColor) },
      backgroundStyle: { value: backgroundStyleMode(state.backgroundStyle) },
      backgroundTime: this.sharedNoteMaterialTimeUniform,
    }
    const material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms,
      vertexShader: `
varying vec2 vBackgroundUv;

void main() {
  vBackgroundUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform float backgroundAspect;
uniform vec3 backgroundColor;
uniform float backgroundStyle;
uniform float backgroundTime;
varying vec2 vBackgroundUv;

float backgroundHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vBackgroundUv;
  vec2 centered = (uv - 0.5) * vec2(backgroundAspect, 1.0);
  vec3 color = backgroundColor;

  float studioMix = step(0.5, backgroundStyle) * (1.0 - step(1.5, backgroundStyle));
  float auroraMix = step(1.5, backgroundStyle) * (1.0 - step(2.5, backgroundStyle));
  float stageMix = step(2.5, backgroundStyle);
  float spotlight = exp(-pow(centered.x * 1.45, 2.0)) * smoothstep(0.0, 0.95, uv.y);
  float horizon = exp(-pow((uv.y - 0.24) * 7.0, 2.0));
  float vignette = smoothstep(0.3, 0.92, length(centered * vec2(0.78, 1.0)));
  vec3 studioColor = backgroundColor + (vec3(0.12, 0.14, 0.18) * spotlight * 0.42);
  studioColor += vec3(0.10, 0.12, 0.16) * horizon * 0.18;
  studioColor *= 1.0 - (vignette * 0.58);
  color = mix(color, studioColor, studioMix);

  float ribbonA = exp(-pow((uv.y - (0.67 + sin((uv.x * 4.8) + (backgroundTime * 0.18)) * 0.10)) * 10.0, 2.0));
  float ribbonB = exp(-pow((uv.y - (0.48 + sin((uv.x * 6.1) - (backgroundTime * 0.13) + 1.8) * 0.08)) * 13.0, 2.0));
  vec3 accentA = backgroundColor.brg + vec3(0.08, 0.16, 0.24);
  vec3 accentB = backgroundColor.gbr + vec3(0.20, 0.08, 0.24);
  float starCell = backgroundHash(floor(uv * vec2(180.0, 100.0)));
  float stars = step(0.992, starCell) * (0.35 + (0.65 * sin((backgroundTime * 0.7) + (starCell * 20.0))));
  vec3 auroraColor = backgroundColor * (0.72 - (vignette * 0.34));
  auroraColor += accentA * ribbonA * 0.34;
  auroraColor += accentB * ribbonB * 0.26;
  auroraColor += vec3(max(0.0, stars)) * 0.25;
  color = mix(color, auroraColor, auroraMix);

  float stageFloorMask = 1.0 - smoothstep(0.38, 0.46, uv.y);
  float stageFloorDepth = clamp((0.44 - uv.y) / 0.44, 0.0, 1.0);
  float stagePerspectiveDepth = 1.0 / max(0.055, 0.46 - uv.y);
  float stageHorizontalCell = abs(fract(stagePerspectiveDepth * 0.16) - 0.5);
  float stageHorizontalGrid = (1.0 - smoothstep(0.43, 0.49, stageHorizontalCell)) * stageFloorMask;
  float stagePerspectiveX = centered.x / max(0.09, 0.52 - uv.y);
  float stageVerticalCell = abs(fract(stagePerspectiveX * 1.6) - 0.5);
  float stageVerticalGrid = (1.0 - smoothstep(0.44, 0.49, stageVerticalCell)) * stageFloorMask;
  float stageLeftSpot = exp(-pow((centered.x + 0.34 + ((uv.y - 0.42) * 0.24)) * 4.1, 2.0));
  float stageRightSpot = exp(-pow((centered.x - 0.34 - ((uv.y - 0.42) * 0.24)) * 4.1, 2.0));
  float stageSpotMask = smoothstep(0.30, 0.96, uv.y) * (1.0 - (stageFloorMask * 0.72));
  float stageHorizon = exp(-pow((uv.y - 0.43) * 24.0, 2.0));
  vec3 stageAccent = backgroundColor.brg + vec3(0.14, 0.10, 0.22);
  vec3 stageColor = backgroundColor * (0.42 - (vignette * 0.18));
  stageColor += stageAccent * (stageLeftSpot + stageRightSpot) * stageSpotMask * 0.12;
  stageColor += stageAccent * (stageHorizontalGrid + stageVerticalGrid) * stageFloorDepth * 0.18;
  stageColor += stageAccent * stageHorizon * 0.24;
  color = mix(color, stageColor, stageMix);

  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}`,
    })
    material.toneMapped = false
    const mesh = new Mesh(this.requireRectGeometry(), material)
    mesh.renderOrder = -100
    this.backgroundUniforms = uniforms
    this.backgroundMesh = mesh
    this.persistentResources.push(material)
  }

  getKeyboardY(): number {
    return this.getKeyboardMetrics().keyboardY
  }

  setKeyboardOpacity(opacity: number): void {
    this.keyboardOpacity = clamp(opacity, 0, 1)
    this.applyKeyboardOpacity()
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.applyImpactReflections(this.noteMaterialTimeSeconds)
    this.renderScene()
  }

  setGuideOnly(guideOnly: boolean): void {
    if (this.guideOnly === guideOnly) {
      return
    }

    this.guideOnly = guideOnly
    this.notesDirty = true
    if (guideOnly) {
      this.renderGuideOnlyFrame()
      return
    }

    this.syncWaveVisibility()
    this.syncParticleVisibility()
    this.renderFrame(this.currentTick)
  }

  setKeyboardOnly(keyboardOnly: boolean): void {
    if (this.keyboardOnly === keyboardOnly) {
      return
    }

    this.keyboardOnly = keyboardOnly
    this.notesDirty = true
    // CanvasArea applies view-mode effects before async renderer init and
    // during teardown. Persist the requested state, but never render into a
    // disposed scene.
    if (!this.isReady()) {
      return
    }
    if (keyboardOnly) {
      this.renderKeyboardOnlyFrame()
      return
    }

    this.syncWaveVisibility()
    this.syncParticleVisibility()
    for (const label of this.keyboardLabelSprites) {
      label.sprite.visible = true
    }
    this.renderFrame(this.currentTick)
  }

  setReviewTimelineTick(tick: number | null): void {
    this.reviewTimelineTick = tick != null && Number.isFinite(tick) ? Math.max(0, tick) : null
    this.notesDirty = true
    this.renderFrame(this.currentTick)
  }

  setActiveKeyPitches(pitches: Iterable<number>): void {
    this.explicitActiveKeyPitches = new Set(Array.from(pitches, (pitch) => Math.round(pitch)))
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.renderScene()
  }

  setLiveMidiNotes(notes: readonly LiveMidiNote[]): void {
    this.setLiveNoteSource('legacy-midi', notes)
  }

  setLiveNoteSource(sourceId: string, notes: readonly LiveMidiNote[]): void {
    const previousNoteStarts = new Map(this.liveMidiNotes.map((note) => [note.id, note.startedAtMs]))
    const normalizedNotes = notes
      .filter((note) => (
        typeof note.id === 'string' &&
        Number.isFinite(note.pitch) &&
        Number.isFinite(note.startedAtMs) &&
        Number.isFinite(note.velocity)
      ))
      .map((note) => ({
        id: note.id,
        pitch: Math.round(note.pitch),
        startedAtMs: note.startedAtMs,
        velocity: Math.max(0, Math.min(127, note.velocity)),
      }))

    if (sourceId === 'pointer-keyboard' && (this.liveNoteSources.get('record-midi')?.length ?? 0) > 0) {
      this.liveNoteSources.delete(sourceId)
    } else if (normalizedNotes.length === 0) {
      this.liveNoteSources.delete(sourceId)
    } else {
      this.liveNoteSources.set(sourceId, normalizedNotes)
    }

    // Record MIDI activity is tracked for both note-on and note-off messages:
    // a just-released physical key should still suppress a competing pointer
    // drag for the short hand-off window.
    if (normalizedNotes.length > 0 || sourceId === 'record-midi') {
      this.liveNoteSourceActivityMs.set(sourceId, getMonotonicNowMs())
    }

    // A physical keyboard takes precedence immediately, including over a
    // pointer note that began just before the device's first message.
    if (sourceId === 'record-midi' && normalizedNotes.length > 0) {
      this.liveNoteSources.delete('pointer-keyboard')
    }

    this.liveMidiNotes = [...this.liveNoteSources.values()].flat()
    this.liveSourceActiveKeyPitches = new Set(this.liveMidiNotes.map((note) => note.pitch))
    const createColors = getAppState().createNoteColors
    if (createColors.mode === 'dynamic' || createColors.mode === 'random') {
      for (const note of this.liveMidiNotes) {
        const keyHighlight = this.keyHighlightStates.get(note.pitch)
        keyHighlight?.material.color.setHex(this.resolveCreateModeColor(
          note.pitch,
          createColors,
          note.velocity,
          note.startedAtMs,
        ))
      }
    }

    for (const note of this.liveMidiNotes) {
      if (previousNoteStarts.get(note.id) !== note.startedAtMs) {
        this.liveFallingNotes.set(`${note.id}:${note.startedAtMs}`, note)
      }
    }

    if (this.renderer == null) {
      return
    }

    if (this.keyboardOnly) {
      this.syncNoteMaterialAnimationTime()
      this.renderKeyboardOnlyFrame()
      return
    }

    this.updateLiveMidiNoteLayer()
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.renderScene()
  }

  isLiveNoteSourceActiveOrRecent(sourceId: string, recentWindowMs = 600): boolean {
    if ((this.liveNoteSources.get(sourceId)?.length ?? 0) > 0) {
      return true
    }

    const lastActivity = this.liveNoteSourceActivityMs.get(sourceId)
    return lastActivity != null && getMonotonicNowMs() - lastActivity <= Math.max(0, recentWindowMs)
  }

  private consumePendingCreateNoteColorUpdate(state: AppState): boolean {
    if (!this.hasPendingCreateNoteColorUpdate || this.renderer == null) {
      return false
    }

    this.hasPendingCreateNoteColorUpdate = false
    this.updateKeyHighlightColors(state)
    this.updateKeyboardSaberColors(state)
    this.updateImpactReflectionColors(state)
    this.updateVisibleNoteMaterialColors(state)
    this.updateWaveLayerColors(state)
    this.updateActiveParticleColors(state)
    return true
  }

  private updateKeyHighlightColors(state: AppState): void {
    for (const [pitch, keyHighlight] of this.keyHighlightStates) {
      keyHighlight.material.color.setHex(this.resolveCreateModeColor(pitch, state.createNoteColors))
      keyHighlight.material.needsUpdate = true
    }
  }

  private updateKeyboardSaberColors(state: AppState): void {
    for (const keyboardSaber of this.keyboardSaberStates.values()) {
      keyboardSaber.uniforms.beamColor.value.setHex(
        this.resolveCreateModeColor(keyboardSaber.pitch, state.createNoteColors),
      )
      keyboardSaber.material.needsUpdate = true
    }
  }

  private updateImpactReflectionColors(state: AppState): void {
    for (const impactReflection of this.impactReflectionStates.values()) {
      impactReflection.uniforms.reflectionColor.value.setHex(
        this.resolveCreateModeColor(impactReflection.pitch, state.createNoteColors, impactReflection.velocity),
      )
      impactReflection.material.needsUpdate = true
    }
  }

  private updateVisibleNoteMaterialColors(state: AppState): void {
    for (const noteMesh of [...this.noteMeshes, ...this.liveNoteMeshes]) {
      if (!noteMesh.visible) {
        continue
      }

      const notePitch = noteMesh.userData.notePitch as number | undefined
      const noteVelocity = noteMesh.userData.noteVelocity as number | undefined
      const noteStartTick = noteMesh.userData.noteStartTick as number | undefined
      if (notePitch == null) {
        continue
      }

      this.assignNoteMaterial(noteMesh, this.resolveCreateModeColor(
        notePitch,
        state.createNoteColors,
        noteVelocity,
        noteStartTick,
      ))
    }
  }

  private readonly handleAnimationFrame = (frameTimeMs?: number): void => {
    if (this.renderer == null || this.scene == null || this.camera == null) {
      return
    }

    const state = getAppState()
    if (this.guideOnly) {
      this.renderGuideOnlyFrame()
      return
    }
    if (this.keyboardOnly) {
      this.syncNoteMaterialAnimationTime(frameTimeMs)
      this.renderKeyboardOnlyFrame()
      return
    }
    this.consumePendingCreateNoteColorUpdate(state)
    if (Number.isFinite(state.currentTick) && state.currentTick !== this.currentTick) {
      this.currentTick = state.currentTick
      this.notesDirty = true
    }

    this.syncNoteMaterialAnimationTime(frameTimeMs)
    this.syncParticleMaterialAnimationTime()
    this.updateParticleSystem(getAnimationTimeSeconds(frameTimeMs))
    const renderTick = this.reviewTimelineTick ?? this.currentTick
    this.renderDynamicState(renderTick, state, false)
    this.updateLiveMidiNoteLayer()
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.applyImpactReflections(this.noteMaterialTimeSeconds)
    this.updateGhostHands(renderTick, state)
    this.detectNoteBursts(renderTick, state)

    this.boundaryWaveTime += CREATE_MODE_BOUNDARY_WAVE_TIME_STEP
    this.updateWaveMeshes()
    this.renderScene()
  }

  private renderGuideOnlyFrame(): void {
    this.ghostHandsLayer?.hide()
    this.reactiveLightingLayer?.hide()
    hideObjects(this.noteMeshes, 0)
    hideObjects(this.liveNoteMeshes, 0)
    hideLabelSprites(this.noteLabelSprites, 0)
    hideLabelSprites(this.liveNoteLabelSprites, 0)
    this.visibleNoteMeshCount = 0
    this.visibleLiveNoteMeshCount = 0
    this.clearParticleSystem(false)
    if (this.waveGroup != null) {
      this.waveGroup.visible = false
    }
    if (this.particleGroup != null) {
      this.particleGroup.visible = false
    }
    for (const keyHighlight of this.keyHighlightStates.values()) {
      keyHighlight.material.opacity = 0
      keyHighlight.material.needsUpdate = true
    }
    for (const reflection of this.impactReflectionStates.values()) {
      reflection.material.opacity = 0
      reflection.material.needsUpdate = true
    }
    this.renderScene()
  }

  /**
   * Transcriptor owns the upper canvas with an SVG score, but deliberately
   * retains this exact full-canvas keyboard geometry and live key highlights.
   * It does not derive timing from previous frames; only visible effects hide.
   */
  private renderKeyboardOnlyFrame(): void {
    this.ghostHandsLayer?.hide()
    this.reactiveLightingLayer?.hide()
    hideObjects(this.noteMeshes, 0)
    hideObjects(this.liveNoteMeshes, 0)
    hideLabelSprites(this.noteLabelSprites, 0)
    hideLabelSprites(this.liveNoteLabelSprites, 0)
    // The Transcriptor's optional labels are rendered above active keys by
    // its React overlay. Suppress static key names to keep the score clean.
    hideLabelSprites(this.keyboardLabelSprites, 0)
    this.visibleNoteMeshCount = 0
    this.visibleLiveNoteMeshCount = 0
    this.clearParticleSystem(false)
    if (this.waveGroup != null) {
      this.waveGroup.visible = false
    }
    if (this.particleGroup != null) {
      this.particleGroup.visible = false
    }
    for (const reflection of this.impactReflectionStates.values()) {
      reflection.material.opacity = 0
      reflection.material.needsUpdate = true
    }
    this.applyActiveKeyHighlights(this.noteMaterialTimeSeconds)
    this.renderScene()
  }

  private renderDynamicState(
    currentTick: number,
    state = getAppState(),
    shouldRender = true,
  ): boolean {
    const projectOrTempoChanged =
      this.lastRenderedProjectData !== state.projectData ||
      this.lastRenderedTempoMap !== state.precomputedTempoMap
    const shouldRefreshNotes =
      this.notesDirty ||
      this.lastRenderedTick !== currentTick ||
      this.lastRenderedWorldZoom !== state.worldZoom ||
      projectOrTempoChanged

    if (!shouldRefreshNotes) {
      if (shouldRender) {
        this.renderScene()
      }
      return false
    }

    this.updateNoteLayer(currentTick, state)
    this.updatePlaybackActiveKeys(currentTick, state)
    this.syncWaveVisibility()
    this.syncParticleVisibility()

    if (projectOrTempoChanged) {
      this.clearParticleSystem(false)
      this.clearImpactReflections()
      this.particleBurstSerial = 0
      this.resetBurstDetectionState(currentTick)
    }

    this.notesDirty = false
    this.lastRenderedTick = currentTick
    this.lastRenderedWorldZoom = state.worldZoom
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
    const { keyboardHeight, keyboardY } = this.getKeyboardMetrics()
    const roundedKeyboardHeight = Math.round(keyboardHeight)
    const blackKeyWidth = Math.max(1, Math.round(getBlackKeyWidth(this.viewportWidth)))
    const blackKeyHeight = Math.max(1, Math.round(keyboardHeight * CREATE_MODE_BLACK_KEY_HEIGHT_RATIO))
    const keyboardTextures = this.createKeyboardSurfaceTextures(
      this.viewportWidth,
      roundedKeyboardHeight,
    )

    if (keyboardTextures == null) {
      this.buildFallbackKeyboardSurface(
        keyboardGroup,
        keyboardY,
        roundedKeyboardHeight,
        blackKeyWidth,
        blackKeyHeight,
      )
    } else {
      this.createStaticTextureRectMesh(
        keyboardGroup,
        0,
        keyboardY,
        this.viewportWidth,
        roundedKeyboardHeight,
        keyboardTextures.base,
        1,
        WHITE_KEY_Z,
        true,
      ).userData.keyboardLayer = 'base'
      this.createStaticTextureRectMesh(
        keyboardGroup,
        0,
        keyboardY,
        this.viewportWidth,
        roundedKeyboardHeight,
        keyboardTextures.details,
        1,
        BLACK_KEY_SURFACE_Z,
        true,
      ).userData.keyboardLayer = 'details'
      this.createStaticTextureRectMesh(
        keyboardGroup,
        0,
        keyboardY,
        this.viewportWidth,
        roundedKeyboardHeight,
        keyboardTextures.depth,
        1,
        KEYBOARD_DEPTH_Z,
        true,
      ).userData.keyboardLayer = 'depth'
    }

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

      const highlight = this.createStaticRectMesh(
        keyboardGroup,
        whiteKeyBounds.x,
        keyboardY,
        whiteKeyWidth,
        whiteKeyHeight,
        this.resolveCreateModeColor(pitch, getAppState().createNoteColors),
        0,
        WHITE_KEY_HIGHLIGHT_Z,
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
      this.createKeyboardSaberMesh(
        keyboardGroup,
        pitch,
        whiteKeyBounds.x,
        whiteKeyWidth,
        keyboardY,
      )
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

      const highlight = this.createStaticRectMesh(
        keyboardGroup,
        keyX + 1,
        keyboardY + 1,
        Math.max(1, blackKeyWidth - 2),
        Math.max(1, blackFaceHeight - 2),
        this.resolveCreateModeColor(pitch, getAppState().createNoteColors),
        0,
        BLACK_KEY_HIGHLIGHT_Z,
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
      this.createKeyboardSaberMesh(
        keyboardGroup,
        pitch,
        keyX,
        blackKeyWidth,
        keyboardY,
      )
      this.createImpactReflectionMesh(
        keyboardGroup,
        pitch,
        keyX,
        keyboardY,
        blackKeyWidth,
        Math.max(6, Math.min(blackFaceHeight, Math.round(IMPACT_REFLECTION_HEIGHT * 0.82))),
      )
    }

    if (getAppState().noteLabelsOnKeys) {
      this.buildKeyboardLabels(keyboardGroup)
    }
  }

  private buildFallbackKeyboardSurface(
    keyboardGroup: Group,
    keyboardY: number,
    keyboardHeight: number,
    blackKeyWidth: number,
    blackKeyHeight: number,
  ): void {
    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (isBlackKey(pitch)) continue
      const bounds = getWhiteKeyBounds(pitch, this.viewportWidth)
      const hasSeparator = getWhiteKeyIndex(pitch) < PIANO_WHITE_KEY_COUNT - 1
      const width = hasSeparator
        ? Math.max(1, bounds.width - WHITE_KEY_SEPARATOR_WIDTH)
        : bounds.width
      const height = Math.max(1, keyboardHeight - WHITE_KEY_BOTTOM_INSET)
      this.createStaticRectMesh(
        keyboardGroup,
        bounds.x,
        keyboardY,
        width,
        height,
        WHITE_KEY_COLOR,
        1,
        WHITE_KEY_Z,
        true,
      )
      this.createStaticRectMesh(
        keyboardGroup,
        bounds.x,
        keyboardY + keyboardHeight - WHITE_KEY_BOTTOM_SHADOW_HEIGHT - WHITE_KEY_BOTTOM_INSET,
        width,
        WHITE_KEY_BOTTOM_SHADOW_HEIGHT,
        WHITE_KEY_SHADOW_COLOR,
        WHITE_KEY_SHADOW_ALPHA,
        BLACK_KEY_SURFACE_Z,
        true,
      )
      if (hasSeparator) {
        this.createStaticRectMesh(
          keyboardGroup,
          bounds.x + width,
          keyboardY,
          WHITE_KEY_SEPARATOR_WIDTH,
          height,
          WHITE_KEY_SEPARATOR_COLOR,
          0.65,
          BLACK_KEY_SURFACE_Z,
          true,
        )
      }
    }

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) continue
      const x = Math.round(pitchToKeyX(pitch, this.viewportWidth))
      const faceHeight = Math.max(1, blackKeyHeight - BLACK_KEY_BOTTOM_INSET)
      this.createStaticRectMesh(
        keyboardGroup,
        x + 2,
        keyboardY + 3,
        blackKeyWidth,
        faceHeight,
        BLACK_KEY_SHADOW_COLOR,
        BLACK_KEY_SHADOW_ALPHA,
        BLACK_KEY_SURFACE_Z,
        true,
      )
      this.createStaticRectMesh(
        keyboardGroup,
        x,
        keyboardY,
        blackKeyWidth,
        faceHeight,
        BLACK_KEY_COLOR,
        1,
        BLACK_KEY_SURFACE_Z,
        true,
      )
      this.createStaticRectMesh(
        keyboardGroup,
        x + 1,
        keyboardY + blackKeyHeight - BLACK_KEY_BOTTOM_SHADOW_HEIGHT - BLACK_KEY_BOTTOM_INSET,
        Math.max(1, blackKeyWidth - 2),
        BLACK_KEY_BOTTOM_SHADOW_HEIGHT,
        BLACK_KEY_HIGHLIGHT_COLOR,
        BLACK_KEY_HIGHLIGHT_ALPHA,
        KEYBOARD_DEPTH_Z,
        true,
      )
    }
  }

  private buildKeyboardLabels(keyboardGroup: Group): void {
    const state = getAppState()
    const { keyboardHeight, keyboardY } = this.getKeyboardMetrics()
    const blackKeyHeight = Math.max(1, Math.round(keyboardHeight * CREATE_MODE_BLACK_KEY_HEIGHT_RATIO))

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      const blackKey = isBlackKey(pitch)
      const bounds = blackKey
        ? { width: Math.max(1, Math.round(getBlackKeyWidth(this.viewportWidth))), x: Math.round(pitchToKeyX(pitch, this.viewportWidth)) }
        : getWhiteKeyBounds(pitch, this.viewportWidth)
      const keyHeight = blackKey ? blackKeyHeight : keyboardHeight
      const topDownY = keyboardY + (keyHeight * KEYBOARD_LABEL_VERTICAL_POSITION)
      const label = this.createLabelSprite(
        formatMidiNoteName(pitch, state.noteLabelFormat),
        blackKey ? BLACK_KEY_LABEL_COLOR : WHITE_KEY_LABEL_COLOR,
        true,
      )
      if (label == null) {
        continue
      }

      const aspect = this.getLabelAspectRatio(label)
      const desiredHeight = clamp(state.noteLabelSize * 1.4, 12, Math.max(12, keyHeight * 0.24))
      const labelWidth = Math.min(bounds.width * 0.9, desiredHeight * aspect)
      const labelHeight = labelWidth / aspect
      label.sprite.position.set(
        bounds.x + (bounds.width / 2),
        this.toScenePointY(topDownY),
        KEYBOARD_LABEL_Z,
      )
      label.sprite.scale.set(labelWidth, labelHeight, 1)
      label.sprite.renderOrder = KEYBOARD_LABEL_RENDER_ORDER
      label.sprite.visible = true
      keyboardGroup.add(label.sprite)
      this.keyboardLabelSprites.push(label)
    }
  }

  private updateNoteLayer(currentTick: number, state: AppState): void {
    const noteGroup = this.requireNoteGroup()
    if (state.projectData == null || state.precomputedTempoMap == null || !this.isSpatialIndexReady()) {
      hideObjects(this.noteMeshes)
      hideLabelSprites(this.noteLabelSprites)
      this.visibleNoteMeshCount = 0
      return
    }

    const { keyboardY } = this.getKeyboardMetrics()
    const currentSeconds = tickToSeconds(currentTick, state.precomputedTempoMap)
    const visibleTickWindow = getVisibleTickWindow(
      currentTick,
      currentSeconds,
      state.precomputedTempoMap,
      keyboardY,
      state.worldZoom * (state.fallSpeed / 100),
      this.layoutContext,
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
    hideLabelSprites(this.noteLabelSprites, noteMeshIndex)
    this.visibleNoteMeshCount = noteMeshIndex
  }

  private updateLiveMidiNoteLayer(): boolean {
    if (this.noteGroup == null || this.rectGeometry == null) {
      return false
    }

    const nowMs = this.noteMaterialTimeSeconds * 1000
    const { keyboardY } = this.getKeyboardMetrics()
    let noteMeshIndex = 0

    for (const [noteKey, note] of this.liveFallingNotes) {
      const elapsedMs = Math.max(0, nowMs - note.startedAtMs)
      if (elapsedMs >= LIVE_MIDI_NOTE_TRAVEL_MS || note.pitch < PIANO_MIN_PITCH || note.pitch > PIANO_MAX_PITCH) {
        this.liveFallingNotes.delete(noteKey)
        continue
      }

      const progress = elapsedMs / LIVE_MIDI_NOTE_TRAVEL_MS
      const noteIsBlack = isBlackKey(note.pitch)
      const whiteKeyBounds = noteIsBlack ? null : getWhiteKeyBounds(note.pitch, this.viewportWidth)
      const baseWidth = noteIsBlack ? getBlackKeyWidth(this.viewportWidth) : whiteKeyBounds!.width
      const inset = noteIsBlack ? BLACK_KEY_NOTE_INSET : 0
      const fullWidth = Math.max(4, baseWidth - (inset * 2))
      const width = Math.max(4, fullWidth * (getAppState().noteWidth / 100))
      const height = LIVE_MIDI_NOTE_MIN_HEIGHT + (
        (LIVE_MIDI_NOTE_MAX_HEIGHT - LIVE_MIDI_NOTE_MIN_HEIGHT) * (note.velocity / 127)
      )
      const baseX = noteIsBlack
        ? pitchToKeyX(note.pitch, this.viewportWidth) + inset
        : whiteKeyBounds!.x
      const x = baseX + ((fullWidth - width) / 2)
      const y = Math.max(0, (keyboardY - height) * progress)
      const mesh = this.getOrCreateLiveNoteMesh(this.noteGroup, noteMeshIndex)
      const noteCenterX = x + (width / 2)

      mesh.userData.notePitch = note.pitch
      mesh.userData.noteVelocity = note.velocity
      mesh.userData.noteStartTick = note.startedAtMs
      this.assignNoteMaterial(mesh, this.resolveCreateModeColor(
        note.pitch,
        getAppState().createNoteColors,
        note.velocity,
        note.startedAtMs,
      ))
      const roundedNoteUniforms = mesh.material.userData.roundedNoteUniforms as RoundedNoteUniforms | undefined
      if (roundedNoteUniforms != null) {
        roundedNoteUniforms.noteTravelPhaseOffset.value = 0
      }
      mesh.position.set(
        noteCenterX,
        this.toSceneRectY(y, height),
        noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z,
      )
      mesh.scale.set(width, height, 1)
      mesh.renderOrder = Math.round((noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z) * 10)
      mesh.visible = true
      this.updateFallingNoteLabel(
        this.liveNoteLabelSprites,
        this.noteGroup,
        noteMeshIndex,
        note.pitch,
        { h: height, w: width, x, y },
        noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z,
        getAppState(),
      )
      noteMeshIndex += 1
    }

    hideObjects(this.liveNoteMeshes, noteMeshIndex)
    hideLabelSprites(this.liveNoteLabelSprites, noteMeshIndex)
    this.visibleLiveNoteMeshCount = noteMeshIndex
    return noteMeshIndex > 0
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
        layoutContext: this.layoutContext,
        noteWidthScale: state.noteWidth / 100,
        tempoMap: state.precomputedTempoMap!,
        worldZoom: state.worldZoom * (state.fallSpeed / 100),
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
    const noteColor = this.resolveCreateModeColor(
      indexedNote.note.pitch,
      state.createNoteColors,
      indexedNote.note.velocity,
      indexedNote.note.startTick,
    )
    const noteMesh = this.getOrCreateNoteMesh(group, noteMeshIndex)
    const noteCenterX = adjustedRect.x + (adjustedRect.w / 2)

    noteMesh.userData.notePitch = indexedNote.note.pitch
    noteMesh.userData.noteStartTick = indexedNote.note.startTick
    noteMesh.userData.noteVelocity = indexedNote.note.velocity
    this.assignNoteMaterial(noteMesh, noteColor)
    const roundedNoteUniforms = noteMesh.material.userData.roundedNoteUniforms as RoundedNoteUniforms | undefined
    if (roundedNoteUniforms != null) {
      roundedNoteUniforms.noteTravelPhaseOffset.value = resolveNoteTravelPhaseOffset(indexedNote.note)
    }
    noteMesh.position.set(
      noteCenterX,
      this.toSceneRectY(adjustedRect.y, adjustedRect.h),
      noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z,
    )
    noteMesh.scale.set(adjustedRect.w, adjustedRect.h, 1)
    noteMesh.renderOrder = Math.round((noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z) * 10)
    noteMesh.visible = true
    this.updateFallingNoteLabel(
      this.noteLabelSprites,
      group,
      noteMeshIndex,
      indexedNote.note.pitch,
      adjustedRect,
      noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z,
      state,
    )

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
        if (state.createNoteColors.mode === 'dynamic' || state.createNoteColors.mode === 'random') {
          const keyHighlight = this.keyHighlightStates.get(indexedNote.note.pitch)
          if (keyHighlight != null) {
            keyHighlight.material.color.setHex(this.resolveCreateModeColor(
              indexedNote.note.pitch,
              state.createNoteColors,
              indexedNote.note.velocity,
              indexedNote.note.startTick,
            ))
          }
        }
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
    this.waveSamplePoints = createWaveSamplePoints(this.viewportWidth, this.getLayoutScale())

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

    const { keyboardY } = this.getKeyboardMetrics()

    for (const layer of this.waveLayers) {
      for (let index = 0; index < layer.segments.length; index += 1) {
        const x0 = this.waveSamplePoints[index]
        const x1 = this.waveSamplePoints[index + 1]
        const y0 = keyboardY + Math.sin((x0 / this.getScaledWaveLength()) + this.boundaryWaveTime) * this.getScaledWaveAmplitude()
        const y1 = keyboardY + Math.sin((x1 / this.getScaledWaveLength()) + this.boundaryWaveTime) * this.getScaledWaveAmplitude()
        const dx = x1 - x0
        const dy = y1 - y0
        const length = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)))
        const midpointX = (x0 + x1) / 2
        const midpointY = (y0 + y1) / 2
        const segment = layer.segments[index]

        segment.position.set(midpointX, this.toScenePointY(midpointY), layer.definition.z)
        segment.scale.set(length, layer.definition.lineWidth * this.getLayoutScale(), 1)
        segment.rotation.z = Math.atan2(-dy, dx)
        segment.visible = true
      }
    }
  }

  private syncWaveVisibility(): void {
    if (this.waveGroup != null) {
      this.waveGroup.visible = true
    }
  }

  private syncParticleVisibility(): void {
    if (this.particleGroup != null) {
      this.particleGroup.visible = true
    }
  }

  private initParticleSystem(): void {
    const particleGroup = this.requireParticleGroup()
    const positions = new Float32Array(PARTICLE_POOL_CAPACITY * 3)
    const velocities = new Float32Array(PARTICLE_POOL_CAPACITY * 3)
    const pitches = new Int8Array(PARTICLE_POOL_CAPACITY)
    const noteVelocities = new Uint8Array(PARTICLE_POOL_CAPACITY)
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
    const velocityAttribute = new BufferAttribute(velocities, 3)
    const alphaAttribute = new BufferAttribute(alphas, 1)
    const seedAttribute = new BufferAttribute(seeds, 1)
    const brightnessAttribute = new BufferAttribute(brightnesses, 1)
    const colorAttribute = new BufferAttribute(colors, 3)
    const uniforms: ParticleUniforms = {
      particleTime: { value: 0 },
      pixelRatio: { value: this.effectivePixelRatio },
      wispMode: { value: 0 },
    }

    geometry.setAttribute('position', positionAttribute)
    geometry.setAttribute('aSize', sizeAttribute)
    geometry.setAttribute('aVelocity', velocityAttribute)
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
uniform float wispMode;
varying float vAlpha;
varying float vBrightness;
varying vec3 vColor;
varying vec2 vVelocityDirection;
varying float vWispStretch;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(centered);
  float wispMix = step(0.5, wispMode) * (1.0 - step(1.5, wispMode));
  float rayMix = step(1.5, wispMode);
  vec2 perpendicular = vec2(-vVelocityDirection.y, vVelocityDirection.x);
  float longitudinal = dot(centered, vVelocityDirection);
  float transverse = dot(centered, perpendicular);
  float wispHead = 1.0 - smoothstep(
    0.0,
    0.20,
    length(vec2((longitudinal * vWispStretch) - 0.12, transverse * vWispStretch))
  );
  float wispTail =
    exp(-pow(transverse * vWispStretch * 6.0, 2.0)) *
    (1.0 - smoothstep(0.04, 0.5, longitudinal)) *
    smoothstep(-0.5, -0.44, longitudinal);
  float wispMask = max(wispHead, wispTail * 0.78);
  float rayLength = 1.0 - smoothstep(0.12, 0.5, abs(longitudinal));
  float rayHalo = exp(-pow(transverse * 13.0, 2.0)) * rayLength;
  float rayCore = exp(-pow(transverse * 28.0, 2.0)) * rayLength;
  float rayMask = max(rayHalo, rayCore);
  float circularMask = distanceFromCenter > 0.5 ? 0.0 : 1.0;
  float particleMask = mix(circularMask, wispMask, wispMix);
  particleMask = mix(particleMask, rayMask, rayMix);
  if (particleMask <= 0.0) {
    discard;
  }

  float halo = 1.0 - smoothstep(0.08, 0.32, distanceFromCenter);
  float core = 1.0 - smoothstep(0.0, 0.18, distanceFromCenter);
  float wispHalo = max(wispTail, wispHead * 1.15);
  halo = mix(halo, wispHalo, wispMix);
  core = mix(core, wispHead, wispMix);
  halo = mix(halo, rayHalo, rayMix);
  core = mix(core, rayCore, rayMix);
  float shimmer = 1.0 + (sin((particleTime * 7.0) + (distanceFromCenter * 16.0)) * 0.03);
  float alpha = halo * halo * vAlpha * particleMask;
  vec3 color = vColor * (0.95 + (vBrightness * 1.35) + (core * 0.75));

  gl_FragColor = vec4(color * shimmer, alpha);
}`,
      transparent: true,
      uniforms,
      vertexShader: `
uniform float particleTime;
uniform float pixelRatio;
uniform float wispMode;
attribute float aAlpha;
attribute float aBrightness;
attribute vec3 aColor;
attribute float aSeed;
attribute float aSize;
attribute vec3 aVelocity;
varying float vAlpha;
varying float vBrightness;
varying vec3 vColor;
varying vec2 vVelocityDirection;
varying float vWispStretch;

void main() {
  vAlpha = aAlpha;
  vBrightness = aBrightness;
  vColor = aColor;
  float velocityLength = length(aVelocity.xy);
  vVelocityDirection = velocityLength > 0.001
    ? normalize(aVelocity.xy)
    : vec2(0.0, 1.0);
  float wispMix = step(0.5, wispMode) * (1.0 - step(1.5, wispMode));
  float rayMix = step(1.5, wispMode);
  float wispStretch = clamp(1.6 + (velocityLength * 0.05), 1.6, 4.8);
  float rayStretch = clamp(3.2 + (velocityLength * 0.06), 3.2, 6.4);
  vWispStretch = mix(1.0, wispStretch, wispMix);
  vWispStretch = mix(vWispStretch, rayStretch, rayMix);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * pixelRatio * vWispStretch * (1.0 + (sin((particleTime * 6.0) + (aSeed * 11.0)) * 0.06));
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
      noteVelocities,
      pitches,
      points,
      positionAttribute,
      positions,
      seedAttribute,
      seeds,
      sizeAttribute,
      sizes,
      uniforms,
      velocityAttribute,
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
      const color = state.particleSettings.colorMode === 'custom'
        ? hexToPixi(state.particleSettings.customColor)
        : this.resolveCreateModeColor(
          particleSystem.pitches[particleIndex],
          state.createNoteColors,
          particleSystem.noteVelocities[particleIndex],
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

  private detectOfflineNoteBursts(currentTick: number, state: AppState): void {
    if (
      state.projectData == null ||
      state.precomputedTempoMap == null ||
      !this.isSpatialIndexReady() ||
      !Number.isFinite(currentTick)
    ) {
      this.resetOfflineBurstDetectionState(currentTick)
      return
    }

    if (!Number.isFinite(this.lastOfflineBurstDetectionTick)) {
      this.resetOfflineBurstDetectionState(currentTick)
      return
    }

    const tickDelta = currentTick - this.lastOfflineBurstDetectionTick
    if (tickDelta <= 0) {
      this.resetOfflineBurstDetectionState(currentTick)
      return
    }

    this.emitBurstsForTickRange(this.lastOfflineBurstDetectionTick, currentTick, state)
    this.resetOfflineBurstDetectionState(currentTick)
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
      !state.particleSettings.enabled ||
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
    const densityMultiplier = state.particleSettings.density / 100
    const minParticlesPerBurst = Math.max(1, Math.round(PARTICLE_MIN_COUNT * densityMultiplier))
    const maxBurstsThisPass = Math.min(
      PARTICLE_MAX_NOTES_PER_DETECTION,
      Math.floor((PARTICLE_POOL_CAPACITY - particleSystem.activeCount) / minParticlesPerBurst),
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
      const didEmitBurst = this.emitBurstForNote(indexedNote, state.particleSettings)
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

  private emitBurstForNote(indexedNote: IndexedNote, settings: AppState['particleSettings']): boolean {
    const particleSystem = this.particleSystem
    if (particleSystem == null) {
      return false
    }

    const availableSlots = PARTICLE_POOL_CAPACITY - particleSystem.activeCount
    if (availableSlots <= 0) {
      return false
    }

    const intensity = clamp(indexedNote.note.velocity / 127, 0, 1)
    const densityMultiplier = settings.density / 100
    const targetParticleCount = Math.round(
      lerp(PARTICLE_MIN_COUNT, PARTICLE_MAX_COUNT, intensity) * densityMultiplier,
    )
    const particleCount = Math.min(availableSlots, targetParticleCount)
    if (particleCount <= 0) {
      return false
    }

    const burstX = this.getKeyX(indexedNote.note.pitch)
    const burstTopDownY = this.getBoundaryTopDownY(burstX)
    const burstSceneY = this.toScenePointY(burstTopDownY)
    const particleColor = settings.colorMode === 'custom'
      ? hexToPixi(settings.customColor)
      : this.resolveCreateModeColor(
        indexedNote.note.pitch,
        getAppState().createNoteColors,
        indexedNote.note.velocity,
        indexedNote.note.startTick,
      )
    const [red, green, blue] = colorToNormalizedRgb(particleColor)
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
      const lifetimeBase = lerp(PARTICLE_MIN_LIFETIME_SECONDS, PARTICLE_MAX_LIFETIME_SECONDS, intensity) * (settings.lifetime / 100)
      const speedBase = lerp(PARTICLE_MIN_SPEED, PARTICLE_MAX_SPEED, intensity) * (settings.speed / 100)
      const sizeBase = lerp(PARTICLE_MIN_SIZE, PARTICLE_MAX_SIZE, intensity) * (settings.size / 100)
      const alphaBase = lerp(PARTICLE_MIN_ALPHA, PARTICLE_MAX_ALPHA, intensity)
      const brightnessBase = lerp(PARTICLE_MIN_BRIGHTNESS, PARTICLE_MAX_BRIGHTNESS, intensity) * (settings.glow / 100)
      const particleSeed = createDeterministicSeed(indexedNote.note.id, burstSeed, particleIndex)
      const speed = applyVarianceFromSeed(speedBase, PARTICLE_SPEED_VARIANCE, particleSeed, 1)
      const upwardRatio = lerp(
        PARTICLE_MIN_UPWARD_RATIO,
        PARTICLE_MAX_UPWARD_RATIO,
        randomFromSeed(particleSeed, 2),
      )
      let velocityX =
        randomBetweenFromSeed(-PARTICLE_SIDEWAYS_RATIO, PARTICLE_SIDEWAYS_RATIO, particleSeed, 3) * speed * (settings.spread / 100)
      let velocityY = speed * upwardRatio

      velocityX += randomBetweenFromSeed(
        -PARTICLE_SPAWN_LATERAL_JITTER * (settings.spread / 100),
        PARTICLE_SPAWN_LATERAL_JITTER * (settings.spread / 100),
        particleSeed,
        4,
      ) * (0.35 + (intensity * 0.5))

      particleSystem.positions[positionOffset] = burstX
      particleSystem.positions[positionOffset + 1] = burstSceneY
      particleSystem.positions[positionOffset + 2] = PARTICLE_Z
      particleSystem.pitches[slot] = indexedNote.note.pitch
      particleSystem.noteVelocities[slot] = indexedNote.note.velocity
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
    impactReflection.velocity = note.velocity
    impactReflection.uniforms.reflectionColor.value.setHex(
      this.resolveCreateModeColor(note.pitch, getAppState().createNoteColors, note.velocity, note.startTick),
    )
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
      copyParticleScalar(particleSystem.noteVelocities, lastIndex, index)
      copyParticleScalar(particleSystem.pitches, lastIndex, index)
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
    particleSystem.velocityAttribute.needsUpdate = true
    particleSystem.brightnessAttribute.needsUpdate = true
    particleSystem.colorAttribute.needsUpdate = true
  }

  private syncParticleMaterialAnimationTime(): void {
    const particleSystem = this.particleSystem
    if (particleSystem == null) {
      return
    }

    particleSystem.uniforms.particleTime.value = this.noteMaterialTimeSeconds
    particleSystem.uniforms.pixelRatio.value = this.composerPixelRatio
    const particleStyle = getAppState().particleSettings.style
    particleSystem.uniforms.wispMode.value = particleStyle === 'wisp' ? 1 : particleStyle === 'ray' ? 2 : 0
  }

  private advanceOfflineWaveAnimation(animationTimeSeconds: number): void {
    if (!Number.isFinite(animationTimeSeconds)) {
      return
    }

    if (!Number.isFinite(this.lastOfflineWaveAnimationTimeSeconds)) {
      this.lastOfflineWaveAnimationTimeSeconds = animationTimeSeconds
      this.updateWaveMeshes()
      return
    }

    const deltaSeconds = animationTimeSeconds - this.lastOfflineWaveAnimationTimeSeconds
    this.lastOfflineWaveAnimationTimeSeconds = animationTimeSeconds

    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      this.updateWaveMeshes()
      return
    }

    this.boundaryWaveTime += deltaSeconds * 60 * CREATE_MODE_BOUNDARY_WAVE_TIME_STEP
    this.updateWaveMeshes()
  }

  private resetBurstDetectionState(currentTick: number): void {
    this.lastBurstDetectionTick = currentTick
  }

  private resetOfflineBurstDetectionState(currentTick: number): void {
    this.lastOfflineBurstDetectionTick = currentTick
  }

  private sampleParticleFlowNoise(positionX: number, positionY: number, ageSeconds: number, seed: number): number {
    const flowTime = ageSeconds * PARTICLE_FLOW_TIME_SCROLL
    const sampleX = (positionX / PARTICLE_FLOW_SCALE) + (seed * 17.13) + flowTime
    const sampleY = (positionY / PARTICLE_FLOW_SCALE) + (seed * 29.71) - (flowTime * 0.7)
    return sampleValueNoise2D(sampleX, sampleY, mixUint32(Math.floor(seed * 0xffff_ffff)))
  }

  private getBoundaryTopDownY(x: number): number {
    const { keyboardY } = this.getKeyboardMetrics()
    return keyboardY + Math.sin((x / this.getScaledWaveLength()) + this.boundaryWaveTime) * this.getScaledWaveAmplitude()
  }

  private getScaledWaveAmplitude(): number {
    return CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE * this.getLayoutScale()
  }

  private getScaledWaveLength(): number {
    return CREATE_MODE_BOUNDARY_WAVE_LENGTH * this.getLayoutScale()
  }

  private updateFallingNoteLabel(
    labelSprites: LabelSpriteState[],
    group: Group,
    index: number,
    pitch: number,
    rect: { h: number; w: number; x: number; y: number },
    noteZ: number,
    state: AppState,
  ): void {
    const labelText = formatMidiNoteName(pitch, state.noteLabelFormat)
    const existing = labelSprites[index]
    if (!state.noteLabelsOnNotes || rect.h < NOTE_LABEL_MIN_RECT_HEIGHT || rect.w < NOTE_LABEL_MIN_RECT_WIDTH) {
      if (existing != null) {
        existing.sprite.visible = false
      }
      return
    }

    const label = existing != null && existing.text === labelText && existing.color === state.noteLabelColor
      ? existing
      : this.createLabelSprite(labelText, state.noteLabelColor)
    if (label == null) {
      return
    }

    if (existing == null) {
      group.add(label.sprite)
      labelSprites.push(label)
    } else if (label !== existing) {
      group.remove(existing.sprite)
      existing.material.dispose()
      group.add(label.sprite)
      labelSprites[index] = label
    }

    const labelHeight = clamp(state.noteLabelSize, 8, rect.h * 0.36)
    const labelWidth = Math.min(rect.w * 0.78, labelHeight * this.getLabelAspectRatio(label))
    label.sprite.position.set(
      rect.x + (rect.w / 2),
      this.toSceneRectY(rect.y, rect.h),
      noteZ + NOTE_LABEL_Z_OFFSET,
    )
    label.sprite.scale.set(labelWidth, labelHeight, 1)
    label.sprite.renderOrder = NOTE_LABEL_RENDER_ORDER
    label.sprite.visible = true
  }

  private createLabelSprite(text: string, color: string, keyboard = false): LabelSpriteState | null {
    const textureState = this.getOrCreateLabelTexture(text, color, keyboard)
    if (textureState == null) {
      return null
    }

    const material = new SpriteMaterial({
      depthTest: false,
      depthWrite: false,
      map: textureState.texture,
      transparent: true,
    })
    if (keyboard) material.toneMapped = false
    const sprite = new Sprite(material)
    sprite.visible = false
    return {
      aspectRatio: textureState.aspectRatio,
      color,
      material,
      sprite,
      text,
    }
  }

  private getOrCreateLabelTexture(text: string, color: string, keyboard = false): LabelTextureState | null {
    const cacheKey = `${keyboard ? 'key' : 'note'}|${text}|${color}`
    const cached = this.labelTextures.get(cacheKey)
    if (cached != null) {
      return cached
    }

    if (typeof document === 'undefined') {
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = LABEL_TEXTURE_WIDTH
    canvas.height = LABEL_TEXTURE_HEIGHT
    const context = canvas.getContext('2d')
    if (context == null) {
      return null
    }

    const font = keyboard ? '800 64px Arial, sans-serif' : '700 54px Arial, sans-serif'
    if (keyboard) {
      context.font = font
      canvas.width = Math.ceil(context.measureText(text).width) + 12
      canvas.height = 84
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = color
    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    if (keyboard) {
      context.strokeStyle = color === BLACK_KEY_LABEL_COLOR ? '#101010' : '#ffffff'
      context.lineWidth = 5
      context.lineJoin = 'round'
      context.strokeText(text, canvas.width / 2, canvas.height / 2)
    }
    context.fillText(text, canvas.width / 2, canvas.height / 2)

    const texture = new CanvasTexture(canvas)
    const textureState = {
      aspectRatio: keyboard ? canvas.width / canvas.height : Math.max(0.72, Math.min(1.5, (text.length * 0.62) + 0.18)),
      texture,
    }
    this.labelTextures.set(cacheKey, textureState)
    return textureState
  }

  private getLabelAspectRatio(label: LabelSpriteState): number {
    return label.aspectRatio
  }

  private createKeyboardSurfaceTextures(
    width: number,
    height: number,
  ): KeyboardSurfaceTextures | null {
    if (
      typeof document === 'undefined' ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null
    }

    const requestedTextureScale = Math.max(1, Math.min(2.5, this.effectivePixelRatio))
    const textureScale = Math.min(
      requestedTextureScale,
      KEYBOARD_TEXTURE_MAX_WIDTH / width,
      KEYBOARD_TEXTURE_MAX_HEIGHT / height,
    )
    const textureWidth = Math.max(1, Math.round(width * textureScale))
    const textureHeight = Math.max(1, Math.round(height * textureScale))
    const createLayer = (): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null => {
      const canvas = document.createElement('canvas')
      canvas.width = textureWidth
      canvas.height = textureHeight
      const context = canvas.getContext('2d')
      if (context == null) return null
      context.scale(textureWidth / width, textureHeight / height)
      context.imageSmoothingEnabled = false
      return { canvas, context }
    }

    const baseLayer = createLayer()
    const detailsLayer = createLayer()
    const depthLayer = createLayer()
    if (baseLayer == null || detailsLayer == null || depthLayer == null) {
      return null
    }

    this.drawKeyboardBaseLayer(baseLayer.context, width, height)
    this.drawKeyboardDetailsLayer(detailsLayer.context, width, height)
    this.drawKeyboardDepthLayer(depthLayer.context, width, height)

    const base = new CanvasTexture(baseLayer.canvas)
    const details = new CanvasTexture(detailsLayer.canvas)
    const depth = new CanvasTexture(depthLayer.canvas)
    for (const texture of [base, details, depth]) {
      texture.generateMipmaps = false
      texture.minFilter = LinearFilter
      texture.magFilter = LinearFilter
      texture.needsUpdate = true
    }
    this.staticResources.push(base, details, depth)
    return { base, depth, details }
  }

  private drawKeyboardBaseLayer(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#090a0c'
    context.fillRect(0, 0, width, height)

    const whiteKeyHeight = Math.max(1, height - WHITE_KEY_BOTTOM_INSET)
    const railHeight = Math.max(3, Math.round(height * KEYBOARD_RAIL_HEIGHT_RATIO))
    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (isBlackKey(pitch)) continue
      const bounds = getWhiteKeyBounds(pitch, width)
      const hasSeparator = getWhiteKeyIndex(pitch) < PIANO_WHITE_KEY_COUNT - 1
      const keyWidth = hasSeparator
        ? Math.max(1, bounds.width - WHITE_KEY_SEPARATOR_WIDTH)
        : bounds.width
      const faceGradient = context.createLinearGradient(0, 0, 0, whiteKeyHeight)
      faceGradient.addColorStop(0, KEYBOARD_WHITE_TOP)
      faceGradient.addColorStop(0.18, KEYBOARD_WHITE_MIDDLE)
      faceGradient.addColorStop(0.82, '#f8f7f3')
      faceGradient.addColorStop(1, KEYBOARD_WHITE_BOTTOM)
      context.fillStyle = faceGradient
      context.fillRect(bounds.x, 0, keyWidth, whiteKeyHeight)

      const crownGradient = context.createLinearGradient(bounds.x, 0, bounds.x + keyWidth, 0)
      crownGradient.addColorStop(0, 'rgba(0, 0, 0, 0.10)')
      crownGradient.addColorStop(0.08, 'rgba(255, 255, 255, 0.04)')
      crownGradient.addColorStop(0.72, 'rgba(255, 255, 255, 0.12)')
      crownGradient.addColorStop(0.94, 'rgba(0, 0, 0, 0.03)')
      crownGradient.addColorStop(1, 'rgba(0, 0, 0, 0.13)')
      context.fillStyle = crownGradient
      context.fillRect(bounds.x, railHeight, keyWidth, Math.max(1, whiteKeyHeight - railHeight))
    }
  }

  private drawKeyboardDetailsLayer(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    context.clearRect(0, 0, width, height)
    const whiteKeyHeight = Math.max(1, height - WHITE_KEY_BOTTOM_INSET)
    const whiteFrontHeight = Math.max(4, Math.round(height * WHITE_KEY_FRONT_FACE_RATIO))
    const railHeight = Math.max(3, Math.round(height * KEYBOARD_RAIL_HEIGHT_RATIO))

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (isBlackKey(pitch)) continue
      const bounds = getWhiteKeyBounds(pitch, width)
      const hasSeparator = getWhiteKeyIndex(pitch) < PIANO_WHITE_KEY_COUNT - 1
      const keyWidth = hasSeparator
        ? Math.max(1, bounds.width - WHITE_KEY_SEPARATOR_WIDTH)
        : bounds.width

      context.fillStyle = KEYBOARD_WHITE_EDGE_LIGHT
      context.fillRect(bounds.x + 1, railHeight, Math.max(1, keyWidth - 2), 1)
      context.fillStyle = 'rgba(0, 0, 0, 0.09)'
      context.fillRect(bounds.x, railHeight + 1, 1, Math.max(1, whiteKeyHeight - railHeight - whiteFrontHeight - 1))
      context.fillStyle = 'rgba(255, 255, 255, 0.38)'
      context.fillRect(
        bounds.x + Math.max(1, keyWidth - 2),
        railHeight + 1,
        1,
        Math.max(1, whiteKeyHeight - railHeight - whiteFrontHeight - 1),
      )

      const frontGradient = context.createLinearGradient(
        0,
        whiteKeyHeight - whiteFrontHeight,
        0,
        whiteKeyHeight,
      )
      frontGradient.addColorStop(0, KEYBOARD_WHITE_FRONT_TOP)
      frontGradient.addColorStop(0.35, '#eceae4')
      frontGradient.addColorStop(1, KEYBOARD_WHITE_FRONT_BOTTOM)
      context.fillStyle = frontGradient
      context.fillRect(
        bounds.x,
        whiteKeyHeight - whiteFrontHeight,
        keyWidth,
        whiteFrontHeight,
      )
      context.fillStyle = 'rgba(255, 255, 255, 0.72)'
      context.fillRect(bounds.x, whiteKeyHeight - whiteFrontHeight, keyWidth, 1)
      context.fillStyle = 'rgba(25, 26, 27, 0.24)'
      context.fillRect(bounds.x, whiteKeyHeight - 2, keyWidth, 2)

      if (hasSeparator) {
        context.fillStyle = KEYBOARD_WHITE_SEPARATOR
        context.fillRect(bounds.x + keyWidth, railHeight, WHITE_KEY_SEPARATOR_WIDTH, whiteKeyHeight - railHeight)
        context.fillStyle = 'rgba(255, 255, 255, 0.42)'
        context.fillRect(bounds.x + Math.max(0, keyWidth - 1), railHeight, 1, whiteKeyHeight - railHeight)
      }
    }

    const railGradient = context.createLinearGradient(0, 0, 0, railHeight)
    railGradient.addColorStop(0, '#020304')
    railGradient.addColorStop(0.55, '#16191d')
    railGradient.addColorStop(1, '#050607')
    context.fillStyle = railGradient
    context.fillRect(0, 0, width, railHeight)
    context.fillStyle = 'rgba(255, 255, 255, 0.16)'
    context.fillRect(0, railHeight, width, 1)

    const blackKeyWidth = Math.max(1, getBlackKeyWidth(width))
    const blackKeyHeight = Math.max(1, Math.round(height * CREATE_MODE_BLACK_KEY_HEIGHT_RATIO))
    const blackFaceHeight = Math.max(1, blackKeyHeight - BLACK_KEY_BOTTOM_INSET)

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) continue
      const x = pitchToKeyX(pitch, width)
      context.fillStyle = 'rgba(0, 0, 0, 0.58)'
      this.traceRoundedKeyFace(context, x - 2, 4, blackKeyWidth + 4, blackFaceHeight + 5, 2)
      context.fill()
      context.fillStyle = 'rgba(0, 0, 0, 0.34)'
      context.fillRect(x - 3, blackFaceHeight + 2, blackKeyWidth + 6, 3)
    }

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) continue
      const x = pitchToKeyX(pitch, width)
      const faceGradient = context.createLinearGradient(0, 0, 0, blackFaceHeight)
      faceGradient.addColorStop(0, KEYBOARD_BLACK_TOP)
      faceGradient.addColorStop(0.05, '#050607')
      faceGradient.addColorStop(0.36, KEYBOARD_BLACK_MIDDLE)
      faceGradient.addColorStop(0.82, KEYBOARD_BLACK_BOTTOM)
      faceGradient.addColorStop(1, '#010102')
      context.fillStyle = faceGradient
      this.traceRoundedKeyFace(context, x, 0, blackKeyWidth, blackFaceHeight, 2)
      context.fill()
    }
  }

  private drawKeyboardDepthLayer(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    context.clearRect(0, 0, width, height)
    const blackKeyWidth = Math.max(1, getBlackKeyWidth(width))
    const blackKeyHeight = Math.max(1, Math.round(height * CREATE_MODE_BLACK_KEY_HEIGHT_RATIO))
    const blackFaceHeight = Math.max(1, blackKeyHeight - BLACK_KEY_BOTTOM_INSET)
    const frontHeight = Math.max(4, Math.round(blackFaceHeight * BLACK_KEY_FRONT_FACE_RATIO))
    const sideWidth = Math.max(1, Math.round(blackKeyWidth * 0.1))

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) continue
      const x = pitchToKeyX(pitch, width)

      const frontY = blackFaceHeight - frontHeight
      context.fillStyle = KEYBOARD_BLACK_SIDE_LIGHT
      context.beginPath()
      context.moveTo(x, 1)
      context.lineTo(x + sideWidth, 3)
      context.lineTo(x + sideWidth, frontY)
      context.lineTo(x, frontY + 2)
      context.closePath()
      context.fill()

      context.fillStyle = KEYBOARD_BLACK_SIDE_DARK
      context.beginPath()
      context.moveTo(x + blackKeyWidth, 1)
      context.lineTo(x + blackKeyWidth - sideWidth, 3)
      context.lineTo(x + blackKeyWidth - sideWidth, frontY)
      context.lineTo(x + blackKeyWidth, frontY + 2)
      context.closePath()
      context.fill()

      context.fillStyle = 'rgba(255, 255, 255, 0.15)'
      context.fillRect(x + sideWidth, 1, Math.max(1, blackKeyWidth - (sideWidth * 2)), 1)

      const frontGradient = context.createLinearGradient(0, frontY, 0, blackFaceHeight)
      frontGradient.addColorStop(0, KEYBOARD_BLACK_FRONT_TOP)
      frontGradient.addColorStop(0.12, KEYBOARD_BLACK_EDGE_LIGHT)
      frontGradient.addColorStop(0.34, KEYBOARD_BLACK_FRONT_MIDDLE)
      frontGradient.addColorStop(1, KEYBOARD_BLACK_FRONT_BOTTOM)
      context.fillStyle = frontGradient
      context.beginPath()
      context.moveTo(x + sideWidth, frontY)
      context.lineTo(x + blackKeyWidth - sideWidth, frontY)
      context.lineTo(x + blackKeyWidth - 1, blackFaceHeight - 2)
      context.quadraticCurveTo(x + blackKeyWidth - 1, blackFaceHeight, x + blackKeyWidth - 3, blackFaceHeight)
      context.lineTo(x + 3, blackFaceHeight)
      context.quadraticCurveTo(x + 1, blackFaceHeight, x + 1, blackFaceHeight - 2)
      context.closePath()
      context.fill()
      context.fillStyle = 'rgba(124, 130, 139, 0.22)'
      context.fillRect(x + sideWidth, frontY, Math.max(1, blackKeyWidth - (sideWidth * 2)), 1)
      context.fillStyle = 'rgba(0, 0, 0, 0.72)'
      context.fillRect(x + 2, blackFaceHeight - 1, Math.max(1, blackKeyWidth - 4), 1)
    }
  }

  private traceRoundedKeyFace(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const resolvedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + width, y)
    context.lineTo(x + width, y + height - resolvedRadius)
    context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height)
    context.lineTo(x + resolvedRadius, y + height)
    context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius)
    context.closePath()
  }

  private createStaticTextureRectMesh(
    group: Group,
    x: number,
    y: number,
    width: number,
    height: number,
    texture: CanvasTexture,
    opacity: number,
    z: number,
    tracksKeyboardOpacity = false,
  ): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      map: texture,
      opacity,
      transparent: true,
    })
    material.toneMapped = false
    const mesh = new Mesh(this.requireRectGeometry(), material)
    mesh.position.set(x + (width / 2), this.toSceneRectY(y, height), z)
    mesh.scale.set(width, height, 1)
    mesh.renderOrder = Math.round(z * 10)
    group.add(mesh)

    this.staticResources.push(material)
    if (tracksKeyboardOpacity) {
      this.keyboardMaterialStates.push({ baseOpacity: opacity, material })
    }
    return mesh
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
        value: new Color(this.resolveCreateModeColor(pitch, getAppState().createNoteColors)),
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
      velocity: 80,
      startTimeSeconds: Number.NaN,
      uniforms,
    })
  }

  private createKeyboardSaberMesh(
    group: Group,
    pitch: number,
    x: number,
    width: number,
    keyboardY: number,
  ): void {
    const beamHeight = Math.min(
      keyboardY,
      Math.max(KEYBOARD_SABER_MIN_HEIGHT * this.getLayoutScale(), this.viewportHeight * KEYBOARD_SABER_HEIGHT_RATIO),
    )
    const beamWidth = Math.max(2, width * 0.82)
    const uniforms: KeyboardSaberUniforms = {
      beamColor: { value: new Color(this.resolveCreateModeColor(pitch, getAppState().createNoteColors)) },
      beamStrength: { value: 0 },
    }
    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader: `
        uniform vec3 beamColor;
        uniform float beamStrength;
        varying vec2 vUv;

        void main() {
          float distanceFromCenter = abs(vUv.x - 0.5) * 2.0;
          float core = 1.0 - smoothstep(0.0, 0.24, distanceFromCenter);
          float aura = 1.0 - smoothstep(0.0, 1.0, distanceFromCenter);
          float verticalFade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.65);
          float alpha = beamStrength * verticalFade * ((aura * 0.34) + (core * 0.66));
          gl_FragColor = vec4(mix(beamColor, vec3(1.0), core * 0.32), alpha);
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
    mesh.position.set(x + (width / 2), this.toSceneRectY(keyboardY - beamHeight, beamHeight), KEYBOARD_SABER_Z)
    mesh.scale.set(beamWidth, beamHeight, 1)
    mesh.renderOrder = Math.round(KEYBOARD_SABER_Z * 10)
    mesh.layers.enable(BLOOM_LAYER)
    mesh.visible = false
    group.add(mesh)

    this.staticResources.push(material)
    this.keyboardSaberStates.set(pitch, { material, mesh, pitch, uniforms })
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
      this.resolveCreateModeColor(pitch, state.createNoteColors),
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
      opacity: getAppState().noteOpacity / 100,
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
      noteStyleMode: { value: noteStyleMode(getAppState().noteStyle) },
      noteGlowStrength: { value: getAppState().noteGlow / 100 },
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
      shader.uniforms.noteStyleMode = roundedNoteUniforms.noteStyleMode
      shader.uniforms.noteGlowStrength = roundedNoteUniforms.noteGlowStrength
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
uniform float noteStyleMode;
uniform float noteGlowStrength;
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
float noteFaceLuminance = dot(noteFaceColor, vec3(0.2126, 0.7152, 0.0722));
noteFaceColor = mix(noteFaceColor, vec3(noteFaceLuminance), ${NOTE_BASE_DESATURATION.toFixed(2)});
noteFaceColor *= ${NOTE_BASE_BRIGHTNESS_SCALE.toFixed(2)};
float noteSaberCore = 1.0 - smoothstep(0.02, 0.24, abs(vRoundedRectUv.x - 0.5));
float noteOutlineMask = smoothstep(0.32, 0.88, noteEdgeMix);
float noteCrystalRidgeA = 1.0 - smoothstep(
  0.015,
  0.065,
  abs((vRoundedRectUv.x * 0.82) + vRoundedRectUv.y - 0.88)
);
float noteCrystalRidgeB = 1.0 - smoothstep(
  0.015,
  0.065,
  abs(((1.0 - vRoundedRectUv.x) * 0.82) + vRoundedRectUv.y - 0.88)
);
float noteCrystalCenterFacet = 1.0 - smoothstep(0.0, 0.36, abs(vRoundedRectUv.x - 0.5));
float noteCrystalFacetLight = clamp(
  (noteCrystalRidgeA * 0.72)
    + (noteCrystalRidgeB * 0.58)
    + (noteCrystalCenterFacet * (0.18 + (vRoundedRectUv.y * 0.22))),
  0.0,
  1.0
);
float noteGemBevel = smoothstep(0.08, 0.84, noteEdgeMix);
float noteGemCenterRidge = 1.0 - smoothstep(0.015, 0.30, abs(vRoundedRectUv.x - 0.5));
float noteGemLeftFacet = 1.0 - smoothstep(0.08, 0.48, vRoundedRectUv.x);
float noteGemRightFacet = smoothstep(0.52, 0.92, vRoundedRectUv.x);
float noteGemDirectionalLight = clamp(
  (noteGemCenterRidge * 0.44)
    + (noteGemLeftFacet * 0.24)
    - (noteGemRightFacet * 0.18),
  -0.18,
  0.68
);
vec3 noteFlatColor = mix(noteCoreDiffuseColor, noteHaloDiffuseColor, noteEdgeMix * 0.12);
vec3 noteSaberColor = mix(noteCoreDiffuseColor, vec3(1.0), noteSaberCore * 0.78);
vec3 noteOutlineColor = mix(noteCoreDiffuseColor * 0.24, noteHaloDiffuseColor, noteOutlineMask);
vec3 noteCrystalColor = mix(noteCoreDiffuseColor * 0.46, noteHaloDiffuseColor, noteEdgeMix * 0.58);
noteCrystalColor = mix(noteCrystalColor, noteSwirlBrightColor, noteCrystalFacetLight * 0.68);
vec3 noteGemColor = mix(noteCoreDiffuseColor * 0.42, noteHaloDiffuseColor, noteGemBevel * 0.54);
noteGemColor *= 1.0 + noteGemDirectionalLight;
noteGemColor = mix(noteGemColor, noteSwirlBrightColor, noteGemCenterRidge * 0.20);
noteFaceColor = noteStyleMode < 0.5 ? noteFlatColor : noteFaceColor;
noteFaceColor = noteStyleMode > 1.5 && noteStyleMode < 2.5 ? noteSaberColor : noteFaceColor;
noteFaceColor = noteStyleMode > 2.5 && noteStyleMode < 3.5 ? noteOutlineColor : noteFaceColor;
noteFaceColor = noteStyleMode > 3.5 && noteStyleMode < 4.5 ? noteCrystalColor : noteFaceColor;
noteFaceColor = noteStyleMode > 4.5 ? noteGemColor : noteFaceColor;
diffuseColor.rgb = noteFaceColor;
diffuseColor.a *= noteStyleMode > 2.5 && noteStyleMode < 3.5 ? mix(0.08, 1.0, noteOutlineMask) : 1.0;
diffuseColor.a *= noteStyleMode > 3.5 && noteStyleMode < 4.5 ? 0.88 : 1.0;

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
roundedNoteEmissiveRadiance *= ${NOTE_BASE_BRIGHTNESS_SCALE.toFixed(2)};
roundedNoteEmissiveRadiance = noteStyleMode < 0.5
  ? noteCoreEmissiveColor * noteCoreEmissiveStrength * 0.28
  : roundedNoteEmissiveRadiance;
roundedNoteEmissiveRadiance = noteStyleMode > 1.5 && noteStyleMode < 2.5
  ? roundedNoteEmissiveRadiance + (vec3(1.0) * noteSaberCore * 1.35)
  : roundedNoteEmissiveRadiance;
roundedNoteEmissiveRadiance = noteStyleMode > 2.5 && noteStyleMode < 3.5
  ? noteHaloEmissiveColor * noteHaloEmissiveStrength * (0.12 + (noteOutlineMask * 1.25))
  : roundedNoteEmissiveRadiance;
roundedNoteEmissiveRadiance = noteStyleMode > 3.5 && noteStyleMode < 4.5
  ? (
    noteCoreEmissiveColor * noteCoreEmissiveStrength * 0.34
    + noteHaloEmissiveColor * noteHaloEmissiveStrength * (noteEdgeMix * 0.62)
    + noteSwirlBrightColor * noteCrystalFacetLight * 0.92
  )
  : roundedNoteEmissiveRadiance;
roundedNoteEmissiveRadiance = noteStyleMode > 4.5
  ? (
    noteCoreEmissiveColor * noteCoreEmissiveStrength * 0.30
    + noteHaloEmissiveColor * noteHaloEmissiveStrength * (noteGemBevel * 0.70)
    + noteSwirlBrightColor * noteGemCenterRidge * 0.38
  )
  : roundedNoteEmissiveRadiance;
roundedNoteEmissiveRadiance *= noteGlowStrength;
roundedNoteEmissiveRadiance *= roundedRectMask;`,
        )
        .replace(
          'vec3 totalEmissiveRadiance = emissive;',
          'vec3 totalEmissiveRadiance = roundedNoteEmissiveRadiance;',
        )
    }
    material.customProgramCacheKey = () => 'rounded-note-pill-v12'
    return material
  }

  private getOrCreateNoteMesh(group: Group, index: number): Mesh<PlaneGeometry, GlowMaterial> {
    const existing = this.noteMeshes[index]
    if (existing != null) {
      return existing
    }

    const mesh = this.createNoteMesh(group)
    this.noteMeshes.push(mesh)
    return mesh
  }

  private getOrCreateLiveNoteMesh(group: Group, index: number): Mesh<PlaneGeometry, GlowMaterial> {
    const existing = this.liveNoteMeshes[index]
    if (existing != null) {
      return existing
    }

    const mesh = this.createNoteMesh(group)
    this.liveNoteMeshes.push(mesh)
    return mesh
  }

  private createNoteMesh(group: Group): Mesh<PlaneGeometry, GlowMaterial> {
    const material = this.createNoteMaterial(
      this.resolveCreateModeColor(PIANO_MIN_PITCH, getAppState().createNoteColors),
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

  private applyNoteAppearance(state: AppState): void {
    for (const noteMesh of [...this.noteMeshes, ...this.liveNoteMeshes]) {
      const uniforms = noteMesh.material.userData.roundedNoteUniforms as RoundedNoteUniforms | undefined
      if (uniforms == null) {
        continue
      }

      uniforms.noteStyleMode.value = noteStyleMode(state.noteStyle)
      uniforms.noteGlowStrength.value = state.noteGlow / 100
      noteMesh.material.opacity = state.noteOpacity / 100
      noteMesh.material.needsUpdate = true
    }

    this.notesDirty = true
  }

  private syncNoteMaterialAnimationTime(frameTimeMs?: number, animationTimeSeconds?: number): void {
    this.noteMaterialTimeSeconds = Number.isFinite(animationTimeSeconds)
      ? (animationTimeSeconds as number)
      : getAnimationTimeSeconds(frameTimeMs)
    this.sharedNoteMaterialTimeUniform.value = this.noteMaterialTimeSeconds
  }

  private attachAnimationLoop(): void {
    if (this.renderer == null || this.animationLoopAttached) {
      return
    }

    this.renderer.setAnimationLoop(this.handleAnimationFrame)
    this.animationLoopAttached = true
  }

  private detachAnimationLoop(): void {
    if (this.renderer == null || !this.animationLoopAttached) {
      return
    }

    this.renderer.setAnimationLoop(null)
    this.animationLoopAttached = false
  }

  private resetSimulatedAnimationState(animationTimeSeconds: number): void {
    for (const state of this.keyHighlightStates.values()) {
      state.currentStrength = 0
      state.fromStrength = 0
      state.targetStrength = 0
      state.transitionDurationSeconds = 0
      state.transitionStartSeconds = animationTimeSeconds
      state.material.opacity = 0
      state.material.needsUpdate = true
    }

    for (const impactReflection of this.impactReflectionStates.values()) {
      impactReflection.currentStrength = 0
      impactReflection.startTimeSeconds = animationTimeSeconds
      this.applyImpactReflectionState(impactReflection)
    }
  }

  private applyKeyboardOpacity(): void {
    for (const { baseOpacity, material } of this.keyboardMaterialStates) {
      material.opacity = clamp(baseOpacity * this.keyboardOpacity, 0, 1)
      material.needsUpdate = true
    }

    for (const label of this.keyboardLabelSprites) {
      label.material.opacity = this.keyboardOpacity
      label.material.needsUpdate = true
    }
  }

  private applyActiveKeyHighlights(currentTimeSeconds = this.noteMaterialTimeSeconds): boolean {
    const activePitches = new Set([
      ...this.explicitActiveKeyPitches,
      ...this.playbackActiveKeyPitches,
      ...this.liveSourceActiveKeyPitches,
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

      state.material.color.setHex(this.resolveCreateModeColor(pitch, getAppState().createNoteColors))
      state.material.opacity = clamp(state.baseOpacity * state.currentStrength * this.keyboardOpacity, 0, 1)
      state.material.needsUpdate = true

      const keyboardSaber = this.keyboardSaberStates.get(pitch)
      if (keyboardSaber != null) {
        keyboardSaber.uniforms.beamColor.value.setHex(
          this.resolveCreateModeColor(pitch, getAppState().createNoteColors),
        )
        keyboardSaber.uniforms.beamStrength.value = getAppState().keyboardSaber
          ? clamp(nextStrength * this.keyboardOpacity, 0, 1)
          : 0
        keyboardSaber.mesh.visible = keyboardSaber.uniforms.beamStrength.value > 0.001
        keyboardSaber.material.needsUpdate = true
      }
    }

    this.updateReactiveLighting()

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
    disposeLabelSprites(this.keyboardLabelSprites)

    this.staticResources = []
    this.keyboardLabelSprites = []
    this.keyboardMaterialStates = []
    this.keyHighlightStates.clear()
    this.keyboardSaberStates.clear()
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

    for (const noteMesh of [...this.noteMeshes, ...this.liveNoteMeshes]) {
      noteMesh.material.dispose()
    }
    disposeLabelSprites(this.noteLabelSprites)
    disposeLabelSprites(this.liveNoteLabelSprites)
    this.noteLabelSprites = []
    this.liveNoteLabelSprites = []
  }

  private disposeLabelTextures(): void {
    for (const { texture } of this.labelTextures.values()) {
      texture.dispose()
    }
    this.labelTextures.clear()
  }

  private initPostprocessing(): void {
    if (this.renderer == null || this.scene == null || this.camera == null) {
      return
    }

    this.bloomComposer = new EffectComposer(this.renderer)
    this.bloomComposer.renderToScreen = false
    this.bloomComposer.setPixelRatio(this.composerPixelRatio)
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
    this.finalComposer.setPixelRatio(this.composerPixelRatio)
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
    this.bloomCompositePass.uniforms.bloomClipFeather.value = (
      BLOOM_CLIP_FEATHER_PIXELS * this.getLayoutScale()
    ) / this.viewportHeight
    this.bloomCompositePass.uniforms.bloomDebugLineHalfThickness.value = (
      0.5 * this.getLayoutScale()
    ) / this.viewportHeight
  }

  private getBloomClipTopDownY(): number {
    const { keyboardY } = this.getKeyboardMetrics()
    const widestWaveLineWidth = this.waveLayers.reduce(
      (widest, layer) => Math.max(widest, layer.definition.lineWidth * this.getLayoutScale()),
      CREATE_MODE_BOUNDARY_CORE_THICKNESS * this.getLayoutScale(),
    )

    // Keep the full wave thickness above the cutoff, plus a small safety buffer,
    // so the keyboard region is the first area that actually gets clipped.
    return Math.min(
      this.viewportHeight,
      keyboardY + (widestWaveLineWidth / 2) + (BLOOM_CLIP_DEBUG_LINE_BUFFER_PIXELS * this.getLayoutScale()),
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

function hideLabelSprites(labels: LabelSpriteState[], startIndex = 0): void {
  for (let index = startIndex; index < labels.length; index += 1) {
    labels[index].sprite.visible = false
  }
}

function disposeLabelSprites(labels: LabelSpriteState[]): void {
  for (const label of labels) {
    label.material.dispose()
  }
}

function formatMidiNoteName(pitch: number, format: AppState['noteLabelFormat']): string {
  const pitchClassNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const normalizedPitch = Math.round(pitch)
  const name = pitchClassNames[((normalizedPitch % 12) + 12) % 12]
  if (format === 'name') {
    return name
  }

  return `${name}${Math.floor(normalizedPitch / 12) - 1}`
}

function createWaveSamplePoints(width: number, layoutScale = 1): number[] {
  const points: number[] = [0]
  const segmentWidth = Math.max(1, CREATE_MODE_BOUNDARY_SEGMENT_WIDTH * layoutScale)

  for (let x = segmentWidth; x <= width; x += segmentWidth) {
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

function copyParticleScalar(values: Float32Array | Int8Array | Uint8Array, sourceIndex: number, targetIndex: number): void {
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

// TODO: Apply the same linear-luminance energy calibration to key highlights,
// particles, and boundary waves when those color-only render paths are revisited.
export function createNoteMaterialPalette(
  color: number,
  calibration: Readonly<NoteBloomCalibration> = DEFAULT_NOTE_BLOOM_CALIBRATION,
): NoteMaterialPalette {
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
      calibration.coreTargetTotalLuminance,
      NOTE_CORE_EMISSIVE_STRENGTH_MIN,
      calibration.coreEmissiveStrengthMax,
    ),
    haloDiffuseColor,
    haloEmissiveColor,
    haloEmissiveStrength: resolveEmissiveStrength(
      haloDiffuseColor,
      haloEmissiveColor,
      calibration.haloTargetTotalLuminance,
      NOTE_HALO_EMISSIVE_STRENGTH_MIN,
      calibration.haloEmissiveStrengthMax,
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
  const diffuseLuminance = getColorLinearRelativeLuminance(diffuseColor)
  const emissiveLuminance = Math.max(0.008, getColorLinearRelativeLuminance(emissiveColor))

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

export function getColorLinearRelativeLuminance(color: number): number {
  const red = srgbChannelToLinear(((color >> 16) & 0xff) / 0xff)
  const green = srgbChannelToLinear(((color >> 8) & 0xff) / 0xff)
  const blue = srgbChannelToLinear((color & 0xff) / 0xff)

  return (red * 0.2126) + (green * 0.7152) + (blue * 0.0722)
}

function srgbChannelToLinear(channel: number): number {
  const clampedChannel = clamp(channel, 0, 1)
  return clampedChannel <= 0.04045
    ? clampedChannel / 12.92
    : ((clampedChannel + 0.055) / 1.055) ** 2.4
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

function getMonotonicNowMs(): number {
  if (typeof performance !== 'undefined' && Number.isFinite(performance.now())) {
    return performance.now()
  }

  return Date.now()
}

function resolveNoteTravelPhaseOffset(note: Note): number {
  const normalizedNoteId = typeof note.id === 'string' && note.id.trim().length > 0
    ? note.id
    : `${Math.round(note.pitch)}:${Math.round(note.startTick)}`
  const phaseSeed = createDeterministicSeed(normalizedNoteId, Math.round(note.pitch), Math.round(note.startTick))
  return randomFromSeed(phaseSeed, 0)
}

function resolveDevicePixelRatio(pixelRatioOverride?: number): number {
  if (pixelRatioOverride != null && Number.isFinite(pixelRatioOverride) && pixelRatioOverride > 0) {
    return Math.max(1, pixelRatioOverride)
  }

  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio)) {
    return 1
  }

  return Math.max(1, window.devicePixelRatio)
}

function resolvePostprocessScale(postprocessScaleOverride?: number): number {
  if (
    postprocessScaleOverride != null &&
    Number.isFinite(postprocessScaleOverride) &&
    postprocessScaleOverride > 0
  ) {
    return Math.max(1, postprocessScaleOverride)
  }

  return 1
}

function resolveComposerPixelRatio(pixelRatio: number, postprocessScale: number): number {
  return Math.max(1, pixelRatio * postprocessScale)
}

function noteStyleMode(style: AppState['noteStyle']): number {
  if (style === 'solid') {
    return 0
  }
  if (style === 'saber') {
    return 2
  }
  if (style === 'outline') {
    return 3
  }
  if (style === 'crystal') {
    return 4
  }
  if (style === 'gem') {
    return 5
  }
  return 1
}

function backgroundStyleMode(style: AppState['backgroundStyle']): number {
  if (style === 'studio') {
    return 1
  }
  if (style === 'aurora') {
    return 2
  }
  if (style === 'stage') {
    return 3
  }
  return 0
}

export const threeRenderer = new ThreeRenderer()
