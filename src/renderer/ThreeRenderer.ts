import {
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
} from 'three'

import { type IndexedNote, spatialIndex } from '../spatial/SpatialIndex'
import { getAppState } from '../store/store'
import { tickToSeconds } from '../tempo/tempoMap'
import { resolveCreateModeNoteColor } from './colorUtils'
import { getNoteLabel } from './labelUtils'
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
const CREATE_MODE_BOUNDARY_OUTER_AURA_COLOR = 0x1a3a6e
const CREATE_MODE_BOUNDARY_MID_GLOW_COLOR = 0x4a9eff
const CREATE_MODE_BOUNDARY_CORE_COLOR = 0x7ec8ff
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
const KEY_LABEL_FONT_SIZE = 12
const NOTE_LABEL_FONT_SIZE = 12
const TEXT_FONT_FAMILY = 'Arial, sans-serif'
const KEY_LABEL_BASELINE_OFFSET = 8
const LANE_GUIDE_Z = 0
const WHITE_KEY_Z = 1
const BLACK_KEY_Z = 2
const KEY_LABEL_Z = 3
const BLACK_NOTE_Z = 4
const BLACK_NOTE_LABEL_Z = 5
const WHITE_NOTE_Z = 6
const WHITE_NOTE_LABEL_Z = 7
const WAVE_OUTER_Z = 8
const WAVE_MID_Z = 9
const WAVE_CORE_Z = 10

interface KeyboardMaterialState {
  material: MeshBasicMaterial | SpriteMaterial
  baseOpacity: number
}

interface KeyHighlightState {
  material: MeshBasicMaterial
  baseOpacity: number
  color: number
}

interface TextSpriteAsset {
  material: SpriteMaterial
  texture: CanvasTexture | null
  width: number
  height: number
}

interface WaveLayerDefinition {
  color: number
  lineWidth: number
  opacity: number
  renderOrder: number
  z: number
}

interface WaveLayerState {
  definition: WaveLayerDefinition
  material: MeshBasicMaterial
  segments: Array<Mesh<PlaneGeometry, MeshBasicMaterial>>
}

export class ThreeRenderer implements VisualizerRenderer {
  private canvas: HTMLCanvasElement | null = null
  private renderer: WebGLRenderer | null = null
  private scene: Scene | null = null
  private camera: OrthographicCamera | null = null
  private rectGeometry: PlaneGeometry | null = null
  private laneGroup: Group | null = null
  private keyboardGroup: Group | null = null
  private noteGroup: Group | null = null
  private waveGroup: Group | null = null
  private staticResources: Array<{ dispose(): void }> = []
  private persistentResources: Array<{ dispose(): void }> = []
  private keyboardMaterialStates: KeyboardMaterialState[] = []
  private keyHighlightStates = new Map<number, KeyHighlightState>()
  private explicitActiveKeyPitches = new Set<number>()
  private playbackActiveKeyPitches = new Set<number>()
  private keyboardOpacity = 1
  private viewportWidth = 1
  private viewportHeight = 1
  private currentTick = 0
  private boundaryWaveTime = 0
  private noteMeshes: Array<Mesh<PlaneGeometry, MeshBasicMaterial>> = []
  private noteLabelSprites: Sprite[] = []
  private noteMaterialCache = new Map<number, MeshBasicMaterial>()
  private noteLabelAssets = new Map<string, TextSpriteAsset>()
  private waveLayers: WaveLayerState[] = []
  private waveSamplePoints: number[] = []
  private notesDirty = true
  private lastRenderedTick = Number.NaN
  private lastRenderedWorldZoom = Number.NaN
  private lastRenderedLearnActive: boolean | null = null
  private lastRenderedProjectData: AppState['projectData'] | null = null
  private lastRenderedTempoMap: AppState['precomputedTempoMap'] | null = null

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

    this.rectGeometry = new PlaneGeometry(1, 1)
    this.laneGroup = new Group()
    this.keyboardGroup = new Group()
    this.noteGroup = new Group()
    this.waveGroup = new Group()

