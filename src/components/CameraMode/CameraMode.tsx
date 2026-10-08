import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Circle, Download, Pause, Play, Rows3, Square } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { audioScheduler } from '../../audio/AudioScheduler'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { useAppStore } from '../../store/store'
import { probeBlobDuration } from '../../utils/blobDuration'
import { CameraExportSheet } from './CameraExportSheet'
import { RecordingTimelineEditor } from '../RecordingTimelineEditor/RecordingTimelineEditor'
import { useCameraAlignment } from '../shared/useCameraAlignment'
import { useCountdown } from '../shared/useCountdown'
import { useMediaRecording } from '../shared/useMediaRecording'
import { createRecordingMediaRecorder } from '../shared/mediaRecorderMimeType'
import { usePreviewPlayback } from '../shared/usePreviewPlayback'
import { useRecordingTimeline } from '../shared/useRecordingTimeline'
import { useRecordingTimelineReview } from '../shared/useRecordingTimelineReview'
import styles from './CameraMode.module.css'

const CAMERA_MODE_PRE_ROLL_SECONDS = 3
export const CAMERA_MODE_TIMELINE_HEIGHT_PX = 230

// Browser defaults commonly select a 640px camera feed. Camera Mode exports
// the native recording, so request a high-quality feed while keeping these as
// ideals (rather than hard requirements) for older webcams.
const PREFERRED_CAMERA_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  frameRate: { ideal: 60 },
  height: { ideal: 1080 },
  width: { ideal: 1920 },
}

type CameraStatus = 'loading' | 'ready' | 'error'
export type CameraModePhase = 'setup' | 'countdown' | 'recording' | 'review'

interface CameraModeProps {
  isTimelineVisible: boolean
  onAlignClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onOpenExportSheet?(): void
  onPhaseChange?(phase: CameraModePhase): void
  onSourceVideoDimensionsChange?(dimensions: { height: number; width: number } | null): void
  onTimelineVisibilityChange: (visible: boolean) => void
}

