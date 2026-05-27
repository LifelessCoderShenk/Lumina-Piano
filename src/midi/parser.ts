import { Midi } from '@tonejs/midi'

import { MidiParseError } from './errors'
import type {
  Note,
  ProjectData,
  TempoEvent,
  TimeSignatureEvent,
  Track,
} from './types'

interface ToneTempoLike {
  bpm: number
  ticks: number
}

interface ToneTimeSignatureLike {
  ticks: number
  timeSignature: number[]
}

interface ToneNoteLike {
  durationTicks?: number
  midi: number
  ticks: number
  velocity: number
}

interface ToneControlChangeLike {
  ticks: number
  value: number
}

interface ToneTrackLike {
  channel?: number
  controlChanges?: {
    64?: ToneControlChangeLike[]
    sustain?: ToneControlChangeLike[]
    [key: string]: ToneControlChangeLike[] | undefined
  }
  name?: string
  notes: ToneNoteLike[]
}

interface ToneMidiLike {
  header: {
    ppq: number
    tempos: ToneTempoLike[]
    timeSignatures: ToneTimeSignatureLike[]
  }
  tracks: ToneTrackLike[]
}

interface NormalizedNoteSeed {
  channel: number
  endTick: number
  pitch: number
  sequence: number
  startTick: number
  trackIndex: number
  velocity: number
  visualEndTick: number
}

interface NormalizedTrackSeed {
  channel: number
  name: string
  notes: NormalizedNoteSeed[]
}

interface SustainEvent {
  channel: number
  isPedalDown: boolean
  sequence: number
  tick: number
}

interface SustainInterval {
  releaseTick: number
  startTick: number
}

const MIDI_HEADER = [0x4d, 0x54, 0x68, 0x64] as const
const DEFAULT_BPM = 120
const MAX_VISUAL_SUSTAIN_MULTIPLIER = 4
const MAX_REPEAT_NOTE_GAP_TICKS = 120
const REPEAT_NOTE_GAP_RATIO = 0.1

export function parseMidi(bytes: Uint8Array | ArrayBuffer): ProjectData {
  const normalizedBytes = normalizeInputBytes(bytes)
  validateMidiHeader(normalizedBytes)
  validateSupportedFormat(normalizedBytes)

  let parsedMidi: ToneMidiLike

  try {
    parsedMidi = new Midi(normalizedBytes) as unknown as ToneMidiLike
  } catch (error: unknown) {
    throw new MidiParseError('Failed to parse MIDI data.', 'CORRUPT_DATA', error)
  }

  const ticksPerQuarter = normalizePositiveInteger(parsedMidi.header.ppq, 480)
  const trackSeeds = createTrackSeeds(parsedMidi.tracks, ticksPerQuarter)
  const normalizedTracks = normalizeTracks(trackSeeds, parsedMidi.tracks, ticksPerQuarter)
  const tempoMap = createTempoMap(parsedMidi.header.tempos)
  const timeSignatures = createTimeSignatureMap(parsedMidi.header.timeSignatures)
  const tracks = sanitizeDisplayTracks(mergeTracksForDisplay(finalizeTracks(normalizedTracks)))
  const totalTicks = tracks.reduce((maxTick, track) => {
    const trackMax = track.notes.reduce(
      (noteMax, note) => Math.max(noteMax, note.visualEndTick),
      0,
    )
    return Math.max(maxTick, trackMax)
  }, 0)

  return {
    tracks,
    tempoMap,
    timeSignatures,
    totalTicks,
    ticksPerQuarter,
  }
}

function normalizeInputBytes(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  if (bytes == null) {
    throw new MidiParseError('MIDI input is empty.', 'EMPTY_FILE')
  }

  const normalized =
    bytes instanceof Uint8Array
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : null

  if (normalized == null || normalized.byteLength === 0) {
    throw new MidiParseError('MIDI input is empty.', 'EMPTY_FILE')
  }

  return normalized
}

function validateMidiHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < MIDI_HEADER.length) {
    throw new MidiParseError('MIDI header is missing.', 'INVALID_FILE')
  }

  for (let index = 0; index < MIDI_HEADER.length; index += 1) {
    if (bytes[index] !== MIDI_HEADER[index]) {
      throw new MidiParseError('Input does not contain a valid MIDI header.', 'INVALID_FILE')
    }
  }
}

