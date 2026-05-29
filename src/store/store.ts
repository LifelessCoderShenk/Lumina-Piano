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

interface UISlice {
  activePanel: 'notes' | 'effects' | 'export' | null
  isExporting: boolean
  exportProgress: number
  exportFramesRendered: number
  exportTotalFrames: number
  exportEstimatedSecondsRemaining: number
  showEffects: boolean
  showParticles: boolean
  showBloom: boolean
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
  bloomEnabled: boolean
  bloomStrength: number
  bloomRadius: number
  particlesEnabled: boolean
  particleCount: number
  particleSize: number
  keyGlowEnabled: boolean
  keyGlowIntensity: number
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
  & UISlice
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
  setActivePanel(panel: UISlice['activePanel']): void
  setExportProgress(
    progress: number,
    framesRendered: number,
    totalFrames: number,
    estimatedSeconds: number,
  ): void
  setIsExporting(exporting: boolean): void
  setShowEffects(show: boolean): void
  setShowParticles(show: boolean): void
  setShowBloom(show: boolean): void
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
  setBloomEnabled(enabled: boolean): void
  setBloomStrength(value: number): void
  setBloomRadius(value: number): void
  setParticlesEnabled(enabled: boolean): void
  setParticleCount(value: number): void
  setParticleSize(value: number): void
  setKeyGlowEnabled(enabled: boolean): void
  setKeyGlowIntensity(value: number): void
  setBackgroundColor(color: string): void
  setLaneOpacity(value: number): void
  setNoteLabelsOnNotes(value: boolean): void
  setNoteLabelsOnKeys(value: boolean): void
  setNoteLabelFormat(format: VisualizerSettingsSlice['noteLabelFormat']): void
  setNoteLabelColor(color: string): void
  setNoteLabelSize(size: number): void
  setErrorMessage(message: string | null): void
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

const uiSelector = (state: AppState) => ({
  activePanel: state.activePanel,
  errorMessage: state.errorMessage,
  showBloom: state.showBloom,
  showEffects: state.showEffects,
  showParticles: state.showParticles,
})

const visualizerSelector = (state: AppState) => ({
  backgroundColor: state.backgroundColor,
  bloomEnabled: state.bloomEnabled,
  bloomRadius: state.bloomRadius,
  bloomStrength: state.bloomStrength,
  colorMode: state.colorMode,
  gradientBottomColorLeft: state.gradientBottomColorLeft,
  gradientBottomColorLeftBlack: state.gradientBottomColorLeftBlack,
  gradientBottomColorRight: state.gradientBottomColorRight,
  gradientBottomColorRightBlack: state.gradientBottomColorRightBlack,
  gradientTopColor: state.gradientTopColor,
  keyGlowEnabled: state.keyGlowEnabled,
  keyGlowIntensity: state.keyGlowIntensity,
  laneOpacity: state.laneOpacity,
  leftHandColor: state.leftHandColor,
  noteGradientDirection: state.noteGradientDirection,
  noteStyle: state.noteStyle,
  noteLabelFormat: state.noteLabelFormat,
  noteLabelColor: state.noteLabelColor,
  noteLabelSize: state.noteLabelSize,
  noteLabelsOnKeys: state.noteLabelsOnKeys,
  noteLabelsOnNotes: state.noteLabelsOnNotes,
  particleCount: state.particleCount,
  particleSize: state.particleSize,
  particlesEnabled: state.particlesEnabled,
  pitchClassColors: state.pitchClassColors,
  rightHandColor: state.rightHandColor,
  splitPitch: state.splitPitch,
  velocityHighColor: state.velocityHighColor,
  velocityLowColor: state.velocityLowColor,
})

function createInitialState(): AppState {
  return {
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
    loopEnabled: false,
    loopEndTick: 0,
    loopStartTick: 0,
    panX: 0,
    panY: 0,
    precomputedTempoMap: null,
    projectData: null,
    renderScale: 1,
    selectedNoteIds: new Set<string>(),
    showBloom: true,
    showEffects: true,
    showParticles: true,
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
    bloomEnabled: true,
    bloomRadius: 50,
    bloomStrength: 75,
    colorMode: 'split',
    gradientBottomColorLeft: '#77a3ca',
    gradientBottomColorLeftBlack: '#4b75af',
    gradientBottomColorRight: '#9ee65a',
    gradientBottomColorRightBlack: '#86c04c',
    gradientTopColor: '#ffffff',
    keyGlowEnabled: true,
    keyGlowIntensity: 60,
    laneOpacity: 40,
    leftHandColor: '#77a3ca',
    noteLabelFormat: 'name',
    noteLabelColor: '#ffffff',
    noteLabelSize: 11,
    noteLabelsOnKeys: false,
    noteLabelsOnNotes: false,
    noteGradientDirection: 'vertical',
    noteStyle: 'gradient',
    particleCount: 10,
    particleSize: 50,
    particlesEnabled: true,
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

    setActivePanel: (panel) => {
      validateActivePanel(panel)

      set((state) => {
        state.activePanel = panel
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

    setShowEffects: (show) => {
      set((state) => {
        state.showEffects = Boolean(show)
      })
    },

    setShowParticles: (show) => {
      set((state) => {
        state.showParticles = Boolean(show)
        state.particlesEnabled = Boolean(show)
      })
    },

    setShowBloom: (show) => {
      set((state) => {
        state.showBloom = Boolean(show)
        state.bloomEnabled = Boolean(show)
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

    setBloomEnabled: (enabled) => {
      set((state) => {
        state.bloomEnabled = Boolean(enabled)
        state.showBloom = Boolean(enabled)
      })
    },

    setBloomStrength: (value) => {
      validateFiniteStateNumber(value, 'bloomStrength')

      set((state) => {
        state.bloomStrength = clamp(Math.round(value), 0, 100)
      })
    },

    setBloomRadius: (value) => {
      validateFiniteStateNumber(value, 'bloomRadius')

      set((state) => {
        state.bloomRadius = clamp(Math.round(value), 0, 100)
      })
    },

    setParticlesEnabled: (enabled) => {
      set((state) => {
        state.particlesEnabled = Boolean(enabled)
        state.showParticles = Boolean(enabled)
      })
    },

    setParticleCount: (value) => {
      validateFiniteStateNumber(value, 'particleCount')

      set((state) => {
        state.particleCount = clamp(Math.round(value), 0, 20)
      })
    },

    setParticleSize: (value) => {
      validateFiniteStateNumber(value, 'particleSize')

      set((state) => {
        state.particleSize = clamp(Math.round(value), 0, 100)
      })
    },

    setKeyGlowEnabled: (enabled) => {
      set((state) => {
        state.keyGlowEnabled = Boolean(enabled)
      })
    },

    setKeyGlowIntensity: (value) => {
      validateFiniteStateNumber(value, 'keyGlowIntensity')

      set((state) => {
        state.keyGlowIntensity = clamp(Math.round(value), 0, 100)
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

export const useUIState = () => useAppStore(useShallow(uiSelector))

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

export { StoreError }
