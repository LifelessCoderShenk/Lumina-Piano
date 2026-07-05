import React, { useEffect, useRef, useState } from 'react'

import { audioScheduler } from '../../audio/AudioScheduler'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { useAppStore } from '../../store/store'
import { secondsToTick, tickToSeconds } from '../../tempo/tempoMap'
import { compositeExport } from '../../utils/compositeExport'
import styles from './CameraMode.module.css'

const CAMERA_MODE_PRE_ROLL_SECONDS = 3
export const CAMERA_MODE_TIMELINE_HEIGHT_PX = 120
const MIN_TRACK_BAR_WIDTH_PX = 20
const TRACK_KEYS = ['audio', 'video', 'visualization'] as const

type CameraStatus = 'loading' | 'ready' | 'error'
type TrackKey = (typeof TRACK_KEYS)[number]

interface CameraModeProps {
  isTimelineVisible: boolean
  onAlignClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onTimelineVisibilityChange: (visible: boolean) => void
}

interface TrackTrim {
  start: number
  end: number
}

type TrackOffsets = Record<TrackKey, number>
type TrackTrims = Record<TrackKey, TrackTrim>

const INITIAL_TRACK_OFFSETS: TrackOffsets = {
  audio: 0,
  video: 0,
  visualization: 0,
}

const INITIAL_TRACK_TRIMS: TrackTrims = {
  audio: { start: 0, end: 0 },
  video: { start: 0, end: 0 },
  visualization: { start: 0, end: 0 },
}

