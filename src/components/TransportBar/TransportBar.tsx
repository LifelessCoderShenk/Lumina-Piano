import { useCallback, useEffect, useMemo } from 'react'

import { CameraError, cameraSystem } from '../../camera/CameraSystem'
import { openAndLoadMidiFile } from '../../midi/loadMidiProject'
import { playbackEngine } from '../../playback/PlaybackEngine'
import {
  useAppStore,
  useCameraState,
  usePlaybackState,
  useProjectData,
} from '../../store/store'
import { computeDensityData } from './computeDensityData'
import { Scrubber } from './Scrubber'
import { TransportButton } from './TransportButton'
import {
  IconFile,
  IconLoop,
  IconPause,
  IconPlay,
  IconStop,
  IconZoomIn,
  IconZoomOut,
} from './TransportIcons'
import styles from './TransportBar.module.css'
import { useTransportTime } from './useTransportTime'

const ERROR_DISMISS_MS = 3000

export function TransportBar() {
  const { currentTick, isPlaying, loopEnabled, loopEndTick, loopStartTick } = usePlaybackState()
  const { worldZoom, viewportHeight, viewportWidth } = useCameraState()
  const { isProjectLoaded, projectData } = useProjectData()
  const errorMessage = useAppStore((state) => state.errorMessage)
  const setLoop = useAppStore((state) => state.setLoop)
  const setErrorMessage = useAppStore((state) => state.setErrorMessage)

  const { currentProgress, currentTimeStr, totalTimeStr } = useTransportTime()
  const isDisabled = !isProjectLoaded || projectData == null
  const zoomPercent = Math.round(worldZoom * 100)

  const densityData = useMemo(() => {
    if (projectData == null) {
      return []
    }

    return computeDensityData(projectData)
  }, [projectData])

  useEffect(() => {
    if (errorMessage == null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setErrorMessage(null)
    }, ERROR_DISMISS_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [errorMessage, setErrorMessage])

  const handleScrubSeek = useCallback(
    (progress: number) => {
      const totalTicks = projectData?.totalTicks ?? 0
      if (totalTicks <= 0) {
        return
      }

      playbackEngine.seek(Math.round(progress * totalTicks))
    },
    [projectData],
  )

  const handleTogglePlay = useCallback(() => {
    if (isDisabled) {
      return
    }

    console.log('[Transport] Play clicked')

    if (isPlaying) {
      playbackEngine.pause()
      return
    }

    playbackEngine.play()
  }, [isDisabled, isPlaying])

  const handleStop = useCallback(() => {
    if (isDisabled) {
      return
    }

    playbackEngine.pause()
    playbackEngine.seek(0)
  }, [isDisabled])

  const handleToggleLoop = useCallback(() => {
    if (isDisabled || projectData == null) {
      return
    }

    const nextEnabled = !loopEnabled
    setLoop(
      nextEnabled,
      loopStartTick ?? 0,
      loopEndTick ?? projectData.totalTicks,
    )
  }, [isDisabled, loopEnabled, loopEndTick, loopStartTick, projectData, setLoop])

  const handleZoom = useCallback((factor: number) => {
    const centerX = viewportWidth / 2
    const centerY = viewportHeight / 2

    try {
      console.log('[Transport] Camera initialized:', cameraSystem.isInitialized())
      cameraSystem.zoom(factor, centerX, centerY)
    } catch (error: unknown) {
      if (error instanceof CameraError && error.code === 'NOT_INITIALIZED') {
        return
      }

      throw error
    }
  }, [viewportHeight, viewportWidth])

  const seekByBeats = useCallback(
    (beats: number) => {
      if (isDisabled || projectData == null) {
        return
      }

      const deltaTicks = Math.round(beats * projectData.ticksPerQuarter)
      const nextTick = Math.max(0, Math.min(projectData.totalTicks, currentTick + deltaTicks))
      playbackEngine.seek(nextTick)
    },
    [currentTick, isDisabled, projectData],
  )

  const handleFileLoad = useCallback(() => {
    void (async () => {
      try {
        await openAndLoadMidiFile()
      } catch (error: unknown) {
        console.error('MIDI load error:', error)
        setErrorMessage('Failed to load MIDI file.')
      }
    })()
  }, [setErrorMessage])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      switch (event.key) {
        case ' ':
          event.preventDefault()
          handleTogglePlay()
          break
        case 'Home':
          event.preventDefault()
          if (!isDisabled) {
            playbackEngine.seek(0)
          }
          break
        case 'ArrowLeft':
          event.preventDefault()
          seekByBeats(-1)
          break
        case 'ArrowRight':
          event.preventDefault()
          seekByBeats(1)
          break
        case '-':
          event.preventDefault()
          handleZoom(0.8)
          break
        case '=':
        case '+':
          event.preventDefault()
          handleZoom(1.25)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleTogglePlay, handleZoom, isDisabled, seekByBeats])

  return (
    <div className={styles.bar}>
      {errorMessage != null ? (
        <div className={styles.toast} role="status">
          {errorMessage}
        </div>
      ) : null}

      <div className={styles.controls}>
        <TransportButton
          ariaLabel="Open MIDI file"
          disabled={false}
          icon={<IconFile />}
          onClick={handleFileLoad}
        />
        <TransportButton
          ariaLabel="Stop"
          disabled={isDisabled}
          icon={<IconStop />}
          onClick={handleStop}
        />
        <TransportButton
          ariaLabel={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          disabled={isDisabled}
          icon={isPlaying ? <IconPause /> : <IconPlay />}
          isActive={isPlaying}
          onClick={handleTogglePlay}
        />
        <TransportButton
          ariaLabel="Toggle loop"
          aria-pressed={loopEnabled}
          disabled={isDisabled}
          icon={<IconLoop />}
          isActive={loopEnabled}
          onClick={handleToggleLoop}
        />
      </div>

      <span className={`${styles.time} ${styles.timeCurrent}`}>{currentTimeStr}</span>

      <Scrubber
        ariaValueMax={projectData?.totalTicks ?? 0}
        ariaValueMin={0}
        ariaValueNow={currentTick}
        densityData={densityData}
        disabled={isDisabled}
        onSeek={handleScrubSeek}
        progress={currentProgress}
      />

      <span className={`${styles.time} ${styles.timeTotal}`}>{totalTimeStr}</span>

      <div className={styles.zoomGroup}>
        <TransportButton
          ariaLabel="Zoom out"
          disabled={false}
          icon={<IconZoomOut />}
          onClick={() => handleZoom(0.8)}
        />
        <span className={styles.zoomLabel}>{zoomPercent}%</span>
        <TransportButton
          ariaLabel="Zoom in"
          disabled={false}
          icon={<IconZoomIn />}
          onClick={() => handleZoom(1.25)}
        />
      </div>
    </div>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable
}
