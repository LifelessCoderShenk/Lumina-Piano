/*
INPUT: LiveTranscriptionCapture and synthetic normalized MIDI messages.
OUTPUT: Coverage for repeated-note capture, held-note closure, and clear semantics.
PURPOSE: Verifies live input becomes distinct, safe-to-engrave note instances.
*/

import { describe, expect, it } from 'vitest'

import { LiveTranscriptionCapture } from './capture'

describe('LiveTranscriptionCapture', () => {
  it('keeps repeated notes separate and closes them in onset order', () => {
    const capture = new LiveTranscriptionCapture()
    capture.start(1_000)
    capture.receive({ type: 'noteon', pitch: 60, velocity: 90, channel: 0, timestampMs: 1_000 })
    capture.receive({ type: 'noteon', pitch: 60, velocity: 70, channel: 0, timestampMs: 1_100 })
    capture.receive({ type: 'noteoff', pitch: 60, velocity: 0, channel: 0, timestampMs: 1_200 })
    capture.receive({ type: 'noteoff', pitch: 60, velocity: 0, channel: 0, timestampMs: 1_300 })

    expect(capture.stop(1_400)).toEqual([
      expect.objectContaining({ id: 'captured-0', startMs: 0, endMs: 200, velocity: 90 }),
      expect.objectContaining({ id: 'captured-1', startMs: 100, endMs: 300, velocity: 70 }),
    ])
  })

  it('keeps mouse and physical MIDI notes independent when their pitch and channel match', () => {
    const capture = new LiveTranscriptionCapture()
    capture.start(0)
    capture.receive({ type: 'noteon', pitch: 60, velocity: 90, channel: 0, timestampMs: 10 })
    capture.receive({ type: 'noteon', pitch: 60, velocity: 100, channel: 0, timestampMs: 20, sourceId: 'pointer' })
    capture.receive({ type: 'noteoff', pitch: 60, velocity: 0, channel: 0, timestampMs: 50, sourceId: 'pointer' })
    capture.receive({ type: 'noteoff', pitch: 60, velocity: 0, channel: 0, timestampMs: 200 })
    expect(capture.stop(200)).toEqual([
      expect.objectContaining({ startMs: 10, endMs: 200, velocity: 90 }),
      expect.objectContaining({ startMs: 20, endMs: 50, velocity: 100 }),
    ])
  })

  it('closes held notes at Stop and Clear returns no score input', () => {
    const capture = new LiveTranscriptionCapture()
    capture.start(100)
    capture.receive({ type: 'noteon', pitch: 48, velocity: 88, channel: 3, timestampMs: 120 })

    expect(capture.stop(620)).toEqual([expect.objectContaining({ startMs: 20, endMs: 520 })])
    capture.clear()
    expect(capture.notes()).toEqual([])
  })

  it('reuses idle previews and invalidates them when notes close or capture resets', () => {
    const capture = new LiveTranscriptionCapture()
    capture.start(0)
    const empty = capture.preview(0)
    expect(capture.preview(80)).toBe(empty)
    capture.receive({ type: 'noteon', pitch: 60, velocity: 100, channel: 0, timestampMs: 100 })
    capture.receive({ type: 'noteoff', pitch: 60, velocity: 0, channel: 0, timestampMs: 150 })
    const completed = capture.preview(160)
    expect(completed).toHaveLength(1)
    expect(capture.preview(240)).toBe(completed)
    capture.start(300)
    expect(capture.preview(300)).toEqual([])
    expect(completed).toHaveLength(1)
  })

  it('includes a provisional, lengthening note in the live score before note-off', () => {
    const capture = new LiveTranscriptionCapture()
    capture.start(1_000)
    capture.receive({ type: 'noteon', pitch: 60, velocity: 100, channel: 0, timestampMs: 1_100 })

    expect(capture.preview(1_250)).toEqual([
      expect.objectContaining({ id: 'captured-0', startMs: 100, endMs: 250 }),
    ])
    expect(capture.preview(1_500)).toEqual([
      expect.objectContaining({ id: 'captured-0', startMs: 100, endMs: 500 }),
    ])
  })
})
