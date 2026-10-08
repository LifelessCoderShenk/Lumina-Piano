/*
INPUT: Domain type definitions and calibrated visualizer defaults.
OUTPUT: Fresh default state factories used to initialize and reset the application store.
PURPOSE: Centralizes safe defaults for every mode, including the transient Transcriptor session.
*/

import type { Track } from '../midi/types'
import type { TranscriptionSlice } from './types'

import {
  DEFAULT_CREATE_PITCH_CLASS_COLORS,
  DEFAULT_VISUALIZER_BACKGROUND_COLOR,
} from './createNoteColorPalettes'

import type {
  CreateNoteColors,
  ParticleSettings,
  AlignStep,
  AlignmentPoint,
  AppState,
  CameraOverlaySettings,
  HandVisualizationSettings,
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

// Matches the calibrated Prism palette's blue, avoiding excessive emissive
// compensation from the old, comparatively dark default blue.
export const DEFAULT_CREATE_MODE_SINGLE_COLOR = '#4f8ef7'

export const DEFAULT_PITCH_CLASS_COLORS: Record<number, string> = {
  ...DEFAULT_CREATE_PITCH_CLASS_COLORS,
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
  flipHorizontal: false,
  flipVertical: false,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
}

export const handVisualizationInitial: HandVisualizationSettings = {
  enabled: false,
  opacity: 35,
}

export const recordModeConfigInitial: RecordModeConfig = {
  audioSourceDeviceId: null,
  cameraDeviceId: null,
  midiDeviceId: null,
  useMic: false,
  useMidiAudio: true,
}

export function createTranscriptionDefaults(): TranscriptionSlice {
  return {
    transcriptionNotes: [],
    transcriptionPhase: 'idle',
    transcriptionSettings: {
      bpm: 120,
      chordNamesEnabled: true,
      keyLabelsEnabled: false,
      meter: '4/4',
      midiDeviceId: null,
    },
  }
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
    backgroundColor: DEFAULT_VISUALIZER_BACKGROUND_COLOR,
    backgroundImage: null,
    backgroundImageTreatment: {
      blur: 0,
      dim: 20,
      saturation: 100,
      vignette: 20,
    },
    backgroundStyle: 'flat',
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
    noteLabelsOnKeys: false,
    noteLabelsOnNotes: true,
    noteGradientDirection: 'horizontal',
    noteStyle: 'gradient',
    fallSpeed: 100,
    noteWidth: 100,
    noteOpacity: 100,
    noteGlow: 100,
    lightingIntensity: 100,
    keyboardSaber: false,
    scoreOverlaySize: 'standard',
    scoreOverlayOpacity: 100,
    pitchClassColors: { ...DEFAULT_PITCH_CLASS_COLORS },
    rightHandColor: '#9ee65a',
    splitPitch: 60,
    velocityHighColor: '#f7674f',
    velocityLowColor: '#4f8ef7',
  }
}

export function createCreateNoteColorDefaults(): CreateNoteColors {
  return {
    mode: 'single',
    pitchClassColors: { ...DEFAULT_PITCH_CLASS_COLORS },
    singleColor: DEFAULT_CREATE_MODE_SINGLE_COLOR,
    velocityLowColor: '#4b2f83',
    velocityHighColor: '#62e8ff',
  }
}

export function createParticleSettingsDefaults(): ParticleSettings {
  return {
    colorMode: 'note',
    customColor: '#7ec8ff',
    density: 100,
    enabled: true,
    style: 'spark',
    glow: 100,
    lifetime: 100,
    size: 100,
    speed: 100,
    spread: 100,
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
    createNoteColors: createCreateNoteColorDefaults(),
    handVisualization: { ...handVisualizationInitial },
    particleSettings: createParticleSettingsDefaults(),
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
    loopEnabled: false,
    loopEndTick: 0,
    loopStartTick: 0,
    lowAPoint: alignmentInitial.lowAPoint,
    panX: 0,
    panY: 0,
    pieces: [],
    recordModeConfig: { ...recordModeConfigInitial },
    recordModeView: 'video',
    ...createTranscriptionDefaults(),
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
