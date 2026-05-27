import { Buffer } from 'node:buffer'

import { afterEach, describe, expect, it, vi } from 'vitest'

interface MockToneTempo {
  bpm: number
  ticks: number
}

interface MockToneTimeSignature {
  ticks: number
  timeSignature: [number, number]
}

interface MockToneNote {
  durationTicks?: number
  midi: number
  ticks: number
  velocity: number
}

interface MockToneControlChange {
  ticks: number
  value: number
}

interface MockToneTrack {
  channel?: number
  controlChanges?: {
    64?: MockToneControlChange[]
    sustain?: MockToneControlChange[]
    [key: string]: MockToneControlChange[] | undefined
  }
  name?: string
  notes: MockToneNote[]
}

interface MockToneMidi {
  header: {
    ppq: number
    tempos: MockToneTempo[]
    timeSignatures: MockToneTimeSignature[]
  }
  tracks: MockToneTrack[]
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@tonejs/midi')
})

describe('parseMidi', () => {
  describe('happy path', () => {
    it('parses a valid MIDI format 0 file with the correct track count, note count, and PPQ', async () => {
      const { parseMidi } = await loadParser()
      const bytes = buildMidi({
        format: 0,
        ppq: 480,
        tracks: [
          [
            trackName(0, 'Piano'),
            tempo(0, 100),
            timeSignature(0, 4, 4),
            noteOn(0, 0, 60, 100),
            noteOff(480, 0, 60, 0),
            noteOn(0, 0, 64, 110),
            noteOff(240, 0, 64, 0),
            endOfTrack(0),
          ],
        ],
      })

      const project = parseMidi(bytes)

      expect(project.tracks).toHaveLength(1)
      expect(project.tracks[0].notes).toHaveLength(2)
      expect(project.ticksPerQuarter).toBe(480)
      expect(project.tempoMap[0]).toMatchObject({
        bpm: 100,
        microsecondsPerBeat: 600000,
        tick: 0,
      })
      expect(project.timeSignatures[0]).toMatchObject({
        denominator: 4,
        numerator: 4,
        tick: 0,
      })
    })

    it('parses a valid MIDI format 1 file with multiple tracks', async () => {
      const { parseMidi } = await loadParser()
      const bytes = buildMidi({
        format: 1,
        ppq: 480,
        tracks: [
          [
            trackName(0, 'Left'),
            tempo(0, 120),
            noteOn(0, 0, 48, 90),
            noteOff(240, 0, 48, 0),
            endOfTrack(0),
          ],
          [
            trackName(0, 'Right'),
            noteOn(0, 1, 72, 95),
            noteOff(480, 1, 72, 0),
            endOfTrack(0),
          ],
        ],
      })

      const project = parseMidi(bytes)

      expect(project.tracks).toHaveLength(1)
      expect(project.tracks[0].name).toBe('Piano')
      expect(project.tracks[0].notes).toHaveLength(2)
      expect(project.tracks[0].notes.map((note) => note.pitch)).toEqual([48, 72])
    })

    it('merges more than two MIDI tracks into a single Piano display track', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 2,
            controlChanges: {},
            name: 'Low',
            notes: [{ durationTicks: 120, midi: 40, ticks: 0, velocity: 0.6 }],
          },
          {
            channel: 0,
            controlChanges: {},
            name: 'Melody',
            notes: [{ durationTicks: 120, midi: 76, ticks: 120, velocity: 0.7 }],
          },
          {
            channel: 3,
            controlChanges: {},
            name: 'Mid',
            notes: [{ durationTicks: 120, midi: 55, ticks: 240, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks).toHaveLength(1)
      expect(project.tracks[0].name).toBe('Piano')
      expect(project.tracks[0].channel).toBe(0)
      expect(project.tracks[0].notes.map((note) => note.pitch)).toEqual([40, 76, 55])
    })

    it('sorts notes ascending by startTick in the output', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {},
            name: 'Sorted',
            notes: [
              { durationTicks: 120, midi: 64, ticks: 480, velocity: 0.6 },
              { durationTicks: 120, midi: 60, ticks: 120, velocity: 0.5 },
              { durationTicks: 120, midi: 67, ticks: 360, velocity: 0.7 },
            ],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes.map((note) => note.startTick)).toEqual([120, 360, 480])
    })

    it('inserts a default 120 BPM tempo event when the file has no tempo events', async () => {
      const { parseMidi } = await loadParser()
      const bytes = buildMidi({
        format: 0,
        ppq: 480,
        tracks: [[noteOn(0, 0, 60, 100), noteOff(240, 0, 60, 0), endOfTrack(0)]],
      })

      const project = parseMidi(bytes)

      expect(project.tempoMap).toEqual([
        {
          bpm: 120,
          microsecondsPerBeat: 500000,
          tick: 0,
        },
      ])
    })

    it('labels unnamed notes into the Piano display track', async () => {
      const { parseMidi } = await loadParser()
      const bytes = buildMidi({
        format: 0,
        ppq: 480,
        tracks: [[noteOn(0, 0, 60, 100), noteOff(240, 0, 60, 0), endOfTrack(0)]],
      })

      const project = parseMidi(bytes)

      expect(project.tracks[0].name).toBe('Piano')
    })
  })

  describe('normalization', () => {
    it('trims overlapping notes on the same pitch and channel', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 2,
            controlChanges: {},
            name: 'Overlap',
            notes: [
              { durationTicks: 480, midi: 60, ticks: 0, velocity: 0.7 },
              { durationTicks: 480, midi: 60, ticks: 240, velocity: 0.7 },
            ],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].endTick).toBe(240)
      expect(project.tracks[0].notes[0].visualEndTick).toBe(216)
      expect(project.tracks[0].notes[1].endTick).toBe(720)
    })

    it('assigns a default quarter-note duration to zero-length notes', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {},
            name: 'Zero',
            notes: [{ durationTicks: 0, midi: 60, ticks: 120, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].endTick).toBe(600)
    })

    it('corrects notes whose endTick would otherwise be before startTick', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {},
            name: 'Invalid',
            notes: [{ durationTicks: -10, midi: 60, ticks: 100, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].endTick).toBe(580)
    })

    it('clamps negative startTick values to 0', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {},
            name: 'Negative',
            notes: [{ durationTicks: 120, midi: 60, ticks: -25, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].startTick).toBe(0)
      expect(project.tracks[0].notes[0].endTick).toBe(120)
    })

    it('removes exact duplicate notes', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 1,
            controlChanges: {},
            name: 'Duplicates',
            notes: [
              { durationTicks: 240, midi: 60, ticks: 0, velocity: 0.5 },
              { durationTicks: 240, midi: 60, ticks: 0, velocity: 0.6 },
              { durationTicks: 240, midi: 62, ticks: 0, velocity: 0.5 },
            ],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes).toHaveLength(2)
      expect(project.tracks[0].notes.map((note) => note.pitch)).toEqual([60, 62])
    })
  })

  describe('sustain pedal', () => {
    it('extends visualEndTick when a note is released while the pedal is held', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {
              64: [
                { ticks: 100, value: 1 },
                { ticks: 400, value: 0 },
              ],
            },
            name: 'Sustain',
            notes: [{ durationTicks: 200, midi: 60, ticks: 0, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].endTick).toBe(200)
      expect(project.tracks[0].notes[0].visualEndTick).toBe(400)
    })

    it('caps sustained visual length to four times the natural note duration', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {
              64: [
                { ticks: 10, value: 1 },
                { ticks: 2000, value: 0 },
              ],
            },
            name: 'Capped Sustain',
            notes: [{ durationTicks: 100, midi: 60, ticks: 0, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].endTick).toBe(100)
      expect(project.tracks[0].notes[0].visualEndTick).toBe(400)
    })

    it('hard-clamps rapid repeated same-pitch notes so visualEndTick never reaches the next hit', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {
              64: [
                { ticks: 10, value: 1 },
                { ticks: 2000, value: 0 },
              ],
            },
            name: 'Rapid Repeats',
            notes: [
              { durationTicks: 120, midi: 60, ticks: 0, velocity: 0.5 },
              { durationTicks: 120, midi: 60, ticks: 180, velocity: 0.5 },
              { durationTicks: 120, midi: 60, ticks: 360, velocity: 0.5 },
            ],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)
      const notes = project.tracks[0].notes

      expect(notes[0].visualEndTick).toBeLessThan(notes[1].startTick)
      expect(notes[1].visualEndTick).toBeLessThan(notes[2].startTick)
    })

    it('keeps visualEndTick equal to endTick when the note ends after pedal release', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {
              64: [
                { ticks: 100, value: 1 },
                { ticks: 200, value: 0 },
              ],
            },
            name: 'Released',
            notes: [{ durationTicks: 300, midi: 60, ticks: 0, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].visualEndTick).toBe(300)
    })

    it('handles multiple pedal presses and releases independently', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {
              64: [
                { ticks: 100, value: 1 },
                { ticks: 200, value: 0 },
                { ticks: 300, value: 1 },
                { ticks: 500, value: 0 },
              ],
            },
            name: 'Multi',
            notes: [
              { durationTicks: 150, midi: 60, ticks: 0, velocity: 0.5 },
              { durationTicks: 150, midi: 62, ticks: 250, velocity: 0.5 },
              { durationTicks: 100, midi: 64, ticks: 500, velocity: 0.5 },
            ],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes.map((note) => note.visualEndTick)).toEqual([200, 500, 600])
    })

    it('leaves visualEndTick equal to endTick when no CC64 events exist', async () => {
      const { parseMidi } = await loadParserWithMock({
        header: {
          ppq: 480,
          tempos: [],
          timeSignatures: [],
        },
        tracks: [
          {
            channel: 0,
            controlChanges: {},
            name: 'No CC',
            notes: [{ durationTicks: 240, midi: 60, ticks: 0, velocity: 0.5 }],
          },
        ],
      })

      const project = parseMidi(VALID_MIDI_BYTES)

      expect(project.tracks[0].notes[0].visualEndTick).toBe(project.tracks[0].notes[0].endTick)
    })
  })

  describe('error cases', () => {
    it('throws EMPTY_FILE for null input', async () => {
      const { MidiParseError, parseMidi } = await loadParser()

      expectMidiParseError(
        () => parseMidi(null as unknown as Uint8Array),
        MidiParseError,
        'EMPTY_FILE',
      )
    })

    it('throws EMPTY_FILE for an empty Uint8Array', async () => {
      const { MidiParseError, parseMidi } = await loadParser()

      expectMidiParseError(() => parseMidi(new Uint8Array()), MidiParseError, 'EMPTY_FILE')
    })

    it('throws INVALID_FILE for random non-MIDI bytes', async () => {
      const { MidiParseError, parseMidi } = await loadParser()

      expectMidiParseError(
        () => parseMidi(Uint8Array.from([0x01, 0x02, 0x03, 0x04])),
        MidiParseError,
        'INVALID_FILE',
      )
    })

    it('throws UNSUPPORTED_FORMAT for MIDI format 2 files', async () => {
      const { MidiParseError, parseMidi } = await loadParser()
      const bytes = buildMidi({
        format: 2,
        ppq: 480,
        tracks: [[endOfTrack(0)]],
      })

      expectMidiParseError(() => parseMidi(bytes), MidiParseError, 'UNSUPPORTED_FORMAT')
    })

    it('throws CORRUPT_DATA when the MIDI parser library fails', async () => {
      const { MidiParseError, parseMidi } = await loadParserWithThrowingMock(new Error('boom'))

      expectMidiParseError(() => parseMidi(VALID_MIDI_BYTES), MidiParseError, 'CORRUPT_DATA')
    })
  })
})

