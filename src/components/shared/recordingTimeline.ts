export const RECORDING_TRACK_IDS = ['midiAudio', 'midiVideo', 'performanceAudio', 'cameraAudio', 'cameraVideo'] as const

export type RecordingTrackId = (typeof RECORDING_TRACK_IDS)[number]

export interface RecordingTimeline {
  startOffsetMs: Record<RecordingTrackId, number>
}

export interface RecordingExportTiming {
  /** Position inside the MIDI buffer, whose opening silence already contains the lead-in. */
  midiAudioBufferTimeMs: number
  /** Musical performance time used to render falling notes. Negative values are the visual lead-in. */
  midiVideoPerformanceTimeMs: number
}

export const RECORDING_TIMELINE_OFFSET_LIMIT_MS = 10_000

export function createRecordingTimeline(): RecordingTimeline {
  return {
    startOffsetMs: {
      cameraAudio: 0,
      cameraVideo: 0,
      midiAudio: 0,
      midiVideo: 0,
      performanceAudio: 0,
    },
  }
}

export function clampRecordingTrackOffsetMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(RECORDING_TIMELINE_OFFSET_LIMIT_MS, Math.max(-RECORDING_TIMELINE_OFFSET_LIMIT_MS, Math.round(value)))
}

/** Returns a track's local source time for a master review-clock time. */
export function getRecordingTrackSourceTimeMs(
  masterTimeMs: number,
  startOffsetMs: number,
): number {
  return masterTimeMs - startOffsetMs
}

/** Resolves all independently offsettable source clocks from one review clock. */
export function resolveRecordingTrackSourceTimes(
  masterTimeMs: number,
  timeline: RecordingTimeline,
): Record<RecordingTrackId, number> {
  return {
    cameraAudio: getRecordingTrackSourceTimeMs(masterTimeMs, timeline.startOffsetMs.cameraAudio),
    cameraVideo: getRecordingTrackSourceTimeMs(masterTimeMs, timeline.startOffsetMs.cameraVideo),
    midiAudio: getRecordingTrackSourceTimeMs(masterTimeMs, timeline.startOffsetMs.midiAudio),
    midiVideo: getRecordingTrackSourceTimeMs(masterTimeMs, timeline.startOffsetMs.midiVideo),
    performanceAudio: getRecordingTrackSourceTimeMs(masterTimeMs, timeline.startOffsetMs.performanceAudio),
  }
}

/**
 * Maps the recorded camera clock onto the two independently adjustable MIDI
 * clocks used by export. Camera audio/video are one linked source today, so
 * the camera-video offset establishes the export master-clock origin.
 */
export function resolveRecordingExportTiming(
  cameraSourceTimeMs: number,
  leadInMs: number,
  timeline: RecordingTimeline,
): RecordingExportTiming {
  const safeCameraTimeMs = Number.isFinite(cameraSourceTimeMs) ? cameraSourceTimeMs : 0
  const safeLeadInMs = Number.isFinite(leadInMs) ? Math.max(0, leadInMs) : 0
  const masterTimeMs = safeCameraTimeMs + timeline.startOffsetMs.cameraVideo
  const sourceTimes = resolveRecordingTrackSourceTimes(masterTimeMs, timeline)

  return {
    midiAudioBufferTimeMs: sourceTimes.midiAudio,
    midiVideoPerformanceTimeMs: sourceTimes.midiVideo - safeLeadInMs,
  }
}
