/*
INPUT: Captured live-MIDI note data and a user's transcription settings.
OUTPUT: Shared immutable data types for the Transcriptor capture and score-model layers.
PURPOSE: Defines the small, renderer-independent representation used to turn live MIDI input into a reviewable grand-staff score.
*/

export type TranscriptionMeter = '3/4' | '4/4' | '6/8'

export type TranscriptionPhase = 'idle' | 'countdown' | 'preparing' | 'lead-in' | 'finalizing' | 'recording' | 'paused' | 'stopped'
export type Quantization = 'eighth' | 'eighth-triplet' | 'sixteenth' | 'sixteenth-triplet' | 'none'
export type KeySignature = 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#' | 'F' | 'Bb' | 'Eb' | 'Ab' | 'Db' | 'Gb' | 'Am' | 'Em' | 'Bm' | 'F#m' | 'C#m' | 'G#m' | 'D#m' | 'Dm' | 'Gm' | 'Cm' | 'Fm' | 'Bbm' | 'Ebm'

export interface TranscriptionInputEvent {
  readonly type: 'noteon' | 'noteoff' | 'controlchange'
  readonly pitch?: number
  readonly velocity?: number
  readonly controller?: number
  readonly value?: number
  readonly channel: number
  readonly timestampMs: number
  readonly sourceId?: string
}

export interface WebcamOverlay {
  /** Normalized position and size within the score viewport. */
  readonly x: number
  readonly y: number
  readonly width: number
  /** Optional for compatibility with recordings made before free-form camera frames. */
  readonly height?: number
  readonly mirror: boolean
  readonly crop: number
  /** Normalized focal point used when a cropped camera does not match its frame. */
  readonly cropX?: number
  readonly cropY?: number
}

export type TranscriptionMediaKind = 'video' | 'audio'
export type TranscriptionMediaRole = 'face' | 'piano' | 'overhead' | 'microphone' | 'room' | 'other'

export interface TranscriptionMediaSource {
  id: string
  kind: TranscriptionMediaKind
  role: TranscriptionMediaRole
  name: string
  deviceId: string | null
  enabled: boolean
  volume: number
  latencyMs: number
  overlay?: WebcamOverlay
}

export interface CapturedNote {
  readonly id: string
  readonly pitch: number
  readonly velocity: number
  readonly channel: number
  readonly startMs: number
  readonly endMs: number
  readonly keyEndMs?: number
  readonly sourceId?: string
}

export interface TranscriptionSettings {
  readonly bpm: number
  readonly meter: TranscriptionMeter
  readonly chordNamesEnabled: boolean
  readonly keyLabelsEnabled: boolean
  readonly midiDeviceId: string | null
  readonly title?: string
  readonly tempoMode?: 'auto' | 'manual'
  readonly quantization?: Quantization
  readonly keySignature?: KeySignature | 'auto'
  readonly staffSplit?: number
  readonly minimumNoteMs?: number
  readonly chordToleranceMs?: number
  readonly countInBeats?: number
  readonly metronome?: boolean
  readonly webcamEnabled?: boolean
  readonly cameraDeviceId?: string | null
  readonly microphoneEnabled?: boolean
  readonly microphoneDeviceId?: string | null
  readonly webcamOverlay?: WebcamOverlay
  readonly pianoVolume?: number
  readonly microphoneVolume?: number
  readonly exportTiming?: 'original' | 'edited'
  readonly exportAudioMix?: 'synth' | 'recorded' | 'combined'
  readonly liveView?: 'score' | 'fallingKeys'
  readonly mediaSources?: TranscriptionMediaSource[]
}

export interface TranscriptionSession {
  readonly name?: string
  readonly favorite?: boolean
  readonly parentId?: string
  readonly operation?: RecordingOperation
  readonly mediaSegments?: readonly MediaSegment[]
  readonly version: 1
  readonly id: string
  readonly savedAt: number
  readonly settings: TranscriptionSettings
  readonly originalNotes: readonly CapturedNote[]
  readonly editedNotes: readonly CapturedNote[]
  readonly events: readonly TranscriptionInputEvent[]
  readonly durationMs: number
  readonly estimatedBpm: number | null
}

export interface RecordingOperation { kind: 'fresh' | 'continue' | 'replace'; startMs: number; endMs?: number }
export interface TimeRange { startMs: number; endMs: number }
export interface MediaSegment { sourceId: string; inputId?: string; kind?: TranscriptionMediaKind; sourceOffsetMs: number; startMs: number; durationMs: number }
export interface TakeCollection { version: 2; activeTakeId: string | null; takes: readonly TranscriptionSession[] }

export interface QuantizedNote extends CapturedNote {
  readonly startTick: number
  readonly durationTicks: number
  readonly endTick: number
  readonly staff: 'treble' | 'bass'
}

export interface ScoreEvent {
  readonly id: string
  /** Original captured-note ids represented by this chord or note event. */
  readonly sourceIds: readonly string[]
  readonly pitches: readonly number[]
  readonly startTick: number
  readonly durationTicks: number
  readonly isRest: boolean
  readonly tieFromPrevious: boolean
  readonly tieToNext: boolean
}

/** A sequential notation lane. Multiple lanes preserve genuinely overlapping notes. */
export interface ScoreVoice {
  readonly id: string
  readonly events: readonly ScoreEvent[]
}

export interface ScoreChordLabel {
  readonly name: string
  readonly startTick: number
}

export interface ScoreMeasure {
  readonly index: number
  readonly startTick: number
  readonly durationTicks: number
  readonly trebleVoices: readonly ScoreVoice[]
  readonly bassVoices: readonly ScoreVoice[]
  readonly chordLabels: readonly ScoreChordLabel[]
}

export interface ScoreDocument {
  readonly keySignature?: KeySignature
  readonly quantization?: Quantization
  readonly bpm: number
  readonly meter: TranscriptionMeter
  readonly ticksPerBeat: number
  readonly ticksPerMeasure: number
  readonly measures: readonly ScoreMeasure[]
}
