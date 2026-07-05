import { enableMapSet } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'

import type { ProjectData, Track } from '../midi/types'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { StoreError } from './errors'

enableMapSet()

const MIN_ZOOM = 0.1
const MAX_ZOOM = 20
const DEFAULT_VIEWPORT_WIDTH = 1920
const DEFAULT_VIEWPORT_HEIGHT = 1080
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const DEFAULT_TRACK_COLORS = [
  '#4f8ef7',
  '#f7674f',
  '#4ff7a0',
  '#4f8ef7',
  '#f7674f',
  '#4ff7a0',
  '#4f8ef7',
  '#f7674f',
] as const

export const DEFAULT_PITCH_CLASS_COLORS: Record<number, string> = {
  0: '#f74f4f',
  1: '#f7674f',
  2: '#f7a44f',
  3: '#f7d44f',
  4: '#a4f74f',
  5: '#4ff77a',
  6: '#4ff7a0',
  7: '#4ff7f0',
  8: '#4fa4f7',
  9: '#4f8ef7',
  10: '#7a4ff7',
  11: '#f74ff0',
}

type LearnMode = 'listen' | 'noteByNote' | 'playAlong'
type LearnHand = 'left' | 'right' | 'both'
type MidiConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed'
type AppMode = 'select' | 'create' | 'createCamera' | 'createRecord' | 'learn' | 'learnSong' | 'learnSession' | 'learnEnd'
type LearnNoteColorMode = 'white' | 'perHand' | 'custom'
type PieceType = 'midi' | 'recording'
export type CreateTab = 'pieces' | 'particles' | 'color' | 'camera'
export type AlignStep = 'idle' | 'waiting-low-a' | 'waiting-high-c' | 'complete'

export interface AlignmentPoint {
  x: number
  y: number
}

export interface VisualizerSettings {
  aspectRatio: 'fit' | '16:9' | '1:1' | '4:3'
  resolution: '720p' | '1080p' | '1440p' | '4K'
  framerate: 24 | 30 | 60
}

export interface CameraOverlaySettings {
  offsetX: number
  offsetY: number
  scale: number
  cropTop: number
  cropRight: number
  cropBottom: number
  cropLeft: number
}

export interface RecordModeConfig {
  audioSourceDeviceId: string | null
  useMidiAudio: boolean
  useMic: boolean
  midiDeviceId: string | null
  cameraDeviceId: string | null
}

export interface Piece {
  id: string
  name: string
  type: PieceType
  filePath: string | null
  thumbnail?: string
  createdAt: number
}

interface LearnSessionConfig {
  mode: LearnMode | null
  hand: LearnHand
  tempoMultiplier: number
}

interface LearnStats {
  correct: number
  wrong: number
  missed: number
  streak: number
  bestStreak: number
}

interface MidiDeviceInfo {
  id: string
  name: string
}

interface LearnV3State {
  selectedSongId: string | null
  sessionConfig: LearnSessionConfig
  isActive: boolean
  sessionState: 'idle' | 'playing' | 'ended'
  currentChordIndex: number
  stats: LearnStats
  fingerNumbers: Record<string, number>
  midi: {
    available: boolean
    devices: MidiDeviceInfo[]
    connectedDeviceId: string | null
    connectionStatus: MidiConnectionStatus
  }
}

interface LearnVisuals {
  noteColor: LearnNoteColorMode
  leftHandColor: string
  rightHandColor: string
  noteOpacity: number
  glowEnabled: boolean
  noteLabelsEnabled: boolean
  fingerNumbersEnabled: boolean
}

interface ProjectSlice {
  projectData: ProjectData | null
  precomputedTempoMap: PrecomputedTempoMap | null
  isProjectLoaded: boolean
}

interface PlaybackSlice {
  currentTick: number
  isPlaying: boolean
  loopEnabled: boolean
  loopStartTick: number
  loopEndTick: number
}

interface CameraSlice {
  worldZoom: number
  panX: number
  panY: number
  renderScale: number
  viewportWidth: number
  viewportHeight: number
}

interface SelectionSlice {
  selectedNoteIds: Set<string>
  hoveredNoteId: string | null
}

interface TrackSlice {
  trackColors: Record<string, string>
  trackMuted: Record<string, boolean>
  trackSoloed: Record<string, boolean>
}

interface PiecesSlice {
  pieces: Piece[]
  currentPieceId: string | null
  loadPieceError: string | null
}

interface CreateVisualizerSettingsSlice {
  visualizerSettings: VisualizerSettings
}

interface CameraOverlaySlice {
  cameraOverlay: CameraOverlaySettings
}

interface AlignmentSlice {
  alignStep: AlignStep
  lowAPoint: AlignmentPoint | null
  highCPoint: AlignmentPoint | null
}

interface RecordModeSlice {
  recordModeConfig: RecordModeConfig
}

interface UISlice {
  appMode: AppMode
  activeSecondBarTab: CreateTab
  activePanel: 'notes' | 'effects' | 'export' | null
  isExporting: boolean
  exportProgress: number
  exportFramesRendered: number
  exportTotalFrames: number
  exportEstimatedSecondsRemaining: number
  errorMessage: string | null
}

interface VisualizerSettingsSlice {
  colorMode: 'track' | 'pitch' | 'split' | 'velocity'
  pitchClassColors: Record<number, string>
  splitPitch: number
  leftHandColor: string
  rightHandColor: string
  velocityLowColor: string
  velocityHighColor: string
  noteStyle: 'solid' | 'gradient' | 'saber'
  noteGradientDirection: 'vertical' | 'horizontal'
  gradientTopColor: string
  gradientBottomColorRight: string
  gradientBottomColorLeft: string
  gradientBottomColorRightBlack: string
  gradientBottomColorLeftBlack: string
  backgroundColor: string
  laneOpacity: number
  noteLabelsOnNotes: boolean
  noteLabelsOnKeys: boolean
  noteLabelFormat: 'name' | 'nameOctave'
  noteLabelColor: string
  noteLabelSize: number
}

export type AppState =
  & ProjectSlice
  & PlaybackSlice
  & CameraSlice
  & SelectionSlice
  & TrackSlice
  & PiecesSlice
  & CreateVisualizerSettingsSlice
  & CameraOverlaySlice
  & AlignmentSlice
  & RecordModeSlice
  & UISlice
  & { learnV3: LearnV3State }
  & { learnVisuals: LearnVisuals }
  & VisualizerSettingsSlice

