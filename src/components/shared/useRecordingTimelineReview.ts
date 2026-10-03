import { useCallback, useEffect } from 'react'

import { playbackEngine } from '../../playback/PlaybackEngine'
import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { secondsToTick, tickToSeconds, type PrecomputedTempoMap } from '../../tempo/tempoMap'
import { resolveRecordingTrackSourceTimes, type RecordingTimeline } from './recordingTimeline'

interface RecordingTimelineReviewOptions {
  preRollSeconds: number
  precomputedTempoMap: PrecomputedTempoMap | null
  timeline: RecordingTimeline
}

/**
 * Applies Phase-A offsets during review only. Camera A/V remains one linked
 * media source; its shared offset establishes the master-clock origin.
 * TODO: Use separate captured camera audio/video sources in a later phase.
 */
export function useRecordingTimelineReview({
  preRollSeconds,
  precomputedTempoMap,
  timeline,
}: RecordingTimelineReviewOptions) {
  const syncReviewTimeline = useCallback((cameraVideoTimeSeconds: number, shouldPlay: boolean, force = false): boolean => {
    if (precomputedTempoMap == null) {
      return false
    }

    const masterTimeMs = (Math.max(0, cameraVideoTimeSeconds) * 1000) + timeline.startOffsetMs.cameraVideo
    const midiMasterTimeMs = masterTimeMs - (preRollSeconds * 1000)
    const trackSourceTimes = resolveRecordingTrackSourceTimes(midiMasterTimeMs, timeline)
    const midiAudioTimeMs = trackSourceTimes.midiAudio
    const midiVideoTimeMs = trackSourceTimes.midiVideo
    const renderer = getActiveVisualizerRenderer()

    renderer?.setReviewTimelineTick?.(
      midiVideoTimeMs < 0 ? null : secondsToTick(midiVideoTimeMs / 1000, precomputedTempoMap),
    )

    if (midiAudioTimeMs < 0) {
      playbackEngine.pause()
      return true
    }

    const nextTick = secondsToTick(midiAudioTimeMs / 1000, precomputedTempoMap)
    const currentSeconds = tickToSeconds(playbackEngine.getCurrentTick(), precomputedTempoMap)
    if (force || !Number.isFinite(currentSeconds) || Math.abs(currentSeconds - (midiAudioTimeMs / 1000)) > 0.3) {
      playbackEngine.seek(nextTick)
    }

    if (shouldPlay) {
      playbackEngine.play()
    } else {
      playbackEngine.pause()
    }
    return true
  }, [preRollSeconds, precomputedTempoMap, timeline.startOffsetMs])

  useEffect(() => () => {
    getActiveVisualizerRenderer()?.setReviewTimelineTick?.(null)
  }, [])

  return { syncReviewTimeline }
}
