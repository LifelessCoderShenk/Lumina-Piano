export type PianoHand = 'left' | 'right'
export type PianoFinger = 1 | 2 | 3 | 4 | 5

export interface NoteFingering {
  hand: PianoHand
  finger: PianoFinger
  source: 'generated' | 'manual'
}

export interface Note {
  id: string
  pitch: number
  startTick: number
  endTick: number
  visualEndTick: number
  velocity: number
  fingering?: NoteFingering
}

export interface Track {
  id: string
  name: string
  notes: Note[]
  channel: number
}

export interface TempoEvent {
  tick: number
  bpm: number
  microsecondsPerBeat: number
}

export interface TimeSignatureEvent {
  tick: number
  numerator: number
  denominator: number
}

export interface ProjectData {
  tracks: Track[]
  tempoMap: TempoEvent[]
  timeSignatures: TimeSignatureEvent[]
  totalTicks: number
  ticksPerQuarter: number
}