async function loadParser() {
  vi.resetModules()
  vi.doUnmock('@tonejs/midi')
  return import('./parser')
}

async function loadParserWithMock(mockMidi: MockToneMidi) {
  vi.resetModules()
  vi.doMock('@tonejs/midi', () => ({
    Midi: class MockMidi {
      header = mockMidi.header
      tracks = mockMidi.tracks

      constructor(_bytes: Uint8Array) {}
    },
  }))

  return import('./parser')
}

async function loadParserWithThrowingMock(error: Error) {
  vi.resetModules()
  vi.doMock('@tonejs/midi', () => ({
    Midi: class MockMidi {
      constructor(_bytes: Uint8Array) {
        throw error
      }
    },
  }))

  return import('./parser')
}

function expectMidiParseError(
  callback: () => unknown,
  ErrorType: typeof import('./errors').MidiParseError,
  code: 'INVALID_FILE' | 'EMPTY_FILE' | 'CORRUPT_DATA' | 'UNSUPPORTED_FORMAT',
): void {
  try {
    callback()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ErrorType)
    expect((error as InstanceType<typeof ErrorType>).code).toBe(code)
    return
  }

  throw new Error('Expected parseMidi to throw a MidiParseError.')
}

const VALID_MIDI_BYTES = buildMidi({
  format: 0,
  ppq: 480,
  tracks: [[endOfTrack(0)]],
})