export interface AppActions {
  loadProject(projectData: ProjectData, tempoMap: PrecomputedTempoMap): void
  unloadProject(): void
  setCurrentTick(tick: number): void
  setIsPlaying(playing: boolean): void
  setLoop(enabled: boolean, startTick?: number, endTick?: number): void
  setZoom(zoom: number): void
  setPan(panX: number, panY: number): void
  setRenderScale(scale: number): void
  setViewportSize(width: number, height: number): void
  selectNotes(noteIds: string[]): void
  addToSelection(noteIds: string[]): void
  clearSelection(): void
  setHoveredNote(noteId: string | null): void
  setTrackColor(trackId: string, color: string): void
  setTrackMuted(trackId: string, muted: boolean): void
  setTrackSoloed(trackId: string, soloed: boolean): void
  initTrackDefaults(tracks: Track[]): void
  addPiece(piece: Piece): void
  removePiece(id: string): void
  loadPiece(id: string): Promise<boolean>
  clearLoadPieceError(): void
  clearLoadedPiece(): void
  setVisualizerSettings(patch: Partial<VisualizerSettings>): void
  setCameraOverlay(patch: Partial<CameraOverlaySettings>): void
  setAlignStep(step: AlignStep): void
  setLowAPoint(point: AlignmentPoint | null): void
  setHighCPoint(point: AlignmentPoint | null): void
  enterRecordMode(): void
  setRecordModeConfig(patch: Partial<RecordModeConfig>): void
  setActivePanel(panel: UISlice['activePanel']): void
  setActiveSecondBarTab(tab: CreateTab): void
  setAppMode(mode: AppMode): void
  enterCameraMode(): void
  setExportProgress(
    progress: number,
    framesRendered: number,
    totalFrames: number,
    estimatedSeconds: number,
  ): void
  setIsExporting(exporting: boolean): void
  setColorMode(mode: VisualizerSettingsSlice['colorMode']): void
  setPitchClassColor(pitchClass: number, color: string): void
  setSplitPitch(pitch: number): void
  setLeftHandColor(color: string): void
  setRightHandColor(color: string): void
  setVelocityColors(low: string, high: string): void
  setNoteStyle(style: VisualizerSettingsSlice['noteStyle']): void
  setNoteGradientDirection(direction: VisualizerSettingsSlice['noteGradientDirection']): void
  setGradientTopColor(color: string): void
  setGradientBottomColorRight(color: string): void
  setGradientBottomColorLeft(color: string): void
  setGradientBottomColorRightBlack(color: string): void
  setGradientBottomColorLeftBlack(color: string): void
  setBackgroundColor(color: string): void
  setLaneOpacity(value: number): void
  setNoteLabelsOnNotes(value: boolean): void
  setNoteLabelsOnKeys(value: boolean): void
  setNoteLabelFormat(format: VisualizerSettingsSlice['noteLabelFormat']): void
  setNoteLabelColor(color: string): void
  setNoteLabelSize(size: number): void
  setErrorMessage(message: string | null): void
  setSelectedSong(id: string | null): void
  setSessionConfig(config: Partial<LearnSessionConfig>): void
  resetSessionConfig(): void
  startSession(): void
  endSession(): void
  exitSession(): void
  advanceChord(): void
  setCurrentChordIndex(index: number): void
  setLearnActive(active: boolean): void
  recordCorrect(): void
  recordWrong(): void
  recordMissed(): void
  setFingerNumbers(map: Record<string, number>): void
  setMidiAvailable(available: boolean): void
  setMidiDevices(devices: MidiDeviceInfo[]): void
  setConnectedDevice(id: string | null): void
  setConnectionStatus(status: MidiConnectionStatus): void
  setLearnVisuals(patch: Partial<LearnVisuals>): void
  setLearnVisualsPreset(preset: LearnVisuals): void
  batchUpdate(fn: (state: AppState) => void): void
  resetStore(): void
}

type AppStore = AppState & AppActions

const projectDataSelector = (state: AppState) => ({
  isProjectLoaded: state.isProjectLoaded,
  precomputedTempoMap: state.precomputedTempoMap,
  projectData: state.projectData,
})

const playbackSelector = (state: AppState) => ({
  currentTick: state.currentTick,
  isPlaying: state.isPlaying,
  loopEnabled: state.loopEnabled,
  loopEndTick: state.loopEndTick,
  loopStartTick: state.loopStartTick,
})

const cameraSelector = (state: AppState) => ({
  panX: state.panX,
  panY: state.panY,
  renderScale: state.renderScale,
  viewportHeight: state.viewportHeight,
  viewportWidth: state.viewportWidth,
  worldZoom: state.worldZoom,
})

const selectionSelector = (state: AppState) => ({
  hoveredNoteId: state.hoveredNoteId,
  selectedNoteIds: state.selectedNoteIds,
})

const trackColorsSelector = (state: AppState) => state.trackColors

const exportSelector = (state: AppState) => ({
  exportEstimatedSecondsRemaining: state.exportEstimatedSecondsRemaining,
  exportFramesRendered: state.exportFramesRendered,
  exportProgress: state.exportProgress,
  exportTotalFrames: state.exportTotalFrames,
  isExporting: state.isExporting,
})

const visualizerSelector = (state: AppState) => ({
  backgroundColor: state.backgroundColor,
  colorMode: state.colorMode,
  gradientBottomColorLeft: state.gradientBottomColorLeft,
  gradientBottomColorLeftBlack: state.gradientBottomColorLeftBlack,
  gradientBottomColorRight: state.gradientBottomColorRight,
  gradientBottomColorRightBlack: state.gradientBottomColorRightBlack,
  gradientTopColor: state.gradientTopColor,
  laneOpacity: state.laneOpacity,
  leftHandColor: state.leftHandColor,
  noteGradientDirection: state.noteGradientDirection,
  noteStyle: state.noteStyle,
  noteLabelFormat: state.noteLabelFormat,
  noteLabelColor: state.noteLabelColor,
  noteLabelSize: state.noteLabelSize,
  noteLabelsOnKeys: state.noteLabelsOnKeys,
  noteLabelsOnNotes: state.noteLabelsOnNotes,
  pitchClassColors: state.pitchClassColors,
  rightHandColor: state.rightHandColor,
  splitPitch: state.splitPitch,
  velocityHighColor: state.velocityHighColor,
  velocityLowColor: state.velocityLowColor,
})

