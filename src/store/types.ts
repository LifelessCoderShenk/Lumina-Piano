import type { ProjectData, Track } from '../midi/types'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'

export type LearnMode = 'listen' | 'noteByNote' | 'playAlong'
export type LearnHand = 'left' | 'right' | 'both'
export type MidiConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed'
export type AppMode = 'select' | 'create' | 'createCamera' | 'createRecord' | 'learn' | 'learnSong' | 'learnSession' | 'learnEnd'
export type LearnNoteColorMode = 'white' | 'perHand' | 'custom'
export type PieceType = 'midi' | 'recording'
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

export interface LearnSessionConfig {
  mode: LearnMode | null
  hand: LearnHand
  tempoMultiplier: number
}

export interface LearnStats {
  correct: number
  wrong: number
  missed: number
  streak: number
  bestStreak: number
}

export interface MidiDeviceInfo {
  id: string
  name: string
}

export interface LearnV3State {
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

export interface LearnVisuals {
  noteColor: LearnNoteColorMode
  leftHandColor: string
  rightHandColor: string
  noteOpacity: number
  glowEnabled: boolean
  noteLabelsEnabled: boolean
  fingerNumbersEnabled: boolean
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

export type AppStore = AppState & AppActions
