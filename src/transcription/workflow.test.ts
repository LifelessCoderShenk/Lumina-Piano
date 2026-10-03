import { beforeEach, describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { LiveTranscriptionCapture } from './capture'
import { detectKeySignature, estimateTempo, requantizeNotes, spellPitch } from './analysis'
import { buildScoreDocument, quantizeCapturedNotes } from './scoreModel'
import { defaultVideoOverlay, normalizeTranscriptionSettings } from './settings'
import { createSession, moveHistory, pushEdit, readSession, saveSession, SESSION_STORAGE_KEY } from './session'
import { createTranscriptionMidi, exportFileName } from './exportTranscription'
import { videoFfmpegArgs, webcamVideoBounds } from './videoExport'
import { assembleTake } from './takes'
import type { CapturedNote, Quantization, TranscriptionInputEvent } from './types'

const settings = normalizeTranscriptionSettings({ bpm: 120, meter: '4/4', midiDeviceId: null, chordNamesEnabled: true, keyLabelsEnabled: false })
const note = (id: string, pitch: number, startMs: number, endMs: number): CapturedNote => ({ id, pitch, startMs, endMs, velocity: 100, channel: 0, sourceId: 'midi' })
function send(capture: LiveTranscriptionCapture, type: TranscriptionInputEvent['type'], timestampMs: number, fields: Partial<TranscriptionInputEvent> = {}) {
  capture.receive({ type, timestampMs, channel: 0, sourceId: 'midi', pitch: 60, velocity: type === 'noteon' ? 100 : 0, ...fields })
}

describe('performance capture and recovery', () => {
  beforeEach(() => localStorage.clear())
  it('keeps physical key release separately from pedal release and terminates a restruck tail', () => {
    const capture = new LiveTranscriptionCapture(); capture.start(1000)
    send(capture, 'controlchange', 1000, { controller: 64, value: 127 })
    send(capture, 'noteon', 1010); send(capture, 'noteoff', 1100)
    expect(capture.preview(1200)[0]).toMatchObject({ startMs: 10, keyEndMs: 100, endMs: 200 })
    send(capture, 'noteon', 1250); send(capture, 'noteoff', 1300)
    send(capture, 'controlchange', 1400, { controller: 64, value: 0 })
    expect(capture.stop(1500)).toMatchObject([{ endMs: 250, keyEndMs: 100 }, { startMs: 250, endMs: 400, keyEndMs: 300 }])
    expect(capture.sustainDown).toBe(false)
  })
  it('isolates overlapping mouse and MIDI pitches and closes only a disconnected source', () => {
    const capture = new LiveTranscriptionCapture(); capture.start(0)
    send(capture, 'noteon', 10); send(capture, 'noteon', 20, { sourceId: 'pointer' })
    capture.closeHeld(100, 'midi')
    expect(capture.activeNoteCount).toBe(1)
    send(capture, 'noteoff', 220, { sourceId: 'pointer' })
    expect(capture.stop(250).map((n) => [n.sourceId, n.endMs])).toEqual([['midi', 100], ['pointer', 220]])
  })
  it('excludes pauses, ignores paused input, and synthesizes safety releases', () => {
    const capture = new LiveTranscriptionCapture(); capture.start(1000)
    send(capture, 'noteon', 1100); capture.pause(1500)
    send(capture, 'noteon', 1800); capture.resume(5500)
    send(capture, 'noteon', 5600); capture.stop(5700)
    expect(capture.notes()).toMatchObject([{ startMs: 100, endMs: 500 }, { startMs: 600, endMs: 700 }])
    expect(capture.elapsed(9000)).toBe(700)
    expect(capture.events().filter((e) => e.type === 'noteoff').map((e) => e.timestampMs)).toEqual([500, 700])
  })
  it('recovers original and edited timings independently and rejects corrupt sessions', () => {
    const original = [note('a', 60, 33, 344)]
    const session = { ...createSession(settings, original), editedNotes: [note('a', 62, 0, 500)] }
    expect(saveSession(session)).toBeNull()
    expect(readSession()?.originalNotes).toEqual(original)
    expect(readSession()?.editedNotes[0].pitch).toBe(62)
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, editedNotes: [{ ...original[0], endMs: -1 }] }))
    expect(readSession()).toBeNull()
  })
  it('undoes and redoes note and notation edits without altering original performance', () => {
    const original = [note('a', 60, 33, 344)]
    const initial = { past: [], present: { notes: original, settings }, future: [] }
    const edited = pushEdit(initial, { notes: [note('a', 64, 0, 500)], settings: { ...settings, bpm: 90 } })
    const undone = moveHistory(edited, 'undo')
    expect(undone.present).toEqual(initial.present)
    expect(moveHistory(undone, 'redo').present).toEqual(edited.present)
    expect(original[0].startMs).toBe(33)
  })
  it('splices every camera and audio segment together during a punch-in', () => {
    const parent = {
      ...createSession(settings), durationMs: 4000,
      mediaSegments: [
        { sourceId: 'old-camera', inputId: 'camera', kind: 'video' as const, sourceOffsetMs: 0, startMs: 0, durationMs: 4000 },
        { sourceId: 'old-audio', inputId: 'audio', kind: 'audio' as const, sourceOffsetMs: 0, startMs: 0, durationMs: 4000 },
      ],
    }
    const next = assembleTake(parent, [], [], 1000, settings, 'replacement', 'Take 2', { kind: 'replace', startMs: 1000, endMs: 2000 }, [
      { sourceId: 'new-camera', inputId: 'camera', kind: 'video', sourceOffsetMs: 0, startMs: 1000, durationMs: 1000 },
      { sourceId: 'new-audio', inputId: 'audio', kind: 'audio', sourceOffsetMs: 0, startMs: 1000, durationMs: 1000 },
    ])
    expect(next.mediaSegments).toHaveLength(6)
    expect(next.mediaSegments?.filter((segment) => segment.startMs === 1000).map((segment) => segment.sourceId)).toEqual(['new-camera', 'new-audio'])
    expect(next.mediaSegments?.filter((segment) => segment.startMs === 2000).map((segment) => segment.sourceOffsetMs)).toEqual([2000, 2000])
  })
})

