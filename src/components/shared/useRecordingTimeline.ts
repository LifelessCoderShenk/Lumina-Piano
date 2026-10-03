import { useCallback, useState } from 'react'

import {
  clampRecordingTrackOffsetMs,
  createRecordingTimeline,
  type RecordingTimeline,
  type RecordingTrackId,
} from './recordingTimeline'

interface UseRecordingTimelineOptions {
  /** Camera audio and video are one MediaRecorder Blob in Phase A. */
  linkCameraAudioToVideo?: boolean
}

export function useRecordingTimeline({ linkCameraAudioToVideo = true }: UseRecordingTimelineOptions = {}) {
  const [timeline, setTimeline] = useState<RecordingTimeline>(createRecordingTimeline)

  const setTrackStartOffsetMs = useCallback((trackId: RecordingTrackId, value: number) => {
    const nextValue = clampRecordingTrackOffsetMs(value)
    setTimeline((previous) => {
      const startOffsetMs = { ...previous.startOffsetMs, [trackId]: nextValue }
      if (linkCameraAudioToVideo && (trackId === 'cameraAudio' || trackId === 'cameraVideo')) {
        startOffsetMs.cameraAudio = nextValue
        startOffsetMs.cameraVideo = nextValue
      }
      return { startOffsetMs }
    })
  }, [linkCameraAudioToVideo])

  const resetTimeline = useCallback(() => {
    setTimeline(createRecordingTimeline())
  }, [])

  return { resetTimeline, setTrackStartOffsetMs, timeline }
}