const learnV3Initial: LearnV3State = {
  currentChordIndex: 0,
  fingerNumbers: {},
  isActive: false,
  midi: {
    available: false,
    connectedDeviceId: null,
    connectionStatus: 'disconnected',
    devices: [],
  },
  selectedSongId: null,
  sessionConfig: {
    hand: 'both',
    mode: null,
    tempoMultiplier: 1.0,
  },
  sessionState: 'idle',
  stats: {
    bestStreak: 0,
    correct: 0,
    missed: 0,
    streak: 0,
    wrong: 0,
  },
}

const learnVisualsInitial: LearnVisuals = {
  fingerNumbersEnabled: true,
  glowEnabled: false,
  leftHandColor: '#4ade80',
  noteColor: 'perHand',
  noteLabelsEnabled: true,
  noteOpacity: 1.0,
  rightHandColor: '#60a5fa',
}

export const visualizerSettingsInitial: VisualizerSettings = {
  aspectRatio: 'fit',
  framerate: 60,
  resolution: '1080p',
}

export const cameraOverlayInitial: CameraOverlaySettings = {
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  cropTop: 0,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

export const recordModeConfigInitial: RecordModeConfig = {
  audioSourceDeviceId: null,
  cameraDeviceId: null,
  midiDeviceId: null,
  useMic: false,
  useMidiAudio: true,
}

const alignmentInitial = {
  alignStep: 'idle' as AlignStep,
  highCPoint: null as AlignmentPoint | null,
  lowAPoint: null as AlignmentPoint | null,
}

const UNSUPPORTED_RECORDING_PIECE_MESSAGE =
  'MP4 recording pieces cannot be loaded yet. This feature is coming in a future update.'

function normalizeVisualizerAspectRatio(
  aspectRatio: VisualizerSettings['aspectRatio'] | '9:16' | undefined,
): VisualizerSettings['aspectRatio'] | undefined {
  if (aspectRatio == null) {
    return undefined
  }

  return aspectRatio === '9:16' ? 'fit' : aspectRatio
}

function createInitialState(): AppState {
  return {
    appMode: 'create',
    activeSecondBarTab: 'pieces',
    alignStep: alignmentInitial.alignStep,
    activePanel: null,
    currentTick: 0,
    errorMessage: null,
    exportEstimatedSecondsRemaining: 0,
    exportFramesRendered: 0,
    exportProgress: 0,
    exportTotalFrames: 0,
    hoveredNoteId: null,
    isExporting: false,
    isPlaying: false,
    isProjectLoaded: false,
    currentPieceId: null,
    cameraOverlay: { ...cameraOverlayInitial },
    highCPoint: alignmentInitial.highCPoint,
    loadPieceError: null,
    learnVisuals: { ...learnVisualsInitial },
    learnV3: structuredClone(learnV3Initial),
    loopEnabled: false,
    loopEndTick: 0,
    loopStartTick: 0,
    lowAPoint: alignmentInitial.lowAPoint,
    panX: 0,
    panY: 0,
    pieces: [],
    recordModeConfig: { ...recordModeConfigInitial },
    precomputedTempoMap: null,
    projectData: null,
    renderScale: 1,
    selectedNoteIds: new Set<string>(),
    visualizerSettings: { ...visualizerSettingsInitial },
    ...createVisualizerSettingsDefaults(),
    trackColors: {},
    trackMuted: {},
    trackSoloed: {},
    viewportHeight: DEFAULT_VIEWPORT_HEIGHT,
    viewportWidth: DEFAULT_VIEWPORT_WIDTH,
    worldZoom: 1,
  }
}

function createVisualizerSettingsDefaults(): VisualizerSettingsSlice {
  return {
    backgroundColor: '#303030',
    colorMode: 'split',
    gradientBottomColorLeft: '#77a3ca',
    gradientBottomColorLeftBlack: '#4b75af',
    gradientBottomColorRight: '#9ee65a',
    gradientBottomColorRightBlack: '#86c04c',
    gradientTopColor: '#ffffff',
    laneOpacity: 40,
    leftHandColor: '#77a3ca',
    noteLabelFormat: 'name',
    noteLabelColor: '#000000',
    noteLabelSize: 16,
    noteLabelsOnKeys: true,
    noteLabelsOnNotes: true,
    noteGradientDirection: 'horizontal',
    noteStyle: 'gradient',
    pitchClassColors: { ...DEFAULT_PITCH_CLASS_COLORS },
    rightHandColor: '#9ee65a',
    splitPitch: 60,
    velocityHighColor: '#f7674f',
    velocityLowColor: '#4f8ef7',
  }
}

function createPlaybackDefaults(): PlaybackSlice {
  return {
    currentTick: 0,
    isPlaying: false,
    loopEnabled: false,
    loopEndTick: 0,
    loopStartTick: 0,
  }
}

function createSelectionDefaults(): SelectionSlice {
  return {
    hoveredNoteId: null,
    selectedNoteIds: new Set<string>(),
  }
}

function createTrackDefaults(tracks: Track[]): TrackSlice {
  validateTracks(tracks)

  const trackColors: Record<string, string> = {}
  const trackMuted: Record<string, boolean> = {}
  const trackSoloed: Record<string, boolean> = {}

  tracks.forEach((track, index) => {
    trackColors[track.id] = DEFAULT_TRACK_COLORS[index % DEFAULT_TRACK_COLORS.length]
    trackMuted[track.id] = false
    trackSoloed[track.id] = false
  })

  return {
    trackColors,
    trackMuted,
    trackSoloed,
  }
}

function createExportDefaults(): Pick<
  UISlice,
  | 'isExporting'
  | 'exportProgress'
  | 'exportFramesRendered'
  | 'exportTotalFrames'
  | 'exportEstimatedSecondsRemaining'
> {
  return {
    exportEstimatedSecondsRemaining: 0,
    exportFramesRendered: 0,
    exportProgress: 0,
    exportTotalFrames: 0,
    isExporting: false,
  }
}

export const useAppStore = create<AppStore>()(
  immer((set, get) => ({
    ...createInitialState(),

    loadProject: (projectData, tempoMap) => {
      validateProjectData(projectData)
      validateTempoMap(tempoMap)

      const trackDefaults = createTrackDefaults(projectData.tracks)
      const playbackDefaults = createPlaybackDefaults()
      const selectionDefaults = createSelectionDefaults()
      const exportDefaults = createExportDefaults()

      set((state) => {
        state.projectData = projectData
        state.precomputedTempoMap = tempoMap
        state.isProjectLoaded = true

        state.currentTick = playbackDefaults.currentTick
        state.isPlaying = playbackDefaults.isPlaying
        state.loopEnabled = playbackDefaults.loopEnabled
        state.loopStartTick = playbackDefaults.loopStartTick
        state.loopEndTick = playbackDefaults.loopEndTick

        state.selectedNoteIds = selectionDefaults.selectedNoteIds
        state.hoveredNoteId = selectionDefaults.hoveredNoteId

        state.trackColors = trackDefaults.trackColors
        state.trackMuted = trackDefaults.trackMuted
        state.trackSoloed = trackDefaults.trackSoloed

        state.isExporting = exportDefaults.isExporting
        state.exportProgress = exportDefaults.exportProgress
        state.exportFramesRendered = exportDefaults.exportFramesRendered
        state.exportTotalFrames = exportDefaults.exportTotalFrames
        state.exportEstimatedSecondsRemaining = exportDefaults.exportEstimatedSecondsRemaining

        state.errorMessage = null
        state.loadPieceError = null
      })
    },

    unloadProject: () => {
      set(() => createInitialState())
    },

    setCurrentTick: (tick) => {
      const normalizedTick = normalizeTick(tick)

      set((state) => {
        const maxTick = state.projectData?.totalTicks ?? Number.POSITIVE_INFINITY
        state.currentTick = clamp(normalizedTick, 0, maxTick)
      })
    },

    setIsPlaying: (playing) => {
      set((state) => {
        state.isPlaying = Boolean(playing)
      })
    },

    setLoop: (enabled, startTick, endTick) => {
      const currentState = get()
      const maxTick = currentState.projectData?.totalTicks ?? Number.POSITIVE_INFINITY
      const nextStart = clamp(
        normalizeTick(startTick ?? currentState.loopStartTick),
        0,
        maxTick,
      )
      const unclampedEnd = clamp(
        normalizeTick(endTick ?? currentState.loopEndTick),
        0,
        maxTick,
      )
      const nextEnd = Math.max(nextStart, unclampedEnd)

      set((state) => {
        state.loopEnabled = Boolean(enabled)
        state.loopStartTick = nextStart
        state.loopEndTick = nextEnd
      })
    },

    setZoom: (zoom) => {
      const normalizedZoom = clamp(normalizePositiveFiniteOrFallback(zoom, 1), MIN_ZOOM, MAX_ZOOM)

      set((state) => {
        state.worldZoom = normalizedZoom
      })
    },

    setPan: (panX, panY) => {
      validateFiniteStateNumber(panX, 'panX')
      validateFiniteStateNumber(panY, 'panY')

      set((state) => {
        state.panX = panX
        state.panY = panY
      })
    },

    setRenderScale: (scale) => {
      validateFiniteStateNumber(scale, 'renderScale')

      set((state) => {
        state.renderScale = Math.max(0, scale)
      })
    },

    setViewportSize: (width, height) => {
      validateFiniteStateNumber(width, 'viewportWidth')
      validateFiniteStateNumber(height, 'viewportHeight')

      set((state) => {
        state.viewportWidth = Math.max(0, Math.round(width))
        state.viewportHeight = Math.max(0, Math.round(height))
      })
    },

    selectNotes: (noteIds) => {
      validateNoteIds(noteIds)

      set((state) => {
        state.selectedNoteIds = new Set(noteIds)
      })
    },

    addToSelection: (noteIds) => {
      validateNoteIds(noteIds)

      set((state) => {
        state.selectedNoteIds = new Set([...state.selectedNoteIds, ...noteIds])
      })
    },

    clearSelection: () => {
      set((state) => {
        state.selectedNoteIds = new Set<string>()
      })
    },

    setHoveredNote: (noteId) => {
      validateOptionalString(noteId, 'hoveredNoteId')

      set((state) => {
        state.hoveredNoteId = noteId
      })
    },

    setTrackColor: (trackId, color) => {
      validateTrackId(trackId)
      validateHexColor(color)

      set((state) => {
        state.trackColors = {
          ...state.trackColors,
          [trackId]: color,
        }
      })
    },

    setTrackMuted: (trackId, muted) => {
      validateTrackId(trackId)

      set((state) => {
        state.trackMuted = {
          ...state.trackMuted,
          [trackId]: Boolean(muted),
        }
      })
    },

    setTrackSoloed: (trackId, soloed) => {
      validateTrackId(trackId)

      set((state) => {
        state.trackSoloed = {
          ...state.trackSoloed,
          [trackId]: Boolean(soloed),
        }
      })
    },

    initTrackDefaults: (tracks) => {
      const trackDefaults = createTrackDefaults(tracks)

      set((state) => {
        state.trackColors = trackDefaults.trackColors
        state.trackMuted = trackDefaults.trackMuted
        state.trackSoloed = trackDefaults.trackSoloed
      })
    },

    addPiece: (piece) => {
      validatePiece(piece)

      set((state) => {
        const existingIndex = state.pieces.findIndex((candidate) => candidate.id === piece.id)
        if (existingIndex >= 0) {
          state.pieces[existingIndex] = piece
          return
        }

        state.pieces.push(piece)
      })
    },

    removePiece: (id) => {
      validateTrackId(id)

      set((state) => {
        state.pieces = state.pieces.filter((piece) => piece.id !== id)
        if (state.currentPieceId === id) {
          state.currentPieceId = null
        }
      })
    },

    loadPiece: async (id) => {
      validateTrackId(id)

      set((state) => {
        state.loadPieceError = null
      })

      const piece = get().pieces.find((candidate) => candidate.id === id) ?? null
      if (piece == null || piece.filePath == null) {
        return false
      }

      if (!/\.(mid|midi)$/i.test(piece.filePath)) {
        console.warn('[loadPiece] Skipping non-MIDI file:', piece.filePath)
        set((state) => {
          state.loadPieceError = UNSUPPORTED_RECORDING_PIECE_MESSAGE
        })
        return false
      }

      try {
        const { loadMidiFileFromPath, warmUpAudioAndStartPlayback } = await import('../midi/loadMidiProject')
        const loaded = await loadMidiFileFromPath(piece.filePath)

        if (loaded) {
          set((state) => {
            state.currentPieceId = piece.id
            state.errorMessage = null
            state.loadPieceError = null
          })

          await warmUpAudioAndStartPlayback()
        }

        return loaded
      } catch (error) {
        console.error(`Failed to load piece "${piece.name}":`, error)
        set((state) => {
          state.errorMessage = `Failed to load piece "${piece.name}".`
        })
        return false
      }
    },

    clearLoadPieceError: () => {
      set((state) => {
        state.loadPieceError = null
      })
    },

    clearLoadedPiece: () => {
      const playbackDefaults = createPlaybackDefaults()
      const selectionDefaults = createSelectionDefaults()
      const exportDefaults = createExportDefaults()

      set((state) => {
        state.alignStep = alignmentInitial.alignStep
        state.currentPieceId = null
        state.loadPieceError = null
        state.highCPoint = alignmentInitial.highCPoint
        state.lowAPoint = alignmentInitial.lowAPoint
        state.projectData = null
        state.precomputedTempoMap = null
        state.isProjectLoaded = false

        state.currentTick = playbackDefaults.currentTick
        state.isPlaying = playbackDefaults.isPlaying
        state.loopEnabled = playbackDefaults.loopEnabled
        state.loopStartTick = playbackDefaults.loopStartTick
        state.loopEndTick = playbackDefaults.loopEndTick

        state.selectedNoteIds = selectionDefaults.selectedNoteIds
        state.hoveredNoteId = selectionDefaults.hoveredNoteId

        state.trackColors = {}
        state.trackMuted = {}
        state.trackSoloed = {}

        state.isExporting = exportDefaults.isExporting
        state.exportProgress = exportDefaults.exportProgress
        state.exportFramesRendered = exportDefaults.exportFramesRendered
        state.exportTotalFrames = exportDefaults.exportTotalFrames
        state.exportEstimatedSecondsRemaining = exportDefaults.exportEstimatedSecondsRemaining

        state.errorMessage = null
      })
    },

    setVisualizerSettings: (patch) => {
      set((state) => {
        const normalizedAspectRatio = normalizeVisualizerAspectRatio(
          (patch as Partial<VisualizerSettings> & { aspectRatio?: VisualizerSettings['aspectRatio'] | '9:16' }).aspectRatio,
        )

        state.visualizerSettings = {
          ...state.visualizerSettings,
          ...patch,
          ...(normalizedAspectRatio == null ? {} : { aspectRatio: normalizedAspectRatio }),
        }
      })
    },

    setCameraOverlay: (patch) => {
      if (patch.offsetX != null) {
        validateFiniteStateNumber(patch.offsetX, 'cameraOverlay.offsetX')
      }
      if (patch.offsetY != null) {
        validateFiniteStateNumber(patch.offsetY, 'cameraOverlay.offsetY')
      }
      if (patch.scale != null) {
        validateFiniteStateNumber(patch.scale, 'cameraOverlay.scale')
      }
      if (patch.cropTop != null) {
        validateFiniteStateNumber(patch.cropTop, 'cameraOverlay.cropTop')
      }
      if (patch.cropRight != null) {
        validateFiniteStateNumber(patch.cropRight, 'cameraOverlay.cropRight')
      }
      if (patch.cropBottom != null) {
        validateFiniteStateNumber(patch.cropBottom, 'cameraOverlay.cropBottom')
      }
      if (patch.cropLeft != null) {
        validateFiniteStateNumber(patch.cropLeft, 'cameraOverlay.cropLeft')
      }

      set((state) => {
        state.cameraOverlay = {
          ...state.cameraOverlay,
          ...patch,
        }
      })
    },

    setAlignStep: (step) => {
      validateAlignStep(step)

      set((state) => {
        state.alignStep = step
      })
    },

    setLowAPoint: (point) => {
      validateAlignmentPoint(point, 'lowAPoint')

      set((state) => {
        state.lowAPoint = point
      })
    },

    setHighCPoint: (point) => {
      validateAlignmentPoint(point, 'highCPoint')

      set((state) => {
        state.highCPoint = point
      })
    },

    enterRecordMode: () => {
      set((state) => {
        state.appMode = 'createRecord'
        state.activeSecondBarTab = 'pieces'
        state.alignStep = alignmentInitial.alignStep
        state.lowAPoint = alignmentInitial.lowAPoint
        state.highCPoint = alignmentInitial.highCPoint
      })
    },

    setRecordModeConfig: (patch) => {
      validateRecordModeConfigPatch(patch)

      set((state) => {
        state.recordModeConfig = {
          ...state.recordModeConfig,
          ...patch,
        }
      })
    },

    setActivePanel: (panel) => {
      validateActivePanel(panel)

      set((state) => {
        state.activePanel = panel
      })
    },

    setActiveSecondBarTab: (tab) => {
      validateCreateTab(tab)

      set((state) => {
        state.activeSecondBarTab = tab
      })
    },

    setAppMode: (mode) => {
      validateAppMode(mode)

      set((state) => {
        state.appMode = mode
        if (mode !== 'createCamera' && state.activeSecondBarTab === 'camera') {
          state.activeSecondBarTab = 'pieces'
        }
        if (mode !== 'createCamera') {
          state.alignStep = alignmentInitial.alignStep
          state.lowAPoint = alignmentInitial.lowAPoint
          state.highCPoint = alignmentInitial.highCPoint
        }
      })
    },

    enterCameraMode: () => {
      set((state) => {
        const hasLoadedPiece = (
          state.isProjectLoaded &&
          state.currentPieceId != null &&
          state.pieces.some((piece) => piece.id === state.currentPieceId)
        )

        if (!hasLoadedPiece) {
          return
        }

        state.appMode = 'createCamera'
        state.activeSecondBarTab = 'camera'
      })
    },

    setExportProgress: (progress, framesRendered, totalFrames, estimatedSeconds) => {
      validateFiniteStateNumber(progress, 'exportProgress')
      validateFiniteStateNumber(framesRendered, 'exportFramesRendered')
      validateFiniteStateNumber(totalFrames, 'exportTotalFrames')
      validateFiniteStateNumber(estimatedSeconds, 'exportEstimatedSecondsRemaining')

      set((state) => {
        state.exportProgress = clamp(progress, 0, 1)
        state.exportFramesRendered = Math.max(0, Math.floor(framesRendered))
        state.exportTotalFrames = Math.max(0, Math.floor(totalFrames))
        state.exportEstimatedSecondsRemaining = Math.max(0, estimatedSeconds)
      })
    },

    setIsExporting: (exporting) => {
      set((state) => {
        state.isExporting = Boolean(exporting)
      })
    },

    setColorMode: (mode) => {
      validateColorMode(mode)

      set((state) => {
        state.colorMode = mode
      })
    },

    setPitchClassColor: (pitchClass, color) => {
      validatePitchClass(pitchClass)
      validateHexColor(color)

      set((state) => {
        state.pitchClassColors = {
          ...state.pitchClassColors,
          [pitchClass]: color,
        }
      })
    },

    setSplitPitch: (pitch) => {
      validateFiniteStateNumber(pitch, 'splitPitch')

      set((state) => {
        state.splitPitch = clamp(Math.round(pitch), 21, 108)
      })
    },

    setLeftHandColor: (color) => {
      validateHexColor(color)

      set((state) => {
        state.leftHandColor = color
      })
    },

    setRightHandColor: (color) => {
      validateHexColor(color)

      set((state) => {
        state.rightHandColor = color
      })
    },

    setVelocityColors: (low, high) => {
      validateHexColor(low)
      validateHexColor(high)

      set((state) => {
        state.velocityLowColor = low
        state.velocityHighColor = high
      })
    },

    setNoteStyle: (style) => {
      validateNoteStyle(style)

      set((state) => {
        state.noteStyle = style
      })
    },

    setNoteGradientDirection: (direction) => {
      validateNoteGradientDirection(direction)

      set((state) => {
        state.noteGradientDirection = direction
      })
    },

    setGradientTopColor: (color) => {
      validateHexColor(color)

      set((state) => {
        state.gradientTopColor = color
      })
    },

    setGradientBottomColorRight: (color) => {
      validateHexColor(color)

      set((state) => {
        state.gradientBottomColorRight = color
      })
    },

    setGradientBottomColorLeft: (color) => {
      validateHexColor(color)

      set((state) => {
        state.gradientBottomColorLeft = color
      })
    },

    setGradientBottomColorRightBlack: (color) => {
      validateHexColor(color)

      set((state) => {
        state.gradientBottomColorRightBlack = color
      })
    },

    setGradientBottomColorLeftBlack: (color) => {
      validateHexColor(color)

      set((state) => {
        state.gradientBottomColorLeftBlack = color
      })
    },

    setBackgroundColor: (color) => {
      validateHexColor(color)

      set((state) => {
        state.backgroundColor = color
      })
    },

    setLaneOpacity: (value) => {
      validateFiniteStateNumber(value, 'laneOpacity')

      set((state) => {
        state.laneOpacity = clamp(Math.round(value), 0, 100)
      })
    },

    setNoteLabelsOnNotes: (value) => {
      set((state) => {
        state.noteLabelsOnNotes = Boolean(value)
      })
    },

    setNoteLabelsOnKeys: (value) => {
      set((state) => {
        state.noteLabelsOnKeys = Boolean(value)
      })
    },

    setNoteLabelFormat: (format) => {
      validateNoteLabelFormat(format)

      set((state) => {
        state.noteLabelFormat = format
      })
    },

    setNoteLabelColor: (color) => {
      validateHexColor(color)

      set((state) => {
        state.noteLabelColor = color
      })
    },

    setNoteLabelSize: (size) => {
      validateFiniteStateNumber(size, 'noteLabelSize')

      set((state) => {
        state.noteLabelSize = clamp(Math.round(size), 8, 16)
      })
    },

    setErrorMessage: (message) => {
      validateOptionalString(message, 'errorMessage')

      set((state) => {
        state.errorMessage = message
      })
    },

    setSelectedSong: (id) => {
      validateOptionalString(id, 'selectedSongId')

      set((state) => {
        state.learnV3.selectedSongId = id
      })
    },

    setSessionConfig: (config) => {
      set((state) => {
        Object.assign(state.learnV3.sessionConfig, config)
      })
    },

    resetSessionConfig: () => {
      set((state) => {
        state.learnV3.sessionConfig = { ...learnV3Initial.sessionConfig }
      })
    },

    startSession: () => {
      set((state) => {
        state.learnV3.isActive = true
        state.learnV3.sessionState = 'playing'
        state.learnV3.currentChordIndex = 0
        state.learnV3.stats = { ...learnV3Initial.stats }
      })
    },

    endSession: () => {
      set((state) => {
        state.learnV3.sessionState = 'ended'
      })
    },

    exitSession: () => {
      set((state) => {
        state.learnV3.isActive = false
        state.learnV3.sessionState = 'idle'
        state.learnV3.currentChordIndex = 0
      })
    },

    advanceChord: () => {
      set((state) => {
        state.learnV3.currentChordIndex += 1
      })
    },

    setCurrentChordIndex: (index) => {
      validateFiniteStateNumber(index, 'currentChordIndex')

      set((state) => {
        state.learnV3.currentChordIndex = Math.max(0, Math.floor(index))
      })
    },

    setLearnActive: (active) => {
      set((state) => {
        state.learnV3.isActive = Boolean(active)
      })
    },

    recordCorrect: () => {
      set((state) => {
        const stats = state.learnV3.stats
        stats.correct += 1
        stats.streak += 1
        if (stats.streak > stats.bestStreak) {
          stats.bestStreak = stats.streak
        }
      })
    },

    recordWrong: () => {
      set((state) => {
        state.learnV3.stats.wrong += 1
        state.learnV3.stats.streak = 0
      })
    },

    recordMissed: () => {
      set((state) => {
        state.learnV3.stats.missed += 1
        state.learnV3.stats.streak = 0
      })
    },

    setFingerNumbers: (map) => {
      set((state) => {
        state.learnV3.fingerNumbers = map
      })
    },

    setMidiAvailable: (available) => {
      set((state) => {
        state.learnV3.midi.available = available
      })
    },

    setMidiDevices: (devices) => {
      set((state) => {
        state.learnV3.midi.devices = devices
      })
    },

    setConnectedDevice: (id) => {
      validateOptionalString(id, 'connectedDeviceId')

      set((state) => {
        state.learnV3.midi.connectedDeviceId = id
      })
    },

    setConnectionStatus: (status) => {
      set((state) => {
        state.learnV3.midi.connectionStatus = status
      })
    },

    setLearnVisuals: (patch) => {
      if (patch.noteColor != null) {
        validateLearnNoteColorMode(patch.noteColor)
      }
      if (patch.leftHandColor != null) {
        validateHexColor(patch.leftHandColor)
      }
      if (patch.rightHandColor != null) {
        validateHexColor(patch.rightHandColor)
      }
      if (patch.noteOpacity != null) {
        validateFiniteStateNumber(patch.noteOpacity, 'learnVisuals.noteOpacity')
      }

      set((state) => {
        if (patch.noteColor != null) {
          state.learnVisuals.noteColor = patch.noteColor
        }
        if (patch.leftHandColor != null) {
          state.learnVisuals.leftHandColor = patch.leftHandColor
        }
        if (patch.rightHandColor != null) {
          state.learnVisuals.rightHandColor = patch.rightHandColor
        }
        if (patch.noteOpacity != null) {
          state.learnVisuals.noteOpacity = clamp(patch.noteOpacity, 0.3, 1)
        }
        if (patch.glowEnabled != null) {
          state.learnVisuals.glowEnabled = Boolean(patch.glowEnabled)
        }
        if (patch.noteLabelsEnabled != null) {
          state.learnVisuals.noteLabelsEnabled = Boolean(patch.noteLabelsEnabled)
        }
        if (patch.fingerNumbersEnabled != null) {
          state.learnVisuals.fingerNumbersEnabled = Boolean(patch.fingerNumbersEnabled)
        }
      })
    },

    setLearnVisualsPreset: (preset) => {
      validateLearnVisuals(preset)

      set((state) => {
        state.learnVisuals = {
          fingerNumbersEnabled: Boolean(preset.fingerNumbersEnabled),
          glowEnabled: Boolean(preset.glowEnabled),
          leftHandColor: preset.leftHandColor,
          noteColor: preset.noteColor,
          noteLabelsEnabled: Boolean(preset.noteLabelsEnabled),
          noteOpacity: clamp(preset.noteOpacity, 0.3, 1),
          rightHandColor: preset.rightHandColor,
        }
      })
    },

    batchUpdate: (fn) => {
      if (typeof fn !== 'function') {
        throw new StoreError('batchUpdate requires a function.', 'INVALID_STATE', fn)
      }

      set((state) => {
        fn(state as AppState)
      })
    },

    resetStore: () => {
      set(() => createInitialState())
    },
  })),
)

export const useProjectData = () => useAppStore(useShallow(projectDataSelector))

export const usePlaybackState = () => useAppStore(useShallow(playbackSelector))

export const useCameraState = () => useAppStore(useShallow(cameraSelector))

export const useSelection = () => useAppStore(useShallow(selectionSelector))

export const useTrackColors = () => useAppStore(trackColorsSelector)

export const useExportState = () => useAppStore(useShallow(exportSelector))

export const useVisualizerSettings = () => useAppStore(useShallow(visualizerSelector))

export const getAppState = () => useAppStore.getState()
export const subscribeToStore = useAppStore.subscribe
export const resetStore = () => useAppStore.getState().resetStore()

function validateProjectData(projectData: ProjectData | null | undefined): asserts projectData is ProjectData {
  if (
    projectData == null ||
    typeof projectData !== 'object' ||
    !Array.isArray(projectData.tracks) ||
    !Number.isFinite(projectData.totalTicks) ||
    !Number.isFinite(projectData.ticksPerQuarter)
  ) {
    throw new StoreError('Project data is invalid.', 'INVALID_PROJECT', projectData)
  }
}

function validateTempoMap(
  tempoMap: PrecomputedTempoMap | null | undefined,
): asserts tempoMap is PrecomputedTempoMap {
  if (
    tempoMap == null ||
    typeof tempoMap !== 'object' ||
    !Array.isArray(tempoMap.segments) ||
    tempoMap.segments.length === 0
  ) {
    throw new StoreError('Tempo map is invalid.', 'INVALID_PROJECT', tempoMap)
  }
}

function validateTracks(tracks: Track[]): void {
  if (!Array.isArray(tracks)) {
    throw new StoreError('Tracks must be an array.', 'INVALID_STATE', tracks)
  }

  tracks.forEach((track, index) => {
    if (track == null || typeof track.id !== 'string' || track.id.length === 0) {
      throw new StoreError('Track defaults require valid track ids.', 'INVALID_STATE', {
        index,
        track,
      })
    }
  })
}

function validateTrackId(trackId: string): void {
  if (typeof trackId !== 'string' || trackId.trim().length === 0) {
    throw new StoreError('Track id must be a non-empty string.', 'INVALID_STATE', trackId)
  }
}

function validatePieceType(type: PieceType): void {
  if (type === 'midi' || type === 'recording') {
    return
  }

  throw new StoreError('Piece type is invalid.', 'INVALID_STATE', type)
}

function validatePiece(piece: Piece): void {
  if (piece == null || typeof piece !== 'object') {
    throw new StoreError('Piece is invalid.', 'INVALID_STATE', piece)
  }

  validateTrackId(piece.id)
  if (typeof piece.name !== 'string' || piece.name.trim().length === 0) {
    throw new StoreError('Piece name must be a non-empty string.', 'INVALID_STATE', piece)
  }

  validatePieceType(piece.type)
  if (piece.filePath !== null && typeof piece.filePath !== 'string') {
    throw new StoreError('Piece filePath must be a string or null.', 'INVALID_STATE', piece)
  }

  validateFiniteStateNumber(piece.createdAt, 'piece.createdAt')
}

function validateHexColor(color: string): void {
  if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
    throw new StoreError('Track color must be a valid hex color.', 'INVALID_COLOR', color)
  }
}

