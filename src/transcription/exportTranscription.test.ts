import { Midi } from '@tonejs/midi'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranscriptionMidi, exportTranscription } from './exportTranscription'
import type { CapturedNote, TranscriptionSettings } from './types'

const settings: TranscriptionSettings = { bpm: 150, meter: '6/8', chordNamesEnabled: true, keyLabelsEnabled: true, midiDeviceId: null }
const notes: CapturedNote[] = [
  { id: 'a', pitch: 60, channel: 0, velocity: 100, startMs: 20, endMs: 65 },
  { id: 'b', pitch: 60, channel: 0, velocity: 90, startMs: 80, endMs: 120 },
  { id: 'c', pitch: 48, channel: 1, velocity: 70, startMs: 20, endMs: 600 },
]

afterEach(() => vi.unstubAllGlobals())

describe('transcription export', () => {
  it('round trips fast repeated notes, channels, velocity, tempo and meter without score quantization', () => {
    const midi = new Midi(createTranscriptionMidi(notes, settings))
    expect(midi.header.tempos[0].bpm).toBe(150)
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([6, 8])
    expect(midi.tracks.map((track) => track.channel)).toEqual([0, 1])
    const exported = midi.tracks[0].notes
    expect(exported).toHaveLength(2)
    expect(exported[0].time).toBeCloseTo(0.02, 3)
    expect(exported[0].duration).toBeCloseTo(0.045, 3)
    expect(exported[1].time).toBeCloseTo(0.08, 3)
    expect(exported[0].velocity).toBeCloseTo(100 / 127)
  })

  it('does not write when the save dialog is canceled', async () => {
    const writeFile = vi.fn()
    vi.stubGlobal('electronAPI', { export: {}, showSaveDialog: vi.fn(async () => null) })
    vi.stubGlobal('electronFS', { writeFile })
    expect(await exportTranscription(notes, settings, 'mid')).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('writes a valid MIDI to the selected path and propagates write failures', async () => {
    const writeFile = vi.fn(async (_path: string, _bytes: Uint8Array) => undefined)
    vi.stubGlobal('electronAPI', { export: {}, showSaveDialog: vi.fn(async () => 'performance.mid') })
    vi.stubGlobal('electronFS', { writeFile })
    expect(await exportTranscription(notes, settings, 'mid')).toBe('performance.mid')
    expect(new Midi(writeFile.mock.calls[0][1]).tracks).toHaveLength(2)
    writeFile.mockRejectedValueOnce(new Error('Disk full'))
    await expect(exportTranscription(notes, settings, 'mid')).rejects.toThrow('Disk full')
  })
})
