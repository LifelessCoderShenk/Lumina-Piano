export interface Note {
  id: string
  pitch: number
  startTick: number
  endTick: number
  visualEndTick: number
  velocity: number
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
