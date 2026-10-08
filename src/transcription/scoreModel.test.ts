/*
INPUT: Score-model helpers and concise captured-note fixtures.
OUTPUT: Coverage for quantization, rests, ties, staff assignment, and chord confidence.
PURPOSE: Guards the transcription rules independently from browser MIDI and SVG rendering.
*/

import { describe, expect, it } from 'vitest'

import { buildScoreDocument, detectChordName, quantizeCapturedNotes, SIXTEENTH_TICKS, TICKS_PER_QUARTER } from './scoreModel'
import type { CapturedNote } from './types'

const note = (id: string, pitch: number, startMs: number, endMs: number): CapturedNote => ({
  channel: 0,
  endMs,
  id,
  pitch,
  startMs,
  velocity: 100,
})

describe('scoreModel', () => {
  it('quantizes to sixteenth notes and assigns C4 to treble', () => {
    const [treble, bass] = quantizeCapturedNotes([
      note('c4', 60, 118, 377),
      note('b3', 59, 0, 250),
    ], 120)

    expect(treble).toMatchObject({ startTick: 0, durationTicks: 2 * SIXTEENTH_TICKS, staff: 'bass' })
    expect(bass).toMatchObject({ startTick: SIXTEENTH_TICKS, durationTicks: 2 * SIXTEENTH_TICKS, staff: 'treble' })
  })

  it('fills rests, groups a chord, and splits a held note with ties across barlines', () => {
    const score = buildScoreDocument([
      note('held', 60, 0, 2_250),
      note('root', 72, 500, 750),
      note('third', 64, 500, 750),
      note('fifth', 67, 500, 750),
    ], { bpm: 120, meter: '4/4' })

    expect(score.measures).toHaveLength(2)
    expect(score.measures[0].bassVoices.flatMap((voice) => voice.events).some((entry) => entry.isRest)).toBe(true)
    expect(score.measures[0].trebleVoices.flatMap((voice) => voice.events).some((entry) => entry.tieToNext)).toBe(true)
    expect(score.measures[1].trebleVoices.flatMap((voice) => voice.events).some((entry) => entry.tieFromPrevious)).toBe(true)
    expect(score.measures[0].chordLabels.map((label) => label.name)).toContain('C')
    expect(score.ticksPerMeasure).toBe(4 * TICKS_PER_QUARTER)
  })

  it('labels only complete common pitch-class sets', () => {
    expect(detectChordName([60, 64, 67])).toBe('C')
    expect(detectChordName([60, 63, 67, 70])).toBe('Cm7')
    expect(detectChordName([60, 61, 67])).toBeNull()
  })

  it('keeps an overlapping held note in its own voice instead of serialising it after later notes', () => {
    const score = buildScoreDocument([
      note('held-c', 60, 0, 2_000),
      note('later-e', 64, 500, 750),
    ], { bpm: 120, meter: '4/4' })

    const trebleVoices = score.measures[0].trebleVoices
    expect(trebleVoices).toHaveLength(2)
    expect(trebleVoices.flatMap((voice) => voice.events).filter((event) => !event.isRest)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'held-c', startTick: 0 }),
      expect.objectContaining({ id: 'later-e', startTick: TICKS_PER_QUARTER }),
    ]))
  })

  it('detects a chord when its root is held before later chord tones begin', () => {
    const score = buildScoreDocument([
      note('held-root', 60, 0, 1_000),
      note('third', 64, 500, 750),
      note('fifth', 67, 500, 750),
    ], { bpm: 120, meter: '4/4' })

    expect(score.measures[0].chordLabels).toContainEqual({ name: 'C', startTick: TICKS_PER_QUARTER })
  })
})