function validateNoteIds(noteIds: string[]): void {
  if (!Array.isArray(noteIds)) {
    throw new StoreError('Note ids must be an array.', 'INVALID_STATE', noteIds)
  }

  noteIds.forEach((noteId, index) => {
    if (typeof noteId !== 'string' || noteId.length === 0) {
      throw new StoreError('Note ids must be non-empty strings.', 'INVALID_STATE', {
        index,
        noteId,
      })
    }
  })
}

function validateOptionalString(value: string | null, label: string): void {
  if (value !== null && typeof value !== 'string') {
    throw new StoreError(`${label} must be a string or null.`, 'INVALID_STATE', value)
  }
}

function validateActivePanel(panel: UISlice['activePanel']): void {
  if (panel === null || panel === 'notes' || panel === 'effects' || panel === 'export') {
    return
  }

  throw new StoreError('Active panel is invalid.', 'INVALID_STATE', panel)
}

function validateAppMode(mode: AppMode): void {
  if (
    mode === 'select' ||
    mode === 'create' ||
    mode === 'createCamera' ||
    mode === 'createRecord' ||
    mode === 'learn' ||
    mode === 'learnSong' ||
    mode === 'learnSession' ||
    mode === 'learnEnd'
  ) {
    return
  }

  throw new StoreError('App mode is invalid.', 'INVALID_STATE', mode)
}

