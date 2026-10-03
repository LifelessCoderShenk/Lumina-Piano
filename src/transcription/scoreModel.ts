/*
INPUT: Completed MIDI captures, BPM, and meter selections.
OUTPUT: Quantized grand-staff measures with rests, ties, and conservative chord labels.
PURPOSE: Converts raw performance timing into a simple, deterministic notation model before SVG engraving.
*/

import type { CapturedNote, QuantizedNote, ScoreChordLabel, ScoreDocument, ScoreEvent, ScoreMeasure, ScoreVoice, TranscriptionMeter, TranscriptionSettings } from './types'
import { detectKeySignature, gridTicks } from './analysis'

export const TICKS_PER_QUARTER = 480
export const SIXTEENTH_TICKS = TICKS_PER_QUARTER / 4
export const GRAND_STAFF_SPLIT_PITCH = 60

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const CHORD_FORMULAS: readonly { readonly suffix: string; readonly intervals: readonly number[] }[] = [
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
]

export function ticksPerMeasure(meter: TranscriptionMeter): number {
  const [beats, denominator] = meter.split('/').map(Number)
  return beats * TICKS_PER_QUARTER * (4 / denominator)
}

export function quantizeCapturedNotes(
  notes: readonly CapturedNote[],
  bpm: number,
  options: Partial<TranscriptionSettings> = {},
): readonly QuantizedNote[] {
  const msPerTick = 60_000 / (Math.max(1, bpm) * TICKS_PER_QUARTER)
  const grid = gridTicks(options.quantization)
  const ordered = [...notes].filter((note) => note.endMs - note.startMs >= (options.minimumNoteMs ?? 0)).sort((a, b) => a.startMs - b.startMs)
  let chordStart = -Infinity
  const pitches = new Set<number>()
  const quantized = ordered.map((note) => {
    if (note.startMs - chordStart > (options.chordToleranceMs ?? 0) || pitches.has(note.pitch)) { chordStart = note.startMs; pitches.clear() }
    pitches.add(note.pitch)
    const startTick = Math.max(0, Math.round(chordStart / msPerTick / grid) * grid)
    const rawDurationTicks = Math.max(grid, Math.round((note.endMs - note.startMs) / msPerTick / grid) * grid)
    return {
      ...note,
      durationTicks: rawDurationTicks,
      endTick: startTick + rawDurationTicks,
      staff: note.pitch >= (options.staffSplit ?? GRAND_STAFF_SPLIT_PITCH) ? 'treble' as const : 'bass' as const,
      startTick,
    }
  }).sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id))
  // Retriggers of the same source and pitch should not create spurious voices.
  const nextByPitch = new Map<string, QuantizedNote>()
  for (let i = quantized.length - 1; i >= 0; i--) {
    const note = quantized[i]
    const key = `${note.sourceId ?? 'midi'}:${note.channel}:${note.pitch}`
    const next = nextByPitch.get(key)
    if (next != null && next.startTick > note.startTick && next.startTick < note.endTick) quantized[i] = { ...note, endTick: next.startTick, durationTicks: next.startTick - note.startTick }
    nextByPitch.set(key, quantized[i])
  }
  return quantized
}

export function detectChordName(pitches: readonly number[]): string | null {
  const pitchClasses = [...new Set(pitches.map((pitch) => ((pitch % 12) + 12) % 12))].sort((left, right) => left - right)
  if (pitchClasses.length < 3 || pitchClasses.length > 4) {
    return null
  }
  for (const root of pitchClasses) {
    const normalized = pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12).sort((left, right) => left - right)
    const match = CHORD_FORMULAS.find((formula) => (
      formula.intervals.length === normalized.length && formula.intervals.every((interval, index) => interval === normalized[index])
    ))
    if (match != null) {
      return `${ROOT_NAMES[root]}${match.suffix}`
    }
  }
  return null
}

export function buildScoreDocument(
  capturedNotes: readonly CapturedNote[],
  options: Pick<TranscriptionSettings, 'bpm' | 'meter'> & Partial<TranscriptionSettings>,
): ScoreDocument {
  const bpm = Math.min(300, Math.max(20, Math.round(options.bpm)))
  const durationTicks = ticksPerMeasure(options.meter)
  const notes = quantizeCapturedNotes(capturedNotes, bpm, options)
  const totalEndTick = notes.reduce((end, note) => Math.max(end, note.endTick), 0)
  const measureCount = Math.max(1, Math.ceil(totalEndTick / durationTicks))
  const measures: ScoreMeasure[] = []

  // Visit only measures a note actually overlaps, instead of rescanning the
  // entire performance for every measure on each live refresh.
  const segmentsByMeasure = new Map<number, MeasureSegment[]>()
  for (const note of notes) {
    const first = Math.floor(note.startTick / durationTicks)
    const last = Math.ceil(note.endTick / durationTicks) - 1
    for (let index = first; index <= last; index += 1) {
      const segments = segmentsByMeasure.get(index) ?? []
      segments.push(...splitNoteForMeasure(note, index * durationTicks, (index + 1) * durationTicks))
      segmentsByMeasure.set(index, segments)
    }
  }
  for (let index = 0; index < measureCount; index += 1) {
    const startTick = index * durationTicks
    const allSegments = segmentsByMeasure.get(index) ?? []
    const trebleSegments = allSegments.filter((segment) => segment.staff === 'treble')
    const bassSegments = allSegments.filter((segment) => segment.staff === 'bass')
    const chordLabels = chordLabelsAtOnsets(allSegments)
    measures.push({
      bassVoices: makeStaffVoices(bassSegments, startTick, durationTicks, 'bass'),
      chordLabels,
      durationTicks,
      index,
      startTick,
      trebleVoices: makeStaffVoices(trebleSegments, startTick, durationTicks, 'treble'),
    })
  }

  return {
    bpm,
    keySignature: options.keySignature == null || options.keySignature === 'auto' ? detectKeySignature(capturedNotes) : options.keySignature,
    quantization: options.quantization ?? 'sixteenth',
    measures,
    meter: options.meter,
    ticksPerBeat: TICKS_PER_QUARTER * (4 / Number(options.meter.split('/')[1])),
    ticksPerMeasure: durationTicks,
  }
}