function validateSupportedFormat(bytes: Uint8Array): void {
  if (bytes.byteLength < 10) {
    return
  }

  const format = readUint16BigEndian(bytes, 8)
  if (format === 2) {
    throw new MidiParseError('MIDI format 2 is not supported.', 'UNSUPPORTED_FORMAT', {
      format,
    })
  }
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function createTrackSeeds(tracks: ToneTrackLike[], ticksPerQuarter: number): NormalizedTrackSeed[] {
  let sequence = 0

  return tracks.map((track, trackIndex) => {
    const channel = normalizeChannel(track.channel)
    const name = normalizeTrackName(track.name, trackIndex)
    const notes = track.notes.map((note) => {
      const pitch = clampInteger(note.midi, 0, 127)
      const startTick = Math.max(0, normalizeInteger(note.ticks, 0))
      const rawEndTick =
        startTick +
        (Number.isFinite(note.durationTicks) ? normalizeInteger(note.durationTicks ?? 0, 0) : 0)
      const endTick = normalizeEndTick(startTick, rawEndTick, ticksPerQuarter)
      const velocity = normalizeVelocity(note.velocity)

      const seed: NormalizedNoteSeed = {
        channel,
        endTick,
        pitch,
        sequence,
        startTick,
        trackIndex,
        velocity,
        visualEndTick: endTick,
      }

      sequence += 1
      return seed
    })

    return {
      channel,
      name,
      notes,
    }
  })
}

function normalizeTracks(
  trackSeeds: NormalizedTrackSeed[],
  rawTracks: ToneTrackLike[],
  ticksPerQuarter: number,
): NormalizedTrackSeed[] {
  const deduplicatedNotes = removeDuplicateNotes(trackSeeds)
  trimOverlappingNotes(deduplicatedNotes, ticksPerQuarter)
  applySustainPedal(deduplicatedNotes, rawTracks)

  return trackSeeds.map((track, trackIndex) => {
    const notes = deduplicatedNotes
      .filter((note) => note.trackIndex === trackIndex)
      .sort(compareNotesByStartTick)

    return {
      channel: track.channel,
      name: track.name,
      notes,
    }
  })
}

function removeDuplicateNotes(trackSeeds: NormalizedTrackSeed[]): NormalizedNoteSeed[] {
  const seen = new Set<string>()
  const result: NormalizedNoteSeed[] = []

  for (const track of trackSeeds) {
    for (const note of track.notes) {
      const key = [note.channel, note.pitch, note.startTick, note.endTick].join(':')
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      result.push(note)
    }
  }

  return result
}

function trimOverlappingNotes(notes: NormalizedNoteSeed[], ticksPerQuarter: number): void {
  const notesByChannelAndPitch = new Map<string, NormalizedNoteSeed[]>()

  for (const note of notes) {
    const key = `${note.channel}:${note.pitch}`
    const groupedNotes = notesByChannelAndPitch.get(key)

    if (groupedNotes == null) {
      notesByChannelAndPitch.set(key, [note])
      continue
    }

    groupedNotes.push(note)
  }

  for (const groupedNotes of notesByChannelAndPitch.values()) {
    groupedNotes.sort(compareNotesByStartTick)

    for (let index = 0; index < groupedNotes.length - 1; index += 1) {
      const current = groupedNotes[index]
      const next = groupedNotes[index + 1]

      if (current.endTick > next.startTick) {
        current.endTick = normalizeEndTick(current.startTick, next.startTick, ticksPerQuarter)
        current.visualEndTick = current.endTick
      }
    }
  }
}

function applySustainPedal(notes: NormalizedNoteSeed[], rawTracks: ToneTrackLike[]): void {
  const sustainEvents = collectSustainEvents(rawTracks)
  if (sustainEvents.length === 0) {
    for (const note of notes) {
      note.visualEndTick = note.endTick
    }
    return
  }

  const intervalsByChannel = buildSustainIntervals(sustainEvents, notes)

  for (const note of notes) {
    const intervals = intervalsByChannel.get(note.channel) ?? []
    let visualEndTick = note.endTick

    for (const interval of intervals) {
      if (note.endTick >= interval.startTick && note.endTick < interval.releaseTick) {
        visualEndTick = Math.max(visualEndTick, interval.releaseTick)
        break
      }
    }

    const naturalDurationTicks = Math.max(1, note.endTick - note.startTick)
    const maxVisualEndTick = note.startTick + (naturalDurationTicks * MAX_VISUAL_SUSTAIN_MULTIPLIER)
    note.visualEndTick = Math.min(visualEndTick, maxVisualEndTick)
  }
}

function collectSustainEvents(rawTracks: ToneTrackLike[]): SustainEvent[] {
  const sustainEvents: SustainEvent[] = []
  let sequence = 0

  rawTracks.forEach((track) => {
    const channel = normalizeChannel(track.channel)
    const controlChanges = track.controlChanges
    const sustainEventsForTrack = controlChanges?.[64] ?? controlChanges?.sustain ?? []

    for (const event of sustainEventsForTrack) {
      const value = normalizeControllerValue(event.value)
      sustainEvents.push({
        channel,
        isPedalDown: value >= 64,
        sequence,
        tick: Math.max(0, normalizeInteger(event.ticks, 0)),
      })
      sequence += 1
    }
  })

  return sustainEvents.sort((left, right) => {
    if (left.channel !== right.channel) {
      return left.channel - right.channel
    }

    if (left.tick !== right.tick) {
      return left.tick - right.tick
    }

    return left.sequence - right.sequence
  })
}

function buildSustainIntervals(
  sustainEvents: SustainEvent[],
  notes: NormalizedNoteSeed[],
): Map<number, SustainInterval[]> {
  const channelTickCeilings = new Map<number, number>()

  for (const note of notes) {
    const currentMax = channelTickCeilings.get(note.channel) ?? 0
    channelTickCeilings.set(note.channel, Math.max(currentMax, note.endTick))
  }

  for (const event of sustainEvents) {
    const currentMax = channelTickCeilings.get(event.channel) ?? 0
    channelTickCeilings.set(event.channel, Math.max(currentMax, event.tick))
  }

  const eventsByChannel = new Map<number, SustainEvent[]>()
  for (const event of sustainEvents) {
    const channelEvents = eventsByChannel.get(event.channel)
    if (channelEvents == null) {
      eventsByChannel.set(event.channel, [event])
      continue
    }

    channelEvents.push(event)
  }

  const intervalsByChannel = new Map<number, SustainInterval[]>()

  for (const [channel, channelEvents] of eventsByChannel.entries()) {
    const intervals: SustainInterval[] = []
    let pedalDownTick: number | null = null

    for (const event of channelEvents) {
      if (event.isPedalDown) {
        if (pedalDownTick == null) {
          pedalDownTick = event.tick
        }
        continue
      }

      if (pedalDownTick != null) {
        intervals.push({
          releaseTick: event.tick,
          startTick: pedalDownTick,
        })
        pedalDownTick = null
      }
    }

    if (pedalDownTick != null) {
      const releaseTick = channelTickCeilings.get(channel) ?? pedalDownTick
      intervals.push({
        releaseTick,
        startTick: pedalDownTick,
      })
    }

    intervalsByChannel.set(channel, intervals)
  }

  return intervalsByChannel
}

function createTempoMap(tempos: ToneTempoLike[]): TempoEvent[] {
  const normalizedTempos = tempos
    .map((tempo) => ({
      bpm: normalizeBpm(tempo.bpm),
      tick: Math.max(0, normalizeInteger(tempo.ticks, 0)),
    }))
    .sort((left, right) => left.tick - right.tick)

  if (normalizedTempos.length === 0 || normalizedTempos[0].tick > 0) {
    normalizedTempos.unshift({
      bpm: DEFAULT_BPM,
      tick: 0,
    })
  }

  return normalizedTempos.map((tempo) => ({
    bpm: tempo.bpm,
    microsecondsPerBeat: Math.round(60_000_000 / tempo.bpm),
    tick: tempo.tick,
  }))
}

function createTimeSignatureMap(timeSignatures: ToneTimeSignatureLike[]): TimeSignatureEvent[] {
  return timeSignatures
    .map((timeSignature) => {
      const numerator = normalizePositiveInteger(timeSignature.timeSignature[0], 4)
      const denominator = normalizePositiveInteger(timeSignature.timeSignature[1], 4)

      return {
        denominator,
        numerator,
        tick: Math.max(0, normalizeInteger(timeSignature.ticks, 0)),
      }
    })
    .sort((left, right) => left.tick - right.tick)
}

function finalizeTracks(trackSeeds: NormalizedTrackSeed[]): Track[] {
  return trackSeeds.map((track) => ({
    channel: track.channel,
    id: globalThis.crypto.randomUUID(),
    name: track.name,
    notes: track.notes.map((note): Note => ({
      endTick: note.endTick,
      id: globalThis.crypto.randomUUID(),
      pitch: note.pitch,
      startTick: note.startTick,
      velocity: note.velocity,
      visualEndTick: note.visualEndTick,
    })),
  }))
}

function mergeTracksForDisplay(tracks: Track[]): Track[] {
  const allNotes = tracks
    .flatMap((track) => track.notes)
    .slice()
    .sort(compareFinalizedNotes)

  if (allNotes.length === 0) {
    return []
  }

  return [
    {
      channel: 0,
      id: globalThis.crypto.randomUUID(),
      name: 'Piano',
      notes: allNotes,
    },
  ]
}

function sanitizeDisplayTracks(tracks: Track[]): Track[] {
  return tracks
    .map((track) => ({
      ...track,
      notes: clampRepeatedPitchVisualEnds([...track.notes]).filter(isRenderableDisplayNote),
    }))
    .filter((track) => track.notes.length > 0)
}

function clampRepeatedPitchVisualEnds(notes: Note[]): Note[] {
  const notesByPitch = new Map<number, Note[]>()

  for (const note of notes) {
    const groupedNotes = notesByPitch.get(note.pitch)
    if (groupedNotes == null) {
      notesByPitch.set(note.pitch, [note])
      continue
    }

    groupedNotes.push(note)
  }

  for (const groupedNotes of notesByPitch.values()) {
    groupedNotes.sort(compareFinalizedNotes)

    for (let index = 0; index < groupedNotes.length - 1; index += 1) {
      const currentNote = groupedNotes[index]
      const nextNote = groupedNotes[index + 1]
      const gapTicks = nextNote.startTick - currentNote.startTick
      const minGapTicks = Math.min(gapTicks * REPEAT_NOTE_GAP_RATIO, MAX_REPEAT_NOTE_GAP_TICKS)
      const clampedVisualEndTick = nextNote.startTick - minGapTicks

      currentNote.visualEndTick = Math.min(currentNote.visualEndTick, clampedVisualEndTick)
    }
  }

  return notes.sort(compareFinalizedNotes)
}

function isRenderableDisplayNote(note: Note): boolean {
  const naturalDurationTicks = note.endTick - note.startTick

  return (
    Number.isFinite(note.startTick) &&
    Number.isFinite(naturalDurationTicks) &&
    Number.isFinite(note.visualEndTick) &&
    naturalDurationTicks > 0
  )
}

function compareFinalizedNotes(left: Note, right: Note): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick
  }

  if (left.endTick !== right.endTick) {
    return left.endTick - right.endTick
  }

  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch
  }

  return left.id.localeCompare(right.id)
}

