/*
INPUT: Shared domain types from MIDI, tempo, and transcription modules.
OUTPUT: The complete typed Zustand app state and public store action contract.
PURPOSE: Keeps UI modes and their persisted-in-memory settings coherent across Lumina Piano.
*/

import type { ProjectData, Track } from '../midi/types'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import type { CapturedNote, TranscriptionPhase, TranscriptionSettings } from '../transcription/types'

export type AppMode = 'select' | 'create' | 'createCamera' | 'createRecord'
export type RecordModeView = 'video' | 'transcription'
export type CreateNoteColorMode = 'single' | 'pitchClass' | 'gradient' | 'velocity' | 'dynamic' | 'random' | 'tutorial'
export type PieceType = 'midi' | 'musicxml' | 'project' | 'recording'
export type CreateTab = 'pieces' | 'particles' | 'color' | 'camera'
export type AlignStep = 'idle' | 'waiting-low-a' | 'waiting-high-c' | 'complete'

export interface AlignmentPoint {
  x: number
  y: number
}

export interface VisualizerSettings {
  aspectRatio: 'fit' | '16:9' | '9:16' | '1:1' | '4:3'
  resolution: '720p' | '1080p' | '4K'
  framerate: 30 | 60
}

export interface CameraOverlaySettings {
  /** Visualizer placement in preview CSS pixels. */
  offsetX: number
  offsetY: number
  scale: number
  flipHorizontal: boolean
  flipVertical: boolean
  rotation: 0 | 90 | 180 | 270
  /** Crop values are intrinsic camera-source pixels, named after visible edges. */
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

export interface CreateNoteColors {
  mode: CreateNoteColorMode
  singleColor: string
  pitchClassColors: Record<number, string>
  velocityLowColor?: string
  velocityHighColor?: string
}

export interface ParticleSettings {
  enabled: boolean
  style: 'spark' | 'wisp' | 'ray'
  colorMode: 'note' | 'custom'
  customColor: string
  density: number
  size: number
  speed: number
  spread: number
  lifetime: number
  glow: number
}

export interface HandVisualizationSettings {
  enabled: boolean
  opacity: number
}

export interface BackgroundImageTreatment {
  blur: number
  dim: number
  saturation: number
  vignette: number
}

export interface ProjectSlice {
  projectData: ProjectData | null
  precomputedTempoMap: PrecomputedTempoMap | null
  isProjectLoaded: boolean
}

export interface PlaybackSlice {
  currentTick: number
  isPlaying: boolean
  loopEnabled: boolean
  loopStartTick: number
  loopEndTick: number
}

export interface CameraSlice {
  worldZoom: number
  panX: number
  panY: number
  renderScale: number
  viewportWidth: number
  viewportHeight: number
}

export interface SelectionSlice {
  selectedNoteIds: Set<string>
  hoveredNoteId: string | null
}

export interface TrackSlice {
  trackColors: Record<string, string>
  trackMuted: Record<string, boolean>
  trackSoloed: Record<string, boolean>
}

export interface PiecesSlice {
  pieces: Piece[]
  currentPieceId: string | null
  loadPieceError: string | null
}

export interface CreateVisualizerSettingsSlice {
  visualizerSettings: VisualizerSettings
}

export interface CreateNoteColorsSlice {
  createNoteColors: CreateNoteColors
}

export interface ParticleSettingsSlice {
  particleSettings: ParticleSettings
}

export interface HandVisualizationSlice {
  handVisualization: HandVisualizationSettings
}

export interface CameraOverlaySlice {
  cameraOverlay: CameraOverlaySettings
}

export interface AlignmentSlice {
  alignStep: AlignStep
  lowAPoint: AlignmentPoint | null
  highCPoint: AlignmentPoint | null
}

export interface RecordModeSlice {
  recordModeConfig: RecordModeConfig
  recordModeView: RecordModeView
}

export interface TranscriptionSlice {
  transcriptionSettings: TranscriptionSettings
  transcriptionPhase: TranscriptionPhase
  transcriptionNotes: readonly CapturedNote[]
}

export interface UISlice {
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

export interface VisualizerSettingsSlice {
  backgroundImage: string | null
  backgroundImageTreatment: BackgroundImageTreatment
  backgroundStyle: 'flat' | 'studio' | 'aurora' | 'stage'
  colorMode: 'track' | 'pitch' | 'split' | 'velocity'
  pitchClassColors: Record<number, string>
  splitPitch: number
  leftHandColor: string
  rightHandColor: string
  velocityLowColor: string
  velocityHighColor: string
  noteStyle: 'solid' | 'gradient' | 'saber' | 'outline' | 'crystal' | 'gem'
  fallSpeed: number
  noteWidth: number
  noteOpacity: number
  noteGlow: number
  lightingIntensity: number
  keyboardSaber: boolean
  scoreOverlaySize: 'compact' | 'standard' | 'large'
  scoreOverlayOpacity: number
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
  & CreateNoteColorsSlice
  & ParticleSettingsSlice
  & HandVisualizationSlice
  & CameraOverlaySlice
  & AlignmentSlice
  & RecordModeSlice
  & TranscriptionSlice
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
  addPiece(piece: Piece): void
  removePiece(id: string): void
  loadPiece(id: string): Promise<boolean>
  clearLoadPieceError(): void
  clearLoadedPiece(): void
  setVisualizerSettings(patch: Partial<VisualizerSettings>): void
  setCreateNoteColorMode(mode: CreateNoteColorMode): void
  setCreateSingleNoteColor(color: string): void
  setCreatePitchClassColor(pitchClass: number, color: string): void
  setCreatePitchClassColors(colors: Record<number, string>): void
  setCreateVelocityColors(lowColor: string, highColor: string): void
  setParticleSettings(patch: Partial<ParticleSettings>): void
  setParticlePreset(name: import('./particlePresets').ParticlePresetName): void
  resetParticleSettings(): void
  setHandVisualization(patch: Partial<HandVisualizationSettings>): void
  setCameraOverlay(patch: Partial<CameraOverlaySettings>): void
  setAlignStep(step: AlignStep): void
  setLowAPoint(point: AlignmentPoint | null): void
  setHighCPoint(point: AlignmentPoint | null): void
  enterRecordMode(): void
  setRecordModeConfig(patch: Partial<RecordModeConfig>): void
  setRecordModeView(view: RecordModeView): void
  setTranscriptionSettings(patch: Partial<TranscriptionSettings>): void
  setTranscriptionPhase(phase: TranscriptionPhase): void
  setTranscriptionNotes(notes: readonly CapturedNote[]): void
  clearTranscription(): void
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
  setFallSpeed(value: number): void
  setNoteWidth(value: number): void
  setNoteOpacity(value: number): void
  setNoteGlow(value: number): void
  setLightingIntensity(value: number): void
  setKeyboardSaber(value: boolean): void
  setScoreOverlaySize(size: VisualizerSettingsSlice['scoreOverlaySize']): void
  setScoreOverlayOpacity(value: number): void
  setNoteGradientDirection(direction: VisualizerSettingsSlice['noteGradientDirection']): void
  setGradientTopColor(color: string): void
  setGradientBottomColorRight(color: string): void
  setGradientBottomColorLeft(color: string): void
  setGradientBottomColorRightBlack(color: string): void
  setGradientBottomColorLeftBlack(color: string): void
  setBackgroundColor(color: string): void
  setBackgroundImage(image: string | null): void
  setBackgroundImageTreatment(patch: Partial<BackgroundImageTreatment>): void
  setBackgroundStyle(style: VisualizerSettingsSlice['backgroundStyle']): void
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

export type AppStore = AppState & AppActions
