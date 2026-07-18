import type { ProjectData, Track } from '../midi/types'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'

import { StoreError } from './errors'
import type {
  AlignmentPoint,
  AppMode,
  AlignStep,
  CreateNoteColorMode,
  CreateTab,
  LearnNoteColorMode,
  LearnVisuals,
  Piece,
  PieceType,
  RecordModeConfig,
  UISlice,
  VisualizerSettings,
  VisualizerSettingsSlice,
} from './types'

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function normalizeVisualizerAspectRatio(
  aspectRatio: VisualizerSettings['aspectRatio'] | '9:16' | undefined,
): VisualizerSettings['aspectRatio'] | undefined {
  if (aspectRatio == null) {
    return undefined
  }

  return aspectRatio === '9:16' ? 'fit' : aspectRatio
}

export function validateProjectData(
  projectData: ProjectData | null | undefined,
): asserts projectData is ProjectData {
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

export function validateTempoMap(
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

export function validateTracks(tracks: Track[]): void {
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

export function validateTrackId(trackId: string): void {
  if (typeof trackId !== 'string' || trackId.trim().length === 0) {
    throw new StoreError('Track id must be a non-empty string.', 'INVALID_STATE', trackId)
  }
}

export function validatePieceType(type: PieceType): void {
  if (type === 'midi' || type === 'recording') {
    return
  }

  throw new StoreError('Piece type is invalid.', 'INVALID_STATE', type)
}

export function validatePiece(piece: Piece): void {
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

export function validateHexColor(color: string): void {
  if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
    throw new StoreError('Track color must be a valid hex color.', 'INVALID_COLOR', color)
  }
}

export function validateNoteIds(noteIds: string[]): void {
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

export function validateOptionalString(value: string | null, label: string): void {
  if (value !== null && typeof value !== 'string') {
    throw new StoreError(`${label} must be a string or null.`, 'INVALID_STATE', value)
  }
}

export function validateActivePanel(panel: UISlice['activePanel']): void {
  if (panel === null || panel === 'notes' || panel === 'effects' || panel === 'export') {
    return
  }

  throw new StoreError('Active panel is invalid.', 'INVALID_STATE', panel)
}

export function validateAppMode(mode: AppMode): void {
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

export function validateCreateTab(tab: CreateTab): void {
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

export function validateAlignStep(step: AlignStep): void {
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

export function validateAlignmentPoint(
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

export function validateRecordModeConfigPatch(patch: Partial<RecordModeConfig>): void {
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

export function validateLearnNoteColorMode(mode: LearnNoteColorMode): void {
  if (mode === 'white' || mode === 'perHand' || mode === 'custom') {
    return
  }

  throw new StoreError('Learn note color mode is invalid.', 'INVALID_STATE', mode)
}

export function validateCreateNoteColorMode(mode: CreateNoteColorMode): void {
  if (mode === 'single' || mode === 'pitchClass') {
    return
  }

  throw new StoreError('Create note color mode is invalid.', 'INVALID_STATE', mode)
}

export function validateLearnVisuals(visuals: LearnVisuals): void {
  if (visuals == null || typeof visuals !== 'object') {
    throw new StoreError('Learn visuals preset is invalid.', 'INVALID_STATE', visuals)
  }

  validateLearnNoteColorMode(visuals.noteColor)
  validateHexColor(visuals.leftHandColor)
  validateHexColor(visuals.rightHandColor)
  validateFiniteStateNumber(visuals.noteOpacity, 'learnVisuals.noteOpacity')
}

export function validateColorMode(mode: VisualizerSettingsSlice['colorMode']): void {
  if (mode === 'track' || mode === 'pitch' || mode === 'split' || mode === 'velocity') {
    return
  }

  throw new StoreError('Color mode is invalid.', 'INVALID_STATE', mode)
}

export function validateNoteStyle(style: VisualizerSettingsSlice['noteStyle']): void {
  if (style === 'solid' || style === 'gradient' || style === 'saber') {
    return
  }

  throw new StoreError('Note style is invalid.', 'INVALID_STATE', style)
}

export function validateNoteGradientDirection(
  direction: VisualizerSettingsSlice['noteGradientDirection'],
): void {
  if (direction === 'vertical' || direction === 'horizontal') {
    return
  }

  throw new StoreError('Note gradient direction is invalid.', 'INVALID_STATE', direction)
}

export function validateNoteLabelFormat(format: VisualizerSettingsSlice['noteLabelFormat']): void {
  if (format === 'name' || format === 'nameOctave') {
    return
  }

  throw new StoreError('Note label format is invalid.', 'INVALID_STATE', format)
}

export function validatePitchClass(pitchClass: number): void {
  if (Number.isInteger(pitchClass) && pitchClass >= 0 && pitchClass <= 11) {
    return
  }

  throw new StoreError('Pitch class must be an integer between 0 and 11.', 'INVALID_STATE', pitchClass)
}

export function validateFiniteStateNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new StoreError(`${label} must be a finite number.`, 'INVALID_STATE', {
      [label]: value,
    })
  }
}

export function normalizeTick(tick: number): number {
  if (!Number.isFinite(tick)) {
    return 0
  }

  return Math.max(0, Math.floor(tick))
}

export function normalizePositiveFiniteOrFallback(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return value
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