export function CameraMode({
  isTimelineVisible,
  onAlignClick,
  onOpenExportSheet,
  onPhaseChange,
  onSourceVideoDimensionsChange,
  onTimelineVisibilityChange,
}: CameraModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef(false)
  const isRecordingRef = useRef(false)
  const phaseRef = useRef<CameraModePhase>('setup')
  const recordingDurationRef = useRef<number | null>(null)
  const timelineVisibleRef = useRef(false)
  const animationFrameRef = useRef<number | null>(null)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('loading')
  const [phase, setPhase] = useState<CameraModePhase>('setup')
  const [midiMuted, setMidiMuted] = useState(false)
  const [cameraAudioMuted, setCameraAudioMuted] = useState(false)
  const [hasCameraAudio, setHasCameraAudio] = useState(false)
  const [nativeVideoDimensions, setNativeVideoDimensions] = useState<{ height: number; width: number } | null>(null)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState<number | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportSheetOpen, setIsExportSheetOpen] = useState(false)
  const currentPieceId = useAppStore((state) => state.currentPieceId)
  const isProjectLoaded = useAppStore((state) => state.isProjectLoaded)
  const pieces = useAppStore((state) => state.pieces)
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const setErrorMessage = useAppStore((state) => state.setErrorMessage)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setActiveSecondBarTab = useAppStore((state) => state.setActiveSecondBarTab)
  const {
    cropFrameStyle,
    feedOrientationStyle,
    cameraOverlay,
    isAlignmentActive,
    setPreviewViewportElement,
  } = useCameraAlignment(nativeVideoDimensions)
  const { clearCountdown, countdownValue, setCountdownValue, waitForCountdownStep } = useCountdown()
  const { mediaRecorderRef, recordingChunksRef, stopMediaStream } = useMediaRecording()
  const recordingTimeline = useRecordingTimeline()
  const { syncReviewTimeline } = useRecordingTimelineReview({
    preRollSeconds: CAMERA_MODE_PRE_ROLL_SECONDS,
    precomputedTempoMap,
    timeline: recordingTimeline.timeline,
  })
  const {
    clearPreviewSource,
    handlePreviewScrub,
    isPreviewPlaying,
    pausePreview,
    previewCurrentTime,
    previewDuration,
    resetPreviewState,
    setPreviewSource,
    togglePreviewPlayback,
  } = usePreviewPlayback({
    active: phase === 'review',
    onBeforePlay: async () => {
      if (midiMuted) {
        return
      }

      try {
        // Reuse the exact sampler warm-up path Camera Mode uses when a
        // recording begins. Review only needs to make that same source
        // audible again; it does not need a separate audio pipeline.
        await audioScheduler.warmUp()
        audioScheduler.setMuted(false)
      } catch (error) {
        console.warn('Unable to prepare MIDI audio for camera preview.', error)
        setErrorMessage('MIDI audio could not be enabled for camera review.')
      }
    },
    onResetPlayback: resetPlaybackToStart,
    playErrorMessage: 'Unable to play camera preview.',
    precomputedTempoMap,
    preRollSeconds: CAMERA_MODE_PRE_ROLL_SECONDS,
    previewVideoRef,
    syncTimelinePlayback: syncReviewTimeline,
    syncUnavailableMessage: 'togglePreviewPlayback: no project loaded, skipping visualizer sync',
  })

  const loadedPieceName = pieces.find((piece) => piece.id === currentPieceId)?.name ?? 'piece'
  const hasRecording = recordingBlob != null
  const isCapturing = phase === 'countdown' || phase === 'recording'
  const isSetup = phase === 'setup'
  const isReview = phase === 'review'
  timelineVisibleRef.current = isTimelineVisible
  phaseRef.current = phase

  const captureRecordingDuration = useCallback(async (blob: Blob): Promise<number | null> => {
    try {
      const duration = await probeBlobDuration(blob)
      recordingDurationRef.current = duration
      if (isMountedRef.current) {
        setRecordingDurationSeconds(duration)
      }
      console.info(
        duration == null
          ? '[Camera Mode] Recorded Blob duration is unavailable.'
          : `[Camera Mode] Recorded Blob duration: ${duration.toFixed(3)}s.`,
      )
      return duration
    } catch (error) {
      recordingDurationRef.current = null
      if (isMountedRef.current) {
        setRecordingDurationSeconds(null)
      }
      console.warn('Unable to probe recorded Blob duration.', error)
      return null
    }
  }, [])

  useEffect(() => {
    onPhaseChange?.(phase)
  }, [onPhaseChange, phase])

  useEffect(() => {
    isMountedRef.current = true

    playbackEngine.pause()
    playbackEngine.seek(0)

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
    if (!isReview) {
      return
    }

    syncReviewTimeline(previewVideoRef.current?.currentTime ?? 0, isPreviewPlaying, true)
  }, [isPreviewPlaying, isReview, syncReviewTimeline])

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    clearCountdown()

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
    }
  }, [clearCountdown, mediaRecorderRef, setCountdownValue])

  useEffect(() => {
    let cancelled = false
    const videoElement = videoRef.current

    const startVideoStream = async () => {
      setCameraStatus('loading')

      try {
        if (navigator.mediaDevices?.getUserMedia == null) {
          throw new Error('Camera API unavailable')
        }

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: PREFERRED_CAMERA_VIDEO_CONSTRAINTS,
          })
        } catch (audioRequestError) {
          // A microphone should enrich Camera Mode, not make the entire
          // visual/video workflow unavailable. Retry without it when the
          // combined request is denied or the input is busy.
          console.warn('Camera microphone unavailable; continuing with video only.', audioRequestError)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: PREFERRED_CAMERA_VIDEO_CONSTRAINTS,
          })
        }

        if (cancelled) {
          stopMediaStream(stream)
          return
        }

        streamRef.current = stream
        setHasCameraAudio(getAudioTrackCount(stream) > 0)

        if (videoElement == null) {
          stopMediaStream(stream)
          return
        }

        videoElement.srcObject = stream
        await videoElement.play()

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
      clearCountdown()
      stopRecording()
      pausePreview()
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      clearPreviewSource()
      if (videoElement != null) {
        videoElement.srcObject = null
      }
      if (streamRef.current != null) {
        stopMediaStream(streamRef.current)
        streamRef.current = null
      }
    }
  }, [clearCountdown, clearPreviewSource, pausePreview, stopMediaStream, stopRecording])

  useEffect(() => {
    const handlePlaybackEnded = () => {
      const state = useAppStore.getState()
      const reachedProjectEnd =
        state.projectData != null &&
        state.currentTick >= state.projectData.totalTicks
      // The recorder already exists during countdown. A playback completion in
      // that pre-roll must not turn the three-second countdown into a capture
      // duration limit.
      if (isRecordingRef.current && phaseRef.current === 'recording' && reachedProjectEnd) {
        stopRecording()
      }
    }

    playbackEngine.on('onEnded', handlePlaybackEnded)

    return () => {
      playbackEngine.off('onEnded', handlePlaybackEnded)
    }
  }, [stopRecording])

  const startCountdown = async () => {
    if (countdownValue != null || isRecordingRef.current || !isProjectLoaded) {
      return
    }

    const webcamStream = streamRef.current
    if (webcamStream == null || typeof MediaRecorder !== 'function') {
      return
    }

    recordingChunksRef.current = []
    recordingDurationRef.current = null
    setRecordingDurationSeconds(null)
    recordingTimeline.resetTimeline()
    setPhase('countdown')
    resetPreviewState()
    setRecordingBlob(null)
    clearPreviewSource()
    if (timelineVisibleRef.current) {
      onTimelineVisibilityChange(false)
    }

    // Camera Mode is video + MIDI sound only. Keep the existing piano sampler
    // audible through the countdown and live recording.
    audioScheduler.setMuted(false)
    setMidiMuted(false)

    const mediaRecorder = createRecordingMediaRecorder(webcamStream)

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data != null && event.data.size > 0) {
        recordingChunksRef.current.push(event.data)
      }
    }

    mediaRecorder.onerror = () => {
      console.warn('Camera recorder failed.')
      if (isMountedRef.current) {
        setCameraStatus('error')
      }
    }

    mediaRecorder.onstop = () => {
      if (recordingChunksRef.current.length === 0) {
        mediaRecorderRef.current = null
        isRecordingRef.current = false
        if (isMountedRef.current) {
          setCameraStatus('error')
          setPhase('setup')
        }
        return
      }

      const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
      const previewObjectUrl = URL.createObjectURL(blob)
      setPreviewSource(previewObjectUrl)
      void captureRecordingDuration(blob)
      if (streamRef.current != null) {
        stopMediaStream(streamRef.current)
        streamRef.current = null
      }
      if (videoRef.current != null) {
        videoRef.current.srcObject = null
      }
      audioScheduler.setMuted(false)
      setMidiMuted(false)
      if (isMountedRef.current) {
        setRecordingBlob(blob)
        setPhase('review')
        setActiveSecondBarTab('camera')
        resetPreviewState()
      }
      mediaRecorderRef.current = null
    }

    mediaRecorderRef.current = mediaRecorder
    isRecordingRef.current = true
    mediaRecorder.start()

    try {
      playbackEngine.seek(0)
      playbackEngine.playWithPreRoll(CAMERA_MODE_PRE_ROLL_SECONDS)
      audioScheduler.seek(playbackEngine.getCurrentTick())
      audioScheduler.start()
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
    setPhase('recording')
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
      try {
        await startCountdown()
      } catch (error) {
        console.warn('Unable to start camera recording.', error)
        setCameraStatus('error')
        setPhase('setup')
      }
    })()
  }

  const handleLiveVideoMetadata = () => {
    const video = videoRef.current
    if (video == null || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return
    }

    const dimensions = { height: video.videoHeight, width: video.videoWidth }
    setNativeVideoDimensions(dimensions)
    onSourceVideoDimensionsChange?.(dimensions)
  }

  const handleExport = () => {
    if (isExporting || recordingBlob == null) {
      return
    }

    setIsExportSheetOpen(true)
    onOpenExportSheet?.()
  }

  return (
    <section className={styles.cameraModeContainer} data-testid="camera-mode">
      <div
        className={styles.webcamSlot}
        data-testid="camera-mode-slot"
      >
        <div className={styles.videoSection} data-testid="camera-mode-video-section">
          {isReview ? (
            <div ref={setPreviewViewportElement} className={styles.cropViewport} data-testid="camera-mode-crop-viewport">
              <div className={styles.feedOrientation} data-testid="camera-mode-feed-orientation" style={feedOrientationStyle}>
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
                    muted={cameraAudioMuted}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={setPreviewViewportElement}
              className={styles.cropViewport}
              data-testid={isSetup ? 'camera-mode-setup-crop-viewport' : 'camera-mode-crop-viewport'}
            >
              <div className={styles.feedOrientation} data-testid="camera-mode-feed-orientation" style={feedOrientationStyle}>
                <div
                  className={styles.cropFrame}
                  data-testid={isSetup ? 'camera-mode-setup-crop-frame' : 'camera-mode-crop-frame'}
                  style={cropFrameStyle}
                >
                  <video
                    ref={videoRef}
                    className={styles.webcamVideo}
                    data-testid="camera-mode-video"
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={handleLiveVideoMetadata}
                  />
                </div>
              </div>
            </div>
          )}

          {isAlignmentActive ? (
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
          <RecordingTimelineEditor
            cameraAudioLinked
            hasCameraAudio={hasCameraAudio}
            isCameraAudioEnabled={!cameraAudioMuted}
            isMidiAudioEnabled={!midiMuted}
            readOnly={!isReview}
            onCameraAudioEnabledChange={(enabled) => setCameraAudioMuted(!enabled)}
            onMidiAudioEnabledChange={(enabled) => setMidiMuted(!enabled)}
            timeline={recordingTimeline.timeline}
            onReset={recordingTimeline.resetTimeline}
            onTrackOffsetChange={recordingTimeline.setTrackStartOffsetMs}
          />
        </div>
      ) : null}

      <div
        className={styles.overlayBar}
        data-testid="camera-control-bar"
        style={{ pointerEvents: isAlignmentActive ? 'none' : 'auto' }}
      >
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Back"
          disabled={isExporting || isCapturing || countdownValue !== null}
          onClick={() => {
            previewVideoRef.current?.pause()
            playbackEngine.pause()
            setAppMode('create')
            setActiveSecondBarTab('pieces')
          }}
        >
          <AppIcon icon={ArrowLeft} size={20} />
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
          aria-pressed={isPreviewPlaying}
          disabled={isExporting || !isReview || isCapturing || countdownValue !== null}
          onClick={() => {
            void togglePreviewPlayback()
          }}
        >
          <AppIcon icon={isPreviewPlaying ? Pause : Play} size={20} />
        </button>

        <input
          aria-label="Preview scrubber"
          className={styles.scrubber}
          type="range"
          min="0"
          max={previewDuration || 0}
          step="0.01"
          value={Math.min(previewCurrentTime, previewDuration || 0)}
          disabled={!isReview}
          onChange={handlePreviewScrub}
        />

        <span className={styles.timeDisplay}>
          {formatClock(previewCurrentTime)} / {formatClock(previewDuration)}
        </span>

        <button
          type="button"
          className={`${styles.controlButton} ${styles.recordButton} ${isCapturing ? styles.recordButtonActive : ''}`}
          aria-label={countdownValue !== null ? 'Recording countdown' : isCapturing ? 'Stop recording' : 'Start recording'}
          aria-pressed={isCapturing}
          disabled={isExporting || !isProjectLoaded || countdownValue !== null || (!isSetup && !isCapturing)}
          title={!isProjectLoaded ? 'Load a MIDI piece before recording in Camera Mode.' : undefined}
          onClick={handleRecordToggle}
        >
          {countdownValue !== null ? countdownValue : isSetup ? 'Begin Recording' : <AppIcon icon={isCapturing ? Square : Circle} size={24} />}
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label="Timeline"
          aria-pressed={isTimelineVisible}
          disabled={isExporting || !hasRecording}
          onClick={() => {
            onTimelineVisibilityChange(!isTimelineVisible)
          }}
        >
          <AppIcon icon={Rows3} size={20} />
        </button>

        <button
          type="button"
          className={styles.controlButton}
          aria-label={isExporting ? 'Exporting' : 'Export'}
          disabled={isExporting || !hasRecording}
          onClick={handleExport}
        >
          <AppIcon icon={Download} size={20} />
        </button>
      </div>
      <CameraExportSheet
        cameraOverlay={cameraOverlay}
        hasCameraAudio={hasCameraAudio}
        isOpen={isExportSheetOpen}
        nativeVideoDimensions={nativeVideoDimensions}
        onClose={() => {
          setIsExportSheetOpen(false)
          resetPlaybackToStart()
        }}
        onExportingChange={setIsExporting}
        outputName={`${loadedPieceName}_recording`}
        preRollSeconds={CAMERA_MODE_PRE_ROLL_SECONDS}
        recordingBlob={recordingBlob}
        recordingDurationSeconds={recordingDurationSeconds ?? recordingDurationRef.current}
        timeline={recordingTimeline.timeline}
      />
    </section>
  )
}

function resetPlaybackToStart() {
  try {
    playbackEngine.pause()
    playbackEngine.seek(0)
  } catch (error) {
    console.warn('Unable to reset playback after camera recording.', error)
  }
}

function getAudioTrackCount(stream: MediaStream): number {
  return typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks().length : 0
}

function formatClock(value: number): string {
  const normalizedValue = Number.isFinite(value) && value > 0 ? value : 0
  const totalSeconds = Math.floor(normalizedValue)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