function buildMidi(options: {
  format: number
  ppq: number
  tracks: number[][][]
}): Uint8Array {
  const header = [
    ...ascii('MThd'),
    ...u32(6),
    ...u16(options.format),
    ...u16(options.tracks.length),
    ...u16(options.ppq),
  ]

  const trackChunks = options.tracks.flatMap((trackEvents) => {
    const body = trackEvents.flat()
    return [...ascii('MTrk'), ...u32(body.length), ...body]
  })

  return Uint8Array.from([...header, ...trackChunks])
}

function noteOn(delta: number, channel: number, note: number, velocity: number): number[] {
  return [...varLen(delta), 0x90 | channel, note, velocity]
}

function noteOff(delta: number, channel: number, note: number, velocity: number): number[] {
  return [...varLen(delta), 0x80 | channel, note, velocity]
}

function trackName(delta: number, name: string): number[] {
  const bytes = ascii(name)
  return [...varLen(delta), 0xff, 0x03, ...varLen(bytes.length), ...bytes]
}

function tempo(delta: number, bpm: number): number[] {
  const microsecondsPerBeat = Math.round(60_000_000 / bpm)
  return [
    ...varLen(delta),
    0xff,
    0x51,
    0x03,
    (microsecondsPerBeat >> 16) & 0xff,
    (microsecondsPerBeat >> 8) & 0xff,
    microsecondsPerBeat & 0xff,
  ]
}

function timeSignature(delta: number, numerator: number, denominator: number): number[] {
  return [
    ...varLen(delta),
    0xff,
    0x58,
    0x04,
    numerator & 0xff,
    Math.round(Math.log2(denominator)) & 0xff,
    24,
    8,
  ]
}

function endOfTrack(delta: number): number[] {
  return [...varLen(delta), 0xff, 0x2f, 0x00]
}

function varLen(value: number): number[] {
  let remaining = value >>> 0
  const bytes = [remaining & 0x7f]

  while ((remaining >>= 7) > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80)
  }

  return bytes
}

function ascii(value: string): number[] {
  return [...Buffer.from(value, 'ascii')]
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff]
}

function u32(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ]
}