    this.scene.add(this.laneGroup)
    this.scene.add(this.keyboardGroup)
    this.scene.add(this.noteGroup)
    this.scene.add(this.waveGroup)

    this.initWaveLayers()

    this.resize(
      Math.max(1, canvas.clientWidth || canvas.width || 1),
      Math.max(1, canvas.clientHeight || canvas.height || 1),
    )

    this.renderer.setAnimationLoop(this.handleAnimationFrame)
    this.renderFrame(this.currentTick)
  }

  async destroy(): Promise<void> {
    this.clearDynamicNoteObjects()
    this.disposeStaticScene()
    this.disposeWaveMeshes()

    if (this.noteGroup != null) {
      clearGroup(this.noteGroup)
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
    if (this.waveGroup != null && this.scene != null) {
      this.scene.remove(this.waveGroup)
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
    this.waveGroup = null
    this.rectGeometry = null
    this.camera = null
    this.scene = null
    this.renderer = null
    this.canvas = null
    this.explicitActiveKeyPitches.clear()
    this.playbackActiveKeyPitches.clear()
    this.keyboardOpacity = 1
    this.viewportWidth = 1
    this.viewportHeight = 1
    this.currentTick = 0
    this.boundaryWaveTime = 0
    this.notesDirty = true
    this.lastRenderedTick = Number.NaN
    this.lastRenderedWorldZoom = Number.NaN
    this.lastRenderedLearnActive = null
    this.lastRenderedProjectData = null
    this.lastRenderedTempoMap = null
    this.noteMeshes = []
    this.noteLabelSprites = []
    this.noteMaterialCache.clear()
    this.noteLabelAssets.clear()
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

    this.camera.left = 0
    this.camera.right = this.viewportWidth
    this.camera.top = this.viewportHeight
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()

    this.rebuildStaticScene()
    this.rebuildWaveMeshes()
    this.notesDirty = true
    this.renderDynamicState(this.currentTick)
  }

  renderFrame(tick: number): void {
    if (Number.isFinite(tick)) {
      this.currentTick = tick
    }

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
    this.applyActiveKeyHighlights()
    this.renderScene()
  }

  setActiveKeyPitches(pitches: Iterable<number>): void {
    this.explicitActiveKeyPitches = new Set(Array.from(pitches, (pitch) => Math.round(pitch)))
    this.applyActiveKeyHighlights()
    this.renderScene()
  }

  private readonly handleAnimationFrame = (): void => {
    if (this.renderer == null || this.scene == null || this.camera == null) {
      return
    }

    const state = getAppState()
    if (Number.isFinite(state.currentTick) && state.currentTick !== this.currentTick) {
      this.currentTick = state.currentTick
      this.notesDirty = true
    }

    const notesChanged = this.renderDynamicState(this.currentTick, state, false)

    if (!state.learnV3.isActive) {
      this.boundaryWaveTime += CREATE_MODE_BOUNDARY_WAVE_TIME_STEP
      this.updateWaveMeshes()
      this.renderScene()
      return
    }

    if (notesChanged) {
      this.renderScene()
    }
  }

  private renderDynamicState(
    currentTick: number,
    state = getAppState(),
    shouldRender = true,
  ): boolean {
    const shouldRefreshNotes =
      this.notesDirty ||
      this.lastRenderedTick !== currentTick ||
      this.lastRenderedWorldZoom !== state.worldZoom ||
      this.lastRenderedLearnActive !== state.learnV3.isActive ||
      this.lastRenderedProjectData !== state.projectData ||
      this.lastRenderedTempoMap !== state.precomputedTempoMap

    if (!shouldRefreshNotes) {
      if (shouldRender) {
        this.renderScene()
      }
      return false
    }

    this.updateNoteLayer(currentTick, state)
    this.updatePlaybackActiveKeys(currentTick, state)
    this.applyActiveKeyHighlights()
    this.syncWaveVisibility(state.learnV3.isActive)

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
    this.applyActiveKeyHighlights()
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
        resolveCreateModeNoteColor(pitch),
        0,
        WHITE_KEY_Z,
      )
      this.keyHighlightStates.set(pitch, {
        baseOpacity: WHITE_KEY_ACTIVE_ALPHA,
        color: resolveCreateModeNoteColor(pitch),
        material: highlight.material,
      })

      const label = this.createTextSprite(getNoteLabel(pitch, 'name'), {
        color: '#000000',
        fontSize: KEY_LABEL_FONT_SIZE,
        trackKeyboardOpacity: true,
      })
      if (label != null) {
        label.position.set(
          whiteKeyBounds.x + (whiteKeyBounds.width / 2),
          this.toScenePointY(this.viewportHeight - KEY_LABEL_BASELINE_OFFSET),
          KEY_LABEL_Z,
        )
        label.renderOrder = Math.round(KEY_LABEL_Z * 10)
        keyboardGroup.add(label)
      }
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
        resolveCreateModeNoteColor(pitch),
        0,
        BLACK_KEY_Z,
      )
      this.keyHighlightStates.set(pitch, {
        baseOpacity: BLACK_KEY_ACTIVE_ALPHA,
        color: resolveCreateModeNoteColor(pitch),
        material: highlight.material,
      })
    }
  }

  private updateNoteLayer(currentTick: number, state: AppState): void {
    const noteGroup = this.requireNoteGroup()
    if (state.projectData == null || state.precomputedTempoMap == null || !this.isSpatialIndexReady()) {
      hideObjects(this.noteMeshes)
      hideObjects(this.noteLabelSprites)
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
    let noteLabelIndex = 0

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
        noteLabelIndex,
      )
      noteMeshIndex = nextIndices.noteMeshIndex
      noteLabelIndex = nextIndices.noteLabelIndex
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
        noteLabelIndex,
      )
      noteMeshIndex = nextIndices.noteMeshIndex
      noteLabelIndex = nextIndices.noteLabelIndex
    }

    hideObjects(this.noteMeshes, noteMeshIndex)
    hideObjects(this.noteLabelSprites, noteLabelIndex)
  }

  private renderCreateModeNote(
    group: Group,
    indexedNote: IndexedNote,
    nextNote: IndexedNote | null,
    currentTick: number,
    currentSeconds: number,
    state: AppState,
    noteMeshIndex: number,
    noteLabelIndex: number,
  ): {
    noteMeshIndex: number
    noteLabelIndex: number
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
        noteLabelIndex,
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
    const noteColor = resolveCreateModeNoteColor(indexedNote.note.pitch)
    const noteMesh = this.getOrCreateNoteMesh(group, noteMeshIndex)

    noteMesh.material = this.getOrCreateNoteMaterial(noteColor)
    noteMesh.position.set(
      adjustedRect.x + (adjustedRect.w / 2),
      this.toSceneRectY(adjustedRect.y, adjustedRect.h),
      noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z,
    )
    noteMesh.scale.set(adjustedRect.w, adjustedRect.h, 1)
    noteMesh.renderOrder = Math.round((noteIsBlack ? BLACK_NOTE_Z : WHITE_NOTE_Z) * 10)
    noteMesh.visible = true

    const labelAsset = this.getOrCreateNoteLabelAsset(getNoteLabel(indexedNote.note.pitch, 'nameOctave'))
    const noteLabel = this.getOrCreateNoteLabelSprite(group, noteLabelIndex)
    noteLabel.material = labelAsset.material
    noteLabel.scale.set(labelAsset.width, labelAsset.height, 1)
    noteLabel.position.set(
      adjustedRect.x + (adjustedRect.w / 2),
      this.toScenePointY(adjustedRect.y + (adjustedRect.h / 2)),
      noteIsBlack ? BLACK_NOTE_LABEL_Z : WHITE_NOTE_LABEL_Z,
    )
    noteLabel.renderOrder = Math.round((noteIsBlack ? BLACK_NOTE_LABEL_Z : WHITE_NOTE_LABEL_Z) * 10)
    noteLabel.visible = true

    return {
      noteMeshIndex: noteMeshIndex + 1,
      noteLabelIndex: noteLabelIndex + 1,
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
        color: CREATE_MODE_BOUNDARY_OUTER_AURA_COLOR,
        lineWidth: CREATE_MODE_BOUNDARY_OUTER_AURA_THICKNESS,
        opacity: CREATE_MODE_BOUNDARY_OUTER_AURA_ALPHA,
        renderOrder: Math.round(WAVE_OUTER_Z * 10),
        z: WAVE_OUTER_Z,
      }),
      this.createWaveLayerState({
        color: CREATE_MODE_BOUNDARY_MID_GLOW_COLOR,
        lineWidth: CREATE_MODE_BOUNDARY_MID_GLOW_THICKNESS,
        opacity: CREATE_MODE_BOUNDARY_MID_GLOW_ALPHA,
        renderOrder: Math.round(WAVE_MID_Z * 10),
        z: WAVE_MID_Z,
      }),
      this.createWaveLayerState({
        color: CREATE_MODE_BOUNDARY_CORE_COLOR,
        lineWidth: CREATE_MODE_BOUNDARY_CORE_THICKNESS,
        opacity: CREATE_MODE_BOUNDARY_CORE_ALPHA,
        renderOrder: Math.round(WAVE_CORE_Z * 10),
        z: WAVE_CORE_Z,
      }),
    ]
  }

  private createWaveLayerState(definition: WaveLayerDefinition): WaveLayerState {
    const material = new MeshBasicMaterial({
      color: definition.color,
      depthTest: false,
      depthWrite: false,
      opacity: definition.opacity,
      transparent: true,
    })
    this.persistentResources.push(material)

    return {
      definition,
      material,
      segments: [],
    }
  }

  private rebuildWaveMeshes(): void {
    const waveGroup = this.requireWaveGroup()

    clearGroup(waveGroup)
    this.waveSamplePoints = createWaveSamplePoints(this.viewportWidth)

    for (const layer of this.waveLayers) {
      layer.segments = []

      for (let index = 0; index < this.waveSamplePoints.length - 1; index += 1) {
        const mesh = new Mesh(this.requireRectGeometry(), layer.material)
        mesh.renderOrder = layer.definition.renderOrder
        waveGroup.add(mesh)
        layer.segments.push(mesh)
      }
    }

    this.updateWaveMeshes()
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

  private createTextSprite(
    text: string,
    options: {
      color: string
      fontSize: number
      trackKeyboardOpacity: boolean
    },
  ): Sprite | null {
    const asset = createTextSpriteAsset(text, options.color, options.fontSize)
    if (asset == null) {
      return null
    }

    const sprite = new Sprite(asset.material)
    sprite.scale.set(asset.width, asset.height, 1)

    this.staticResources.push(asset.material)
    if (asset.texture != null) {
      this.staticResources.push(asset.texture)
    }
    if (options.trackKeyboardOpacity) {
      this.keyboardMaterialStates.push({
        baseOpacity: 1,
        material: asset.material,
      })
    }

    return sprite
  }

  private getOrCreateNoteMaterial(color: number): MeshBasicMaterial {
    const existing = this.noteMaterialCache.get(color)
    if (existing != null) {
      return existing
    }

    const material = new MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      opacity: 1,
      transparent: true,
    })
    this.noteMaterialCache.set(color, material)
    this.persistentResources.push(material)
    return material
  }

  private getOrCreateNoteLabelAsset(text: string): TextSpriteAsset {
    const existing = this.noteLabelAssets.get(text)
    if (existing != null) {
      return existing
    }

    const asset = createTextSpriteAsset(text, '#ffffff', NOTE_LABEL_FONT_SIZE)
    if (asset == null) {
      const fallbackMaterial = new SpriteMaterial({
        depthTest: false,
        depthWrite: false,
        opacity: 0,
        transparent: true,
      })
      const fallbackAsset = {
        material: fallbackMaterial,
        texture: null,
        width: 1,
        height: 1,
      }
      this.noteLabelAssets.set(text, fallbackAsset)
      this.persistentResources.push(fallbackMaterial)
      return fallbackAsset
    }

    this.noteLabelAssets.set(text, asset)
    this.persistentResources.push(asset.material)
    if (asset.texture != null) {
      this.persistentResources.push(asset.texture)
    }
    return asset
  }

  private getOrCreateNoteMesh(group: Group, index: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const existing = this.noteMeshes[index]
    if (existing != null) {
      return existing
    }

    const material = this.getOrCreateNoteMaterial(resolveCreateModeNoteColor(PIANO_MIN_PITCH))
    const mesh = new Mesh(this.requireRectGeometry(), material)
    mesh.visible = false
    group.add(mesh)
    this.noteMeshes.push(mesh)
    return mesh
  }

  private getOrCreateNoteLabelSprite(group: Group, index: number): Sprite {
    const existing = this.noteLabelSprites[index]
    if (existing != null) {
      return existing
    }

    const fallbackAsset = this.getOrCreateNoteLabelAsset('')
    const sprite = new Sprite(fallbackAsset.material)
    sprite.visible = false
    group.add(sprite)
    this.noteLabelSprites.push(sprite)
    return sprite
  }

  private applyKeyboardOpacity(): void {
    for (const { baseOpacity, material } of this.keyboardMaterialStates) {
      material.opacity = clamp(baseOpacity * this.keyboardOpacity, 0, 1)
      material.needsUpdate = true
    }
  }

  private applyActiveKeyHighlights(): void {
    for (const [pitch, state] of this.keyHighlightStates) {
      const isActive = this.explicitActiveKeyPitches.has(pitch) || this.playbackActiveKeyPitches.has(pitch)
      state.material.color.setHex(state.color)
      state.material.opacity = isActive
        ? clamp(state.baseOpacity * this.keyboardOpacity, 0, 1)
        : 0
      state.material.needsUpdate = true
    }
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
  }

  private disposeWaveMeshes(): void {
    if (this.waveGroup != null) {
      clearGroup(this.waveGroup)
    }

    for (const layer of this.waveLayers) {
      layer.segments = []
    }

    this.waveSamplePoints = []
  }

  private clearDynamicNoteObjects(): void {
    if (this.noteGroup != null) {
      clearGroup(this.noteGroup)
    }
  }

  private renderScene(): void {
    if (this.renderer == null || this.scene == null || this.camera == null) {
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

function createTextSpriteAsset(
  text: string,
  fillColor: string,
  fontSize: number,
): null | TextSpriteAsset {
  if (typeof document === 'undefined') {
    return null
  }

  const labelCanvas = document.createElement('canvas')
  const measuringContext = labelCanvas.getContext('2d')
  if (measuringContext == null) {
    return null
  }

  measuringContext.font = `bold ${fontSize}px ${TEXT_FONT_FAMILY}`
  const paddingX = 6
  const paddingY = 4
  const width = Math.max(1, Math.ceil(measuringContext.measureText(text).width) + (paddingX * 2))
  const height = Math.max(1, fontSize + (paddingY * 2))

  labelCanvas.width = width
  labelCanvas.height = height

  const drawingContext = labelCanvas.getContext('2d')
  if (drawingContext == null) {
    return null
  }

  drawingContext.clearRect(0, 0, width, height)
  drawingContext.font = `bold ${fontSize}px ${TEXT_FONT_FAMILY}`
  drawingContext.fillStyle = fillColor
  drawingContext.textAlign = 'center'
  drawingContext.textBaseline = 'middle'
  drawingContext.fillText(text, width / 2, height / 2)

  const texture = new CanvasTexture(labelCanvas)
  const material = new SpriteMaterial({
    depthTest: false,
    depthWrite: false,
    map: texture,
    opacity: 1,
    transparent: true,
  })

  return {
    material,
    texture,
    width,
    height,
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

function getDevicePixelRatio(): number {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio)) {
    return 1
  }

  return Math.max(1, window.devicePixelRatio)
}

export const threeRenderer = new ThreeRenderer()