describe('notation and exports', () => {
  it.each<[Quantization, number]>([['eighth', 250], ['eighth-triplet', 500 / 3], ['sixteenth', 125], ['sixteenth-triplet', 250 / 3]])('quantizes %s while preserving original notes', (quantization, grid) => {
    const original = [note('a', 60, grid * 1.15, grid * 2.1)]
    const edited = requantizeNotes(original, { ...settings, quantization })
    expect(edited[0].startMs).toBeCloseTo(grid)
    expect(edited[0].endMs).toBeCloseTo(grid * 2)
    expect(original[0].startMs).toBe(grid * 1.15)
    expect(buildScoreDocument(edited, { ...settings, quantization }).measures.length).toBeGreaterThan(0)
  })
  it('does not quantize unquantized MIDI or original performance', () => {
    const original = [note('a', 60, 33, 344)]
    expect(requantizeNotes(original, { ...settings, quantization: 'none' })).toEqual(original)
    const midi = new Midi(createTranscriptionMidi(original, { ...settings, quantization: 'eighth' }))
    expect(midi.tracks[0].notes[0].time).toBeCloseTo(.033, 2)
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo(.311, 2)
  })
  it('exports original CC64 and key-up timing on source-isolated MIDI tracks', () => {
    const original = [{ ...note('a', 60, 0, 900), keyEndMs: 100 }, { ...note('b', 60, 10, 200), sourceId: 'pointer' }]
    const midi = new Midi(createTranscriptionMidi(original, settings, [
      { type: 'controlchange', channel: 0, sourceId: 'midi', timestampMs: 0, controller: 64, value: 127 },
      { type: 'controlchange', channel: 0, sourceId: 'midi', timestampMs: 900, controller: 64, value: 0 },
    ]))
    expect(midi.tracks).toHaveLength(2)
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo(.1, 2)
    expect(midi.tracks[0].controlChanges[64]).toHaveLength(2)
    expect(midi.tracks[0].channel).not.toBe(midi.tracks[1].channel)
    expect(midi.tracks[1].controlChanges[64] ?? []).toHaveLength(0)
  })
  it('estimates tempo and key and spells flats and enharmonic octave boundaries', () => {
    expect(estimateTempo(Array.from({ length: 16 }, (_, i) => note(String(i), 60, i * 500, i * 500 + 200)))).toBe(120)
    expect(estimateTempo([note('a', 60, 0, 100)])).toBeNull()
    expect(detectKeySignature([note('a', 65, 0, 1000), note('b', 69, 0, 800), note('c', 72, 0, 800), note('d', 70, 1000, 1300)])).toBe('F')
    expect(spellPitch(70, 'F')).toBe('bb/4')
    expect(spellPitch(65, 'F#')).toBe('e#/4')
    expect(spellPitch(59, 'Gb')).toBe('cb/4')
  })
  it('groups chord attacks, filters notation only, and splits a crossing-measure triplet', () => {
    const original = [note('a', 60, 0, 500), note('b', 64, 18, 500), note('hit', 90, 900, 905), note('cross', 48, 1900, 2200)]
    const quantized = quantizeCapturedNotes(original, 120, { ...settings, quantization: 'eighth-triplet' })
    expect(quantized.find((n) => n.id === 'a')?.startTick).toBe(quantized.find((n) => n.id === 'b')?.startTick)
    expect(quantized).toHaveLength(3)
    expect(buildScoreDocument(original, { ...settings, quantization: 'eighth-triplet' }).measures).toHaveLength(2)
    expect(original).toHaveLength(4)
  })
  it('builds synchronized video filters with independent audio gains and constrained overlay', () => {
    const configured = { ...settings, pianoVolume: .6, microphoneVolume: 1.2, webcamOverlay: { x: .95, y: .95, width: .3, crop: .1, mirror: true } }
    const args = videoFfmpegArgs('score', 'audio', 'camera', true, 'out.mp4', 'mp4', 3.5, configured)
    const graph = args[args.indexOf('-filter_complex') + 1]
    expect(graph).toContain('hflip'); expect(graph).toContain('volume=0.6'); expect(graph).toContain('volume=1.2')
    expect(graph).toContain('asetpts=PTS-STARTPTS'); expect(args).toContain('3.500000')
    const box = webcamVideoBounds(configured)
    expect(box.x + box.width).toBeLessThanOrEqual(1256); expect(box.y + box.height).toBeLessThanOrEqual(532)
    expect(videoFfmpegArgs('score', 'audio', null, false, 'out.webm', 'webm', 1, settings)).toContain('libvpx-vp9')
    expect(exportFileName('My: song / take')).toBe('My_ song _ take')
  })
  it('uses distinct face and piano layouts and preserves the piano strip in video export', () => {
    const piano = defaultVideoOverlay('piano')
    const face = defaultVideoOverlay('face')
    expect(piano).toEqual(expect.objectContaining({ x: 0, y: .7, width: 1, height: .3, mirror: false }))
    expect(face).toEqual(expect.objectContaining({ width: .24, height: .36, mirror: true }))
    const configured = normalizeTranscriptionSettings({ mediaSources: [{ id: 'piano', kind: 'video', role: 'piano', name: 'Piano', deviceId: null, enabled: true, volume: 1, latencyMs: 0 }] })
    const normalized = configured.mediaSources?.[0].overlay!
    const box = webcamVideoBounds(configured, normalized)
    expect(normalized).toEqual(expect.objectContaining({ width: 1, height: .3, cropY: .58, mirror: false }))
    expect(box).toEqual(expect.objectContaining({ x: 24, width: 1232, y: 393, height: 138 }))
  })
})