function compareNotesByStartTick(left: NormalizedNoteSeed, right: NormalizedNoteSeed): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick
  }

  if (left.endTick !== right.endTick) {
    return left.endTick - right.endTick
  }

  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch
  }

  return left.sequence - right.sequence
}

function normalizeTrackName(name: string | undefined, trackIndex: number): string {
  const normalized = name?.trim()
  return normalized != null && normalized.length > 0 ? normalized : `Track ${trackIndex + 1}`
}

function normalizeChannel(channel: number | undefined): number {
  return clampInteger(channel ?? 0, 0, 15)
}

function normalizeVelocity(value: number): number {
  const scaled = value <= 1 ? value * 127 : value
  return clampInteger(scaled, 0, 127)
}

function normalizeControllerValue(value: number): number {
  const scaled = value <= 1 ? value * 127 : value
  return clampInteger(scaled, 0, 127)
}

function normalizeBpm(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_BPM
  }

  return value
}

function normalizeEndTick(startTick: number, endTick: number, ticksPerQuarter: number): number {
  if (!Number.isFinite(endTick) || endTick <= startTick) {
    return startTick + ticksPerQuarter
  }

  return normalizeInteger(endTick, startTick + ticksPerQuarter)
}

function normalizeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.round(value)
}

function normalizePositiveInteger(value: number, fallback: number): number {
  const normalized = normalizeInteger(value, fallback)
  return normalized > 0 ? normalized : fallback
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, normalizeInteger(value, min)))
}

export type { ProjectData, Track, Note, TempoEvent, TimeSignatureEvent }
export { MidiParseError }