function validateCreateTab(tab: CreateTab): void {
  if (
    tab === 'pieces' ||
    tab === 'particles' ||
    tab === 'color' ||
    tab === 'camera'
  ) {
    return
  }

  throw new StoreError('Create tab is invalid.', 'INVALID_STATE', tab)
}

function validateAlignStep(step: AlignStep): void {
  if (
    step === 'idle' ||
    step === 'waiting-low-a' ||
    step === 'waiting-high-c' ||
    step === 'complete'
  ) {
    return
  }

  throw new StoreError('Align step is invalid.', 'INVALID_STATE', step)
}

function validateAlignmentPoint(
  point: AlignmentPoint | null,
  label: 'highCPoint' | 'lowAPoint',
): void {
  if (point == null) {
    return
  }

  if (typeof point !== 'object') {
    throw new StoreError(`${label} must be an object or null.`, 'INVALID_STATE', point)
  }

  validateFiniteStateNumber(point.x, `${label}.x`)
  validateFiniteStateNumber(point.y, `${label}.y`)
}

function validateRecordModeConfigPatch(patch: Partial<RecordModeConfig>): void {
  if (patch == null || typeof patch !== 'object') {
    throw new StoreError('Record mode config patch is invalid.', 'INVALID_STATE', patch)
  }

  if (patch.audioSourceDeviceId !== undefined) {
    validateOptionalString(patch.audioSourceDeviceId, 'recordModeConfig.audioSourceDeviceId')
  }
  if (patch.midiDeviceId !== undefined) {
    validateOptionalString(patch.midiDeviceId, 'recordModeConfig.midiDeviceId')
  }
  if (patch.cameraDeviceId !== undefined) {
    validateOptionalString(patch.cameraDeviceId, 'recordModeConfig.cameraDeviceId')
  }
  if (patch.useMidiAudio !== undefined && typeof patch.useMidiAudio !== 'boolean') {
    throw new StoreError(
      'recordModeConfig.useMidiAudio must be a boolean.',
      'INVALID_STATE',
      patch.useMidiAudio,
    )
  }
  if (patch.useMic !== undefined && typeof patch.useMic !== 'boolean') {
    throw new StoreError('recordModeConfig.useMic must be a boolean.', 'INVALID_STATE', patch.useMic)
  }
}