interface MeasureSegment extends QuantizedNote {
  readonly tieFromPrevious: boolean
  readonly tieToNext: boolean
}

function splitNoteForMeasure(note: QuantizedNote, measureStart: number, measureEnd: number): readonly MeasureSegment[] {
  if (note.endTick <= measureStart || note.startTick >= measureEnd) {
    return []
  }
  const segmentStart = Math.max(note.startTick, measureStart)
  const segmentEnd = Math.min(note.endTick, measureEnd)
  return [{
    ...note,
    durationTicks: segmentEnd - segmentStart,
    endTick: segmentEnd,
    startTick: segmentStart,
    tieFromPrevious: note.startTick < measureStart,
    tieToNext: note.endTick > measureEnd,
  }]
}

/**
 * A chord may be voiced after its root was already held. At every genuine onset,
 * inspect every note still sounding rather than only notes that began together.
 */
function chordLabelsAtOnsets(segments: readonly MeasureSegment[]): readonly ScoreChordLabel[] {
  const onsetTicks = [...new Set(
    segments.filter((segment) => !segment.tieFromPrevious).map((segment) => segment.startTick),
  )].sort((left, right) => left - right)
  const labels: ScoreChordLabel[] = []
  for (const startTick of onsetTicks) {
    const name = detectChordName(
      segments
        .filter((segment) => segment.startTick <= startTick && segment.endTick > startTick)
        .map((segment) => segment.pitch),
    )
    if (name != null) {
      labels.push({ name, startTick })
    }
  }
  return labels
}

interface OnsetGroup {
  readonly startTick: number
  readonly durationTicks: number
  readonly tieFromPrevious: boolean
  readonly tieToNext: boolean
  readonly notes: readonly MeasureSegment[]
}

interface MutableVoice {
  readonly groups: OnsetGroup[]
  endTick: number
}

/**
 * Build independent sequential lanes so a held note and a later note can retain
 * their true simultaneous timing. Every lane is then padded with rests to fill
 * the measure, which makes it safe to give VexFlow a conventional voice.
 */
function makeStaffVoices(
  segments: readonly MeasureSegment[],
  measureStart: number,
  measureDuration: number,
  staff: 'treble' | 'bass',
): readonly ScoreVoice[] {
  const grouped = new Map<string, MeasureSegment[]>()
  for (const segment of segments) {
    const key = [segment.startTick, segment.durationTicks, segment.tieFromPrevious, segment.tieToNext].join(':')
    const atStart = grouped.get(key) ?? []
    atStart.push(segment)
    grouped.set(key, atStart)
  }
  const onsetGroups: OnsetGroup[] = [...grouped.values()]
    .map((notes) => ({
      durationTicks: notes[0].durationTicks,
      notes: [...notes].sort((left, right) => left.pitch - right.pitch || left.id.localeCompare(right.id)),
      startTick: notes[0].startTick,
      tieFromPrevious: notes[0].tieFromPrevious,
      tieToNext: notes[0].tieToNext,
    }))
    .sort((left, right) => left.startTick - right.startTick || left.durationTicks - right.durationTicks)

  const lanes: MutableVoice[] = []
  for (const group of onsetGroups) {
    const lane = lanes.find((candidate) => candidate.endTick <= group.startTick)
      ?? (() => {
        const next: MutableVoice = { endTick: measureStart, groups: [] }
        lanes.push(next)
        return next
      })()
    lane.groups.push(group)
    lane.endTick = Math.max(lane.endTick, group.startTick + group.durationTicks)
  }

  if (lanes.length === 0) {
    return [{ id: `${staff}-rest`, events: [restEvent(measureStart, measureDuration)] }]
  }

  return lanes.map((lane, index) => ({
    events: eventsForLane(lane.groups, measureStart, measureDuration),
    id: `${staff}-${index}`,
  }))
}

function eventsForLane(
  groups: readonly OnsetGroup[],
  measureStart: number,
  measureDuration: number,
): readonly ScoreEvent[] {
  const events: ScoreEvent[] = []
  let cursor = measureStart
  for (const group of groups) {
    if (group.startTick > cursor) {
      events.push(restEvent(cursor, group.startTick - cursor))
    }
    events.push({
      durationTicks: group.durationTicks,
      id: group.notes.map((note) => note.id).join('+'),
      isRest: false,
      pitches: group.notes.map((note) => note.pitch),
      sourceIds: group.notes.map((note) => note.id),
      startTick: group.startTick,
      tieFromPrevious: group.tieFromPrevious,
      tieToNext: group.tieToNext,
    })
    cursor = group.startTick + group.durationTicks
  }
  if (cursor < measureStart + measureDuration) {
    events.push(restEvent(cursor, measureStart + measureDuration - cursor))
  }
  return events
}

function restEvent(startTick: number, durationTicks: number): ScoreEvent {
  return {
    durationTicks,
    id: `rest-${startTick}-${durationTicks}`,
    isRest: true,
    pitches: [],
    sourceIds: [],
    startTick,
    tieFromPrevious: false,
    tieToNext: false,
  }
}
