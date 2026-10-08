/*
INPUT: A concise parsed-MIDI fixture.
OUTPUT: Coverage for the synthetic sample event stream used by Transcriptor preview playback.
PURPOSE: Ensures the demo retains tempo, meter, note duration, and safe same-timestamp ordering before it reaches live capture.
*/

import { describe, expect, it } from 'vitest'

import { createSamplePlaybackPlan } from './samplePlayback'
import type { ProjectData } from '../midi/types'

const project: ProjectData = {
  tempoMap: [{ bpm: 200, microsecondsPerBeat: 300_000, tick: 0 }],
  ticksPerQuarter: 480,
  timeSignatures: [{ denominator: 8, numerator: 6, tick: 0 }],
  totalTicks: 480,
  tracks: [{
    channel: 2,
    id: 'piano',
    name: 'Piano',
    notes: [
      { endTick: 480, id: 'first', pitch: 60, startTick: 0, velocity: 90, visualEndTick: 480 },
      { endTick: 480, id: 'second', pitch: 60, startTick: 480, velocity: 100, visualEndTick: 480 },
    ],
  }],
}

describe('createSamplePlaybackPlan', () => {
  it('creates a timing-faithful 6/8 demo stream and closes repeated pitches before reopening them', () => {
    const plan = createSamplePlaybackPlan(project)

    expect(plan).toMatchObject({ bpm: 200, durationMs: 301, meter: '6/8' })
    expect(plan.events).toEqual([
      expect.objectContaining({ atMs: 0, channel: 18, durationMs: 300, pitch: 60, type: 'noteon', velocity: 90 }),
      expect.objectContaining({ atMs: 300, channel: 18, pitch: 60, type: 'noteoff' }),
      expect.objectContaining({ atMs: 300, channel: 18, durationMs: 1, pitch: 60, type: 'noteon', velocity: 100 }),
      expect.objectContaining({ atMs: 301, channel: 18, pitch: 60, type: 'noteoff' }),
    ])
  })
})