function validateLearnNoteColorMode(mode: LearnNoteColorMode): void {
  if (mode === 'white' || mode === 'perHand' || mode === 'custom') {
    return
  }

  throw new StoreError('Learn note color mode is invalid.', 'INVALID_STATE', mode)
}

function validateLearnVisuals(visuals: LearnVisuals): void {
  if (visuals == null || typeof visuals !== 'object') {
    throw new StoreError('Learn visuals preset is invalid.', 'INVALID_STATE', visuals)
  }

  validateLearnNoteColorMode(visuals.noteColor)
  validateHexColor(visuals.leftHandColor)
  validateHexColor(visuals.rightHandColor)
  validateFiniteStateNumber(visuals.noteOpacity, 'learnVisuals.noteOpacity')
}

function validateColorMode(mode: VisualizerSettingsSlice['colorMode']): void {
  if (mode === 'track' || mode === 'pitch' || mode === 'split' || mode === 'velocity') {
    return
  }

  throw new StoreError('Color mode is invalid.', 'INVALID_STATE', mode)
}

function validateNoteStyle(style: VisualizerSettingsSlice['noteStyle']): void {
  if (style === 'solid' || style === 'gradient' || style === 'saber') {
    return
  }

  throw new StoreError('Note style is invalid.', 'INVALID_STATE', style)
}