export function CameraMode({
  isTimelineVisible,
  onAlignClick,
  onTimelineVisibilityChange,
}: CameraModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const audioWaveformCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const waveformDrawnRef = useRef(false)
  const countdownTimeoutIdsRef = useRef<Array<ReturnType<typeof globalThis.setTimeout>>>([])
  const previewUrlRef = useRef<string | null>(null)
  const previewStartTimeRef = useRef(0)
  const barAreaRefs = useRef<Record<TrackKey, HTMLDivElement | null>>({
    audio: null,
    video: null,
    visualization: null,
  })
  const isMountedRef = useRef(false)
  const isRecordingRef = useRef(false)
  const timelineVisibleRef = useRef(false)
  const animationFrameRef = useRef<number | null>(null)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('loading')
  const [isRecording, setIsRecording] = useState(false)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [midiMuted, setMidiMuted] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [trackOffsets, setTrackOffsets] = useState<TrackOffsets>(INITIAL_TRACK_OFFSETS)
  const [trackTrims, setTrackTrims] = useState<TrackTrims>(INITIAL_TRACK_TRIMS)
  const [draggingTrack, setDraggingTrack] = useState<TrackKey | null>(null)
  const [draggingTrim, setDraggingTrim] = useState<{ side: 'start' | 'end'; track: TrackKey } | null>(null)
  const currentPieceId = useAppStore((state) => state.currentPieceId)
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const isProjectLoaded = useAppStore((state) => state.isProjectLoaded)
  const pieces = useAppStore((state) => state.pieces)
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const alignStep = useAppStore((state) => state.alignStep)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setActiveSecondBarTab = useAppStore((state) => state.setActiveSecondBarTab)

  const loadedPieceName = pieces.find((piece) => piece.id === currentPieceId)?.name ?? 'piece'
  const hasRecording = recordingBlob != null
  const cropTop = Math.max(0, cameraOverlay.cropTop)
  const cropRight = Math.max(0, cameraOverlay.cropRight)
  const cropBottom = Math.max(0, cameraOverlay.cropBottom)
  const cropLeft = Math.max(0, cameraOverlay.cropLeft)
  const cropFrameStyle = {
    height: `calc(100% + ${cropTop + cropBottom}px)`,
    left: `-${cropLeft}px`,
    top: `-${cropTop}px`,
    width: `calc(100% + ${cropLeft + cropRight}px)`,
  }

  timelineVisibleRef.current = isTimelineVisible

  const drawWaveformIfReady = (blob: Blob | null, canvas: HTMLCanvasElement | null) => {
    if (blob == null || canvas == null || waveformDrawnRef.current) {
      return
    }

    waveformDrawnRef.current = true
    void drawWaveform(blob, canvas)
  }

  const setAudioWaveformCanvas = (canvas: HTMLCanvasElement | null) => {
    audioWaveformCanvasRef.current = canvas
    drawWaveformIfReady(recordingBlob, canvas)
  }

  useEffect(() => {
    isMountedRef.current = true

    try {
      playbackEngine.seek(0)
      playbackEngine.playWithPreRoll(CAMERA_MODE_PRE_ROLL_SECONDS)
    } catch (error) {
      console.warn('Unable to start playback on camera mode entry.', error)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    audioScheduler.setMuted(midiMuted)

    return () => {
      audioScheduler.setMuted(false)
    }
  }, [midiMuted])

  useEffect(() => {
    if (!previewMode || previewUrl == null || previewVideoRef.current == null) {
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
      if (videoTime < CAMERA_MODE_PRE_ROLL_SECONDS) {
        return
      }

      const elapsedSincePreviewStart = performance.now() - previewStartTimeRef.current
      if (elapsedSincePreviewStart < 2000) {
        return
      }

      const currentEngineSeconds = tickToSeconds(playbackEngine.getCurrentTick(), precomputedTempoMap)
      const engineTimeWithPreRoll = currentEngineSeconds + CAMERA_MODE_PRE_ROLL_SECONDS
      if (Math.abs(videoTime - engineTimeWithPreRoll) > 0.3) {
        playbackEngine.seek(
          secondsToTick(
            Math.max(0, videoTime - CAMERA_MODE_PRE_ROLL_SECONDS),
            precomputedTempoMap,
          ),
        )
      }
    }

    const handleEnded = () => {
      setIsPreviewPlaying(false)
      previewVideo.currentTime = 0
      setPreviewCurrentTime(0)
      resetPlaybackToStart()
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
  }, [precomputedTempoMap, previewMode, previewUrl])

  useEffect(() => {
    const handlePlaybackEnded = () => {
      if (isRecordingRef.current) {
        stopRecording()
      }
    }

    playbackEngine.on('onEnded', handlePlaybackEnded)

    return () => {
      playbackEngine.off('onEnded', handlePlaybackEnded)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const startVideoStream = async () => {
      setCameraStatus('loading')

      try {
        if (navigator.mediaDevices?.getUserMedia == null) {
          throw new Error('Camera API unavailable')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        })

        if (cancelled) {
          stopMediaStream(stream)
          return
        }

        streamRef.current = stream

        if (videoRef.current == null) {
          stopMediaStream(stream)
          return
        }

        videoRef.current.srcObject = stream
        await videoRef.current.play()

        if (!cancelled && isMountedRef.current) {
          setCameraStatus('ready')
        }
      } catch (error) {
        console.error('Unable to start webcam stream:', error)
        if (!cancelled && isMountedRef.current) {
          setCameraStatus('error')
        }
      }
    }

    void startVideoStream()

    return () => {
      cancelled = true
      isMountedRef.current = false
      clearCountdownTimeouts(countdownTimeoutIdsRef.current)
      stopRecording()
      if (previewVideoRef.current != null) {
        previewVideoRef.current.pause()
      }
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      revokePreviewUrl(previewUrlRef.current)
      previewUrlRef.current = null
      if (videoRef.current != null) {
        videoRef.current.srcObject = null
      }
      if (streamRef.current != null) {
        stopMediaStream(streamRef.current)
        streamRef.current = null
      }
    }
  }, [])

  const stopRecording = () => {
    isRecordingRef.current = false
    clearCountdownTimeouts(countdownTimeoutIdsRef.current)

    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (mediaRecorderRef.current != null && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    resetPlaybackToStart()

    if (isMountedRef.current) {
      setCountdownValue(null)
      setIsRecording(false)
    }
  }

  const waitForCountdownStep = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
      const timeoutId = globalThis.setTimeout(() => {
        countdownTimeoutIdsRef.current = countdownTimeoutIdsRef.current.filter((id) => id !== timeoutId)
        resolve()
      }, ms)
      countdownTimeoutIdsRef.current.push(timeoutId)
    })
  }

  const startCountdown = async () => {
    if (countdownValue != null || isRecordingRef.current || !isProjectLoaded) {
      return
    }

    const webcamStream = streamRef.current
    if (webcamStream == null || typeof MediaRecorder !== 'function') {
      return
    }

    recordingChunksRef.current = []
    waveformDrawnRef.current = false
    setPreviewMode(false)
    setPreviewUrl(null)
    setPreviewCurrentTime(0)
    setPreviewDuration(0)
    setIsPreviewPlaying(false)
    setRecordingBlob(null)
    setTrackOffsets(INITIAL_TRACK_OFFSETS)
    setTrackTrims(INITIAL_TRACK_TRIMS)
    revokePreviewUrl(previewUrlRef.current)
    previewUrlRef.current = null
    if (timelineVisibleRef.current) {
      onTimelineVisibilityChange(false)
    }

    audioScheduler.setMuted(true)
    setMidiMuted(true)

    const mediaRecorder = new MediaRecorder(webcamStream, {
      mimeType: 'video/webm;codecs=vp9',
    })

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data != null) {
        recordingChunksRef.current.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
      const previewObjectUrl = URL.createObjectURL(blob)
      previewUrlRef.current = previewObjectUrl
      if (streamRef.current != null) {
        stopMediaStream(streamRef.current)
        streamRef.current = null
      }
      if (videoRef.current != null) {
        videoRef.current.srcObject = null
      }
      if (isMountedRef.current) {
        setRecordingBlob(blob)
        setPreviewMode(true)
        setPreviewUrl(previewObjectUrl)
        setPreviewCurrentTime(0)
        setIsPreviewPlaying(false)
        setIsRecording(false)
      }
      drawWaveformIfReady(blob, audioWaveformCanvasRef.current)
      mediaRecorderRef.current = null
    }

    mediaRecorderRef.current = mediaRecorder
    isRecordingRef.current = true
    setIsRecording(true)
    mediaRecorder.start()

    try {
      playbackEngine.seek(0)
      playbackEngine.playWithPreRoll(CAMERA_MODE_PRE_ROLL_SECONDS)
    } catch (error) {
      console.warn('Unable to start playback for camera countdown.', error)
    }

    setCountdownValue(3)
    await waitForCountdownStep(1000)
    if (!isMountedRef.current) {
      return
    }

    setCountdownValue(2)
    await waitForCountdownStep(1000)
    if (!isMountedRef.current) {
      return
    }

    setCountdownValue(1)
    await waitForCountdownStep(1000)
    if (!isMountedRef.current) {
      return
    }

    setCountdownValue(null)
  }

  const handleRecordToggle = () => {
    if (isRecordingRef.current) {
      stopRecording()
      return
    }

    void (async () => {
      try {
        await audioScheduler.warmUp()
      } catch (error) {
        console.warn('Unable to warm up audio for camera countdown.', error)
      }
      await startCountdown()
    })()
  }

  const syncPlaybackToPreviewTime = (videoTime: number, shouldPlay: boolean): boolean => {
    const currentState = useAppStore.getState()
    if (currentState.projectData == null || currentState.precomputedTempoMap == null) {
      return false
    }

    previewStartTimeRef.current = performance.now()

    if (videoTime < CAMERA_MODE_PRE_ROLL_SECONDS) {
      playbackEngine.pause()
      playbackEngine.playWithPreRoll(CAMERA_MODE_PRE_ROLL_SECONDS - videoTime)
      if (!shouldPlay) {
        playbackEngine.pause()
      }
      return true
    }

    const targetTick = secondsToTick(
      videoTime - CAMERA_MODE_PRE_ROLL_SECONDS,
      currentState.precomputedTempoMap,
    )
    playbackEngine.seek(targetTick)
    if (shouldPlay) {
      playbackEngine.play()
    } else {
      playbackEngine.pause()
    }
    return true
  }

  const togglePreviewPlayback = async () => {
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

    audioScheduler.setMuted(false)
    setMidiMuted(false)
    try {
      await previewVideo.play()
      if (!syncPlaybackToPreviewTime(previewVideo.currentTime, true)) {
        console.warn('togglePreviewPlayback: no project loaded, skipping visualizer sync')
        setIsPreviewPlaying(true)
        return
      }

      setIsPreviewPlaying(true)
    } catch (error) {
      resetPlaybackToStart()
      console.warn('Unable to play camera preview.', error)
    }
  }

  const handleExport = async () => {
    if (isExporting || recordingBlob == null || previewVideoRef.current == null || typeof MediaRecorder !== 'function') {
      return
    }

    const pixiCanvas = getVisualizerCanvas(audioWaveformCanvasRef.current)
    if (pixiCanvas == null) {
      console.warn('Unable to export camera composite because the visualizer canvas was not found.')
      return
    }

    setIsExporting(true)

    try {
      await compositeExport(
        recordingBlob,
        pixiCanvas,
        `${loadedPieceName}_recording`,
        {
          crop: {
            bottom: cropBottom,
            left: cropLeft,
            right: cropRight,
            top: cropTop,
          },
          onAfterExportStop: () => {
            resetPlaybackToStart()
          },
          onBeforeExportStart: async (exportVideo) => {
            playbackEngine.seek(0)
            playbackEngine.playWithPreRoll(CAMERA_MODE_PRE_ROLL_SECONDS)
            await exportVideo.play()
          },
        },
      )
      setIsExporting(false)
    } catch (error) {
      resetPlaybackToStart()
      setIsExporting(false)
      console.warn('Unable to export camera composite.', error)
    }
  }

  const startMouseDrag = (
    event: React.MouseEvent<HTMLElement>,
    onMove: (deltaX: number) => void,
    onEnd?: () => void,
  ) => {
    event.preventDefault()
    const startX = event.clientX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onMove(moveEvent.clientX - startX)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      onEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const beginTrackOffsetDrag = (track: TrackKey, event: React.MouseEvent<HTMLDivElement>) => {
    const startOffset = trackOffsets[track]
    setDraggingTrack(track)
    startMouseDrag(
      event,
      (deltaX) => {
        setTrackOffsets((previous) => ({
          ...previous,
          [track]: startOffset + deltaX,
        }))
      },
      () => {
        setDraggingTrack(null)
      },
    )
  }

  const beginTrimDrag = (
    track: TrackKey,
    side: 'start' | 'end',
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.stopPropagation()
    const barAreaWidth = barAreaRefs.current[track]?.clientWidth ?? 0
    const startTrim = trackTrims[track].start
    const endTrim = trackTrims[track].end
    setDraggingTrim({ side, track })
    startMouseDrag(
      event,
      (deltaX) => {
        setTrackTrims((previous) => {
          const currentTrim = previous[track]

          if (side === 'start') {
            const nextStart = clamp(
              startTrim + deltaX,
              0,
              Math.max(0, barAreaWidth - endTrim - MIN_TRACK_BAR_WIDTH_PX),
            )
            return {
              ...previous,
              [track]: {
                ...currentTrim,
                start: nextStart,
              },
            }
          }

          const nextEnd = clamp(
            endTrim - deltaX,
            0,
            Math.max(0, barAreaWidth - startTrim - MIN_TRACK_BAR_WIDTH_PX),
          )
          return {
            ...previous,
            [track]: {
              ...currentTrim,
              end: nextEnd,
            },
          }
        })
      },
      () => {
        setDraggingTrim(null)
      },
    )
  }

  const renderTrackRow = (track: TrackKey) => {
    const trims = trackTrims[track]
    const isOffsetDragging = draggingTrack === track
    const isStartTrimDragging = draggingTrim?.track === track && draggingTrim.side === 'start'
    const isEndTrimDragging = draggingTrim?.track === track && draggingTrim.side === 'end'
    const contentStyle = {
      left: `${trims.start}px`,
      right: `${trims.end}px`,
      transform: `translateX(${trackOffsets[track]}px)`,
    }

    return (
      <div
        key={track}
        className={styles.timelineRow}
        data-testid={`camera-track-row-${track}`}
      >
        <div className={styles.trackLabelColumn}>
          <span className={styles.trackLabel}>{getTrackLabel(track)}</span>
        </div>
        <div
          ref={(node) => {
            barAreaRefs.current[track] = node
          }}
          className={styles.trackBarArea}
          data-testid={`camera-track-bar-area-${track}`}
        >
          <div
            className={`${styles.trackBarContent} ${isOffsetDragging ? styles.trackDragging : ''}`}
            data-testid={`camera-track-content-${track}`}
            style={contentStyle}
            onMouseDown={(event) => {
              beginTrackOffsetDrag(track, event)
            }}
          >
            {track === 'audio' ? (
              <canvas
                ref={setAudioWaveformCanvas}
                className={styles.waveformCanvas}
                data-testid="camera-audio-waveform"
              />
            ) : (
              <div
                className={track === 'video' ? styles.videoBar : styles.visualizationBar}
                data-testid={`camera-track-fill-${track}`}
              />
            )}
            <div
              className={`${styles.trimHandle} ${styles.trimHandleStart} ${isStartTrimDragging ? styles.trimHandleDragging : ''}`}
              data-testid={`camera-track-handle-start-${track}`}
              onMouseDown={(event) => {
                beginTrimDrag(track, 'start', event)
              }}
            />
            <div
              className={`${styles.trimHandle} ${styles.trimHandleEnd} ${isEndTrimDragging ? styles.trimHandleDragging : ''}`}
              data-testid={`camera-track-handle-end-${track}`}
              onMouseDown={(event) => {
                beginTrimDrag(track, 'end', event)
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  const handlePreviewScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    const previewVideo = previewVideoRef.current
    if (previewVideo == null || !previewMode) {
      return
    }

    const nextTime = Number(event.target.value)
    previewVideo.currentTime = nextTime
    setPreviewCurrentTime(nextTime)
    syncPlaybackToPreviewTime(nextTime, isPreviewPlaying)
  }

  return (
    <section className={styles.cameraModeContainer} data-testid="camera-mode">
      <div
        className={styles.webcamSlot}
        data-testid="camera-mode-slot"
      >
        <div className={styles.videoSection} data-testid="camera-mode-video-section">
          {previewMode ? (
            <div className={styles.cropViewport} data-testid="camera-mode-crop-viewport">
              <div
                className={styles.cropFrame}
                data-testid="camera-mode-crop-frame"
                style={cropFrameStyle}
              >
                <video
                  ref={previewVideoRef}
                  className={styles.webcamVideo}
                  data-testid="camera-mode-preview-video"
                  controls={false}
                  loop={false}
                />
              </div>
            </div>
          ) : (
            <div className={styles.cropViewport} data-testid="camera-mode-crop-viewport">
              <div
                className={styles.cropFrame}
                data-testid="camera-mode-crop-frame"
                style={cropFrameStyle}
              >
                <video
                  ref={videoRef}
                  className={styles.webcamVideo}
                  data-testid="camera-mode-video"
                  autoPlay
                  muted
                  playsInline
                />
              </div>
            </div>
          )}

          {alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c' ? (
            <div
              aria-hidden="true"
              className={styles.alignClickOverlay}
              data-testid="camera-align-click-overlay"
              onClick={onAlignClick}
            />
          ) : null}

          {cameraStatus === 'loading' ? (
            <div className={styles.overlayMessage} data-testid="camera-loading-state">
              Requesting camera access...
            </div>
          ) : null}

          {cameraStatus === 'error' ? (
            <div className={styles.overlayMessage} data-testid="camera-error-state">
              Camera unavailable - check permissions
            </div>
          ) : null}

          {countdownValue !== null ? (
            <div className={styles.countdown} data-testid="camera-countdown">
              {countdownValue}
            </div>
          ) : null}
        </div>
      </div>

      {isTimelineVisible ? (
        <div
          className={styles.timeline}
          data-testid="camera-mode-timeline"
        >
          {TRACK_KEYS.map(renderTrackRow)}
        </div>
      ) : null}

      <div
        className={styles.overlayBar}
        data-testid="camera-control-bar"
        style={{ pointerEvents: alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c' ? 'none' : 'auto' }}
      >
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Back"
          disabled={isExporting || isRecording || countdownValue !== null}
          onClick={() => {
            previewVideoRef.current?.pause()
            playbackEngine.pause()
            setAppMode('create')
            setActiveSecondBarTab('pieces')
          }}
        >
          ←
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
          aria-pressed={isPreviewPlaying}
          disabled={isExporting || !previewMode || isRecording || countdownValue !== null}
          onClick={() => {
            void togglePreviewPlayback()
          }}
        >
          {isPreviewPlaying ? '⏸' : '▶'}
        </button>

        <input
          aria-label="Preview scrubber"
          className={styles.scrubber}
          type="range"
          min="0"
          max={previewDuration || 0}
          step="0.01"
          value={Math.min(previewCurrentTime, previewDuration || 0)}
          disabled={!previewMode}
          onChange={handlePreviewScrub}
        />

        <span className={styles.timeDisplay}>
          {formatClock(previewCurrentTime)} / {formatClock(previewDuration)}
        </span>

        <button
          type="button"
          className={`${styles.controlButton} ${styles.recordButton} ${isRecording ? styles.recordButtonActive : ''}`}
          aria-label={countdownValue !== null ? 'Recording countdown' : isRecording ? 'Stop recording' : 'Start recording'}
          aria-pressed={isRecording}
          disabled={isExporting || countdownValue !== null}
          onClick={handleRecordToggle}
        >
          {countdownValue !== null ? countdownValue : isRecording ? '●' : '○'}
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label={midiMuted ? 'Unmute MIDI' : 'Mute MIDI'}
          aria-pressed={midiMuted}
          disabled={isExporting}
          onClick={() => {
            setMidiMuted((previous) => !previous)
          }}
          title={midiMuted ? 'Unmute MIDI' : 'Mute MIDI'}
        >
          {midiMuted ? '🔇' : '🎹'}
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label="Track"
          aria-pressed={isTimelineVisible}
          disabled={isExporting || !hasRecording}
          onClick={() => {
            onTimelineVisibilityChange(!isTimelineVisible)
          }}
        >
          TRACK
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label={isExporting ? 'Exporting' : 'Export'}
          disabled={isExporting || !hasRecording}
          onClick={handleExport}
        >
          {isExporting ? 'EXPORTING...' : 'EXPORT'}
        </button>
      </div>
    </section>
  )
}

function stopMediaStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => {
    track.stop()
  })
}

function clearCountdownTimeouts(timeoutIds: Array<ReturnType<typeof globalThis.setTimeout>>) {
  timeoutIds.forEach((timeoutId) => {
    globalThis.clearTimeout(timeoutId)
  })
  timeoutIds.length = 0
}

function revokePreviewUrl(previewUrl: null | string) {
  if (previewUrl == null) {
    return
  }

  URL.revokeObjectURL(previewUrl)
}

function resetPlaybackToStart() {
  try {
    playbackEngine.pause()
    playbackEngine.seek(0)
  } catch (error) {
    console.warn('Unable to reset playback after camera recording.', error)
  }
}

function getVisualizerCanvas(
  excludedCanvas: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const preferredCanvas = document.querySelector('[data-testid="canvas-area"] canvas')
  if (preferredCanvas instanceof HTMLCanvasElement && preferredCanvas !== excludedCanvas) {
    return preferredCanvas
  }

  return Array.from(document.querySelectorAll('canvas')).find((canvas) => {
    return canvas !== excludedCanvas
  }) ?? null
}

async function drawWaveform(blob: Blob, canvas: HTMLCanvasElement): Promise<void> {
  if (blob.size === 0) {
    console.warn('drawWaveform: blob is empty, skipping')
    drawFallbackWaveform(canvas)
    return
  }

  const context = canvas.getContext('2d')
  if (context == null) {
    return
  }

  const width = Math.max(1, canvas.clientWidth)
  const height = Math.max(1, canvas.clientHeight)
  canvas.width = width
  canvas.height = height

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const audioContext = new AudioContext()
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      const data = audioBuffer.getChannelData(0)
      const step = Math.max(1, Math.ceil(data.length / width))

      context.clearRect(0, 0, width, height)
      context.strokeStyle = '#2e65a2'
      context.lineWidth = 1
      context.beginPath()

      for (let x = 0; x < width; x += 1) {
        const start = x * step
        const end = Math.min(data.length, start + step)
        let max = 0

        for (let index = start; index < end; index += 1) {
          const sample = Math.abs(data[index] ?? 0)
          if (sample > max) {
            max = sample
          }
        }

        const amplitude = max * (height / 2)
        const centerY = height / 2
        if (x === 0) {
          context.moveTo(x, centerY - amplitude)
        } else {
          context.lineTo(x, centerY - amplitude)
        }
      }

      context.stroke()
    } finally {
      await audioContext.close()
    }
  } catch (error) {
    console.warn('drawWaveform: failed to decode audio:', error)
    drawFallbackWaveform(canvas)
  }
}

function drawFallbackWaveform(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (context == null) {
    return
  }

  const width = Math.max(1, canvas.width || canvas.clientWidth)
  const height = Math.max(1, canvas.height || canvas.clientHeight)
  canvas.width = width
  canvas.height = height
  context.clearRect(0, 0, width, height)
  context.strokeStyle = '#2e65a2'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(0, height / 2)
  context.lineTo(width, height / 2)
  context.stroke()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatClock(value: number): string {
  const normalizedValue = Number.isFinite(value) && value > 0 ? value : 0
  const totalSeconds = Math.floor(normalizedValue)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getTrackLabel(track: TrackKey): string {
  switch (track) {
    case 'audio':
      return 'AUDIO'
    case 'video':
      return 'VIDEO'
    case 'visualization':
      return 'VISUAL'
  }
}
