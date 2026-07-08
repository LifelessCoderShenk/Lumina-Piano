import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'

import { playbackEngine } from '../../playback/PlaybackEngine'
import { useAppStore } from '../../store/store'
import { secondsToTick, tickToSeconds, type PrecomputedTempoMap } from '../../tempo/tempoMap'

interface UsePreviewPlaybackOptions {
  active: boolean
  onBeforePlay?(): void
  onResetPlayback(): void
  playErrorMessage: string
  precomputedTempoMap: null | PrecomputedTempoMap
  preRollSeconds: number
  previewVideoRef: RefObject<HTMLVideoElement | null>
  syncUnavailableMessage?: string
}

export function usePreviewPlayback({
  active,
  onBeforePlay,
  onResetPlayback,
  playErrorMessage,
  precomputedTempoMap,
  preRollSeconds,
  previewVideoRef,
  syncUnavailableMessage,
}: UsePreviewPlaybackOptions) {
  const previewUrlRef = useRef<string | null>(null)
  const previewStartTimeRef = useRef(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)

  useEffect(() => {
    if (!active || previewUrl == null || previewVideoRef.current == null) {
      return
    }

    const previewVideo = previewVideoRef.current
    previewVideo.src = previewUrl
    if (typeof previewVideo.load === 'function') {
      previewVideo.load()
    }

    const handleTimeUpdate = () => {
      setPreviewCurrentTime(previewVideo.currentTime)

      if (precomputedTempoMap == null) {
        return
      }

      const videoTime = previewVideo.currentTime
      if (videoTime < preRollSeconds) {
        return
      }

      const elapsedSincePreviewStart = performance.now() - previewStartTimeRef.current
      if (elapsedSincePreviewStart < 2000) {
        return
      }

      const currentEngineSeconds = tickToSeconds(playbackEngine.getCurrentTick(), precomputedTempoMap)
      const engineTimeWithPreRoll = currentEngineSeconds + preRollSeconds
      if (Math.abs(videoTime - engineTimeWithPreRoll) > 0.3) {
        playbackEngine.seek(
          secondsToTick(
            Math.max(0, videoTime - preRollSeconds),
            precomputedTempoMap,
          ),
        )
      }
    }

    const handleEnded = () => {
      setIsPreviewPlaying(false)
      previewVideo.currentTime = 0
      setPreviewCurrentTime(0)
      onResetPlayback()
    }

    const handlePause = () => {
      setIsPreviewPlaying(false)
    }

    const handlePlay = () => {
      setIsPreviewPlaying(true)
    }

    const handleLoadedMetadata = () => {
      setPreviewDuration(Number.isFinite(previewVideo.duration) ? previewVideo.duration : 0)
      setPreviewCurrentTime(previewVideo.currentTime)
    }

    previewVideo.addEventListener('timeupdate', handleTimeUpdate)
    previewVideo.addEventListener('ended', handleEnded)
    previewVideo.addEventListener('pause', handlePause)
    previewVideo.addEventListener('play', handlePlay)
    previewVideo.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      previewVideo.removeEventListener('timeupdate', handleTimeUpdate)
      previewVideo.removeEventListener('ended', handleEnded)
      previewVideo.removeEventListener('pause', handlePause)
      previewVideo.removeEventListener('play', handlePlay)
      previewVideo.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [active, onResetPlayback, precomputedTempoMap, preRollSeconds, previewUrl, previewVideoRef])

  const syncPlaybackToPreviewTime = useCallback((videoTime: number, shouldPlay: boolean): boolean => {
    const state = useAppStore.getState()
    if (state.projectData == null || state.precomputedTempoMap == null) {
      return false
    }

    previewStartTimeRef.current = performance.now()

    if (videoTime < preRollSeconds) {
      playbackEngine.pause()
      playbackEngine.playWithPreRoll(preRollSeconds - videoTime)
      if (!shouldPlay) {
        playbackEngine.pause()
      }
      return true
    }

    const targetTick = secondsToTick(
      videoTime - preRollSeconds,
      state.precomputedTempoMap,
    )
    playbackEngine.seek(targetTick)
    if (shouldPlay) {
      playbackEngine.play()
    } else {
      playbackEngine.pause()
    }
    return true
  }, [preRollSeconds])

  const togglePreviewPlayback = useCallback(async () => {
    const previewVideo = previewVideoRef.current
    if (previewVideo == null) {
      return
    }

    if (isPreviewPlaying) {
      previewVideo.pause()
      playbackEngine.pause()
      setIsPreviewPlaying(false)
      return
    }

    onBeforePlay?.()

    try {
      await previewVideo.play()
      if (!syncPlaybackToPreviewTime(previewVideo.currentTime, true)) {
        if (syncUnavailableMessage != null) {
          console.warn(syncUnavailableMessage)
        }
        setIsPreviewPlaying(true)
        return
      }

      setIsPreviewPlaying(true)
    } catch (error) {
      onResetPlayback()
      console.warn(playErrorMessage, error)
    }
  }, [
    isPreviewPlaying,
    onBeforePlay,
    onResetPlayback,
    playErrorMessage,
    previewVideoRef,
    syncPlaybackToPreviewTime,
    syncUnavailableMessage,
  ])

  const handlePreviewScrub = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const previewVideo = previewVideoRef.current
    if (previewVideo == null || !active) {
      return
    }

    const nextTime = Number(event.target.value)
    previewVideo.currentTime = nextTime
    setPreviewCurrentTime(nextTime)
    syncPlaybackToPreviewTime(nextTime, isPreviewPlaying)
  }, [active, isPreviewPlaying, previewVideoRef, syncPlaybackToPreviewTime])

  const pausePreview = useCallback(() => {
    previewVideoRef.current?.pause()
  }, [previewVideoRef])

  const resetPreviewState = useCallback(() => {
    setPreviewCurrentTime(0)
    setPreviewDuration(0)
    setIsPreviewPlaying(false)
  }, [])

  const setPreviewSource = useCallback((nextPreviewUrl: string | null) => {
    previewUrlRef.current = nextPreviewUrl
    setPreviewUrl(nextPreviewUrl)
  }, [])

  const clearPreviewSource = useCallback(() => {
    revokePreviewUrl(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
  }, [])

  return {
    clearPreviewSource,
    handlePreviewScrub,
    isPreviewPlaying,
    pausePreview,
    previewCurrentTime,
    previewDuration,
    resetPreviewState,
    setPreviewSource,
    togglePreviewPlayback,
  }
}

function revokePreviewUrl(previewUrl: string | null) {
  if (previewUrl == null) {
    return
  }

  URL.revokeObjectURL(previewUrl)
}
