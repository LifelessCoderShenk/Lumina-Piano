import { describe, expect, it } from 'vitest'

import {
  RECORDING_TIMELINE_OFFSET_LIMIT_MS,
  clampRecordingTrackOffsetMs,
  createRecordingTimeline,
  resolveRecordingExportTiming,
  resolveRecordingTrackSourceTimes,
} from './recordingTimeline'

describe('recording timeline model', () => {
  it('starts every source at zero and clamps offsets to the supported range', () => {
    expect(createRecordingTimeline().startOffsetMs).toEqual({
      cameraAudio: 0,
      cameraVideo: 0,
      midiAudio: 0,
      midiVideo: 0,
      performanceAudio: 0,
    })
    expect(clampRecordingTrackOffsetMs(12_345)).toBe(RECORDING_TIMELINE_OFFSET_LIMIT_MS)
    expect(clampRecordingTrackOffsetMs(-12_345)).toBe(-RECORDING_TIMELINE_OFFSET_LIMIT_MS)
    expect(clampRecordingTrackOffsetMs(Number.NaN)).toBe(0)
  })

  it('maps every review track independently from the master clock', () => {
    const sourceTimes = resolveRecordingTrackSourceTimes(4_000, {
      startOffsetMs: {
        cameraAudio: 0,
        cameraVideo: 500,
        midiAudio: -250,
        midiVideo: 1_000,
        performanceAudio: 750,
      },
    })

    expect(sourceTimes).toEqual({
      cameraAudio: 4_000,
      cameraVideo: 3_500,
      midiAudio: 4_250,
      midiVideo: 3_000,
      performanceAudio: 3_250,
    })
  })

  it('maps camera time to the same shifted MIDI clocks used by export', () => {
    const timeline = {
      startOffsetMs: {
        cameraAudio: 1_000,
        cameraVideo: 1_000,
        midiAudio: 500,
        midiVideo: -250,
        performanceAudio: 0,
      },
    }

    expect(resolveRecordingExportTiming(0, 3_000, timeline)).toEqual({
      midiAudioBufferTimeMs: 500,
      midiVideoPerformanceTimeMs: -1_750,
    })
    expect(resolveRecordingExportTiming(4_000, 3_000, timeline)).toEqual({
      midiAudioBufferTimeMs: 4_500,
      midiVideoPerformanceTimeMs: 2_250,
    })
  })
})