function validateNoteGradientDirection(
  direction: VisualizerSettingsSlice['noteGradientDirection'],
): void {
  if (direction === 'vertical' || direction === 'horizontal') {
    return
  }

  throw new StoreError('Note gradient direction is invalid.', 'INVALID_STATE', direction)
}

function validateNoteLabelFormat(format: VisualizerSettingsSlice['noteLabelFormat']): void {
  if (format === 'name' || format === 'nameOctave') {
    return
  }

  throw new StoreError('Note label format is invalid.', 'INVALID_STATE', format)
}

function validatePitchClass(pitchClass: number): void {
  if (Number.isInteger(pitchClass) && pitchClass >= 0 && pitchClass <= 11) {
    return
  }

  throw new StoreError('Pitch class must be an integer between 0 and 11.', 'INVALID_STATE', pitchClass)
}

function validateFiniteStateNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new StoreError(`${label} must be a finite number.`, 'INVALID_STATE', {
      [label]: value,
    })
  }
}

function normalizeTick(tick: number): number {
  if (!Number.isFinite(tick)) {
    return 0
  }

  return Math.max(0, Math.floor(tick))
}

function normalizePositiveFiniteOrFallback(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export { StoreError, learnVisualsInitial }
export type {
  AppMode,
  LearnMode,
  LearnHand,
  LearnNoteColorMode,
  PieceType,
  MidiConnectionStatus,
  LearnSessionConfig,
  LearnStats,
  MidiDeviceInfo,
  LearnV3State,
  LearnVisuals,
}
