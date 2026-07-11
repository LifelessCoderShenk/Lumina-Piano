import type { Track } from '../midi/types'

import type {
  AlignStep,
  AlignmentPoint,
  AppState,
  CameraOverlaySettings,
  LearnV3State,
  LearnVisuals,
  PlaybackSlice,
  RecordModeConfig,
  SelectionSlice,
  TrackSlice,
  UISlice,
  VisualizerSettings,
  VisualizerSettingsSlice,
} from './types'
import { validateTracks } from './validation'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 20
export const DEFAULT_VIEWPORT_WIDTH = 1920
export const DEFAULT_VIEWPORT_HEIGHT = 1080

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

export const learnV3Initial: LearnV3State = {
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

export const learnVisualsInitial: LearnVisuals = {
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

export const alignmentInitial = {
  alignStep: 'idle' as AlignStep,
  highCPoint: null as AlignmentPoint | null,
  lowAPoint: null as AlignmentPoint | null,
}

export const UNSUPPORTED_RECORDING_PIECE_MESSAGE =
  'MP4 recording pieces cannot be loaded yet. This feature is coming in a future update.'

export function createVisualizerSettingsDefaults(): VisualizerSettingsSlice {
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

export function createPlaybackDefaults(): PlaybackSlice {
  return {
    currentTick: 0,
    isPlaying: false,
    loopEnabled: false,
    loopEndTick: 0,
    loopStartTick: 0,
  }
}

export function createSelectionDefaults(): SelectionSlice {
  return {
    hoveredNoteId: null,
    selectedNoteIds: new Set<string>(),
  }
}

export function createTrackDefaults(tracks: Track[]): TrackSlice {
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

export function createExportDefaults(): Pick<
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

export function createInitialAppState(): AppState {
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
