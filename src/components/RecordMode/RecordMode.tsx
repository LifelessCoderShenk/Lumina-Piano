import React, { useEffect, useRef, useState } from 'react'

import { audioScheduler } from '../../audio/AudioScheduler'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { renderer } from '../../renderer/Renderer'
import { cameraOverlayInitial, useAppStore } from '../../store/store'
import { secondsToTick, tickToSeconds } from '../../tempo/tempoMap'
import { compositeExport } from '../../utils/compositeExport'
import { CanvasArea } from '../CanvasArea/CanvasArea'
import styles from './RecordMode.module.css'

interface MidiMessageEventLike {
  data?: ArrayLike<number> | null
}

interface MidiInputLike {
  id: string
  name?: string | null
  onmidimessage: ((event: MidiMessageEventLike) => void) | null
}

interface MidiInputCollectionLike {
  get(id: string): MidiInputLike | undefined
  values(): IterableIterator<MidiInputLike>
}

interface MidiAccessLike {
  inputs: MidiInputCollectionLike
}

type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: () => Promise<MidiAccessLike>
}

type CameraStatus = 'idle' | 'loading' | 'ready' | 'error'
type MidiTestStatus = 'idle' | 'pending' | 'success' | 'failure'
type RecordModePhase = 'setup' | 'countdown' | 'recording' | 'review'

const MIDI_TEST_TIMEOUT_MS = 5_000
const RECORD_MODE_PRE_ROLL_SECONDS = 3

export function RecordMode() {
  const setupPreviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const setupPreviewStreamRef = useRef<MediaStream | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const countdownTimeoutIdsRef = useRef<Array<ReturnType<typeof globalThis.setTimeout>>>([])
  const previewUrlRef = useRef<string | null>(null)
  const previewStartTimeRef = useRef(0)
  const isMountedRef = useRef(false)
  const midiAccessRef = useRef<MidiAccessLike | null>(null)
  const midiTestTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const midiTestCleanupRef = useRef<(() => void) | null>(null)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [midiDevices, setMidiDevices] = useState<Array<{ id: string; name: string }>>([])
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [midiTestStatus, setMidiTestStatus] = useState<MidiTestStatus>('idle')
  const [phase, setPhase] = useState<RecordModePhase>('setup')
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [midiMuted, setMidiMuted] = useState(false)
  const [isTrackVisible, setIsTrackVisible] = useState(false)
  const addPiece = useAppStore((state) => state.addPiece)
  const alignStep = useAppStore((state) => state.alignStep)
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const currentPieceId = useAppStore((state) => state.currentPieceId)
  const pieces = useAppStore((state) => state.pieces)
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const recordModeConfig = useAppStore((state) => state.recordModeConfig)
  const setAlignStep = useAppStore((state) => state.setAlignStep)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setCameraOverlay = useAppStore((state) => state.setCameraOverlay)
  const setHighCPoint = useAppStore((state) => state.setHighCPoint)
  const setLowAPoint = useAppStore((state) => state.setLowAPoint)
  const setRecordModeConfig = useAppStore((state) => state.setRecordModeConfig)
  const loadedPieceName = pieces.find((piece) => piece.id === currentPieceId)?.name ?? 'My Recording'
  const isSetup = phase === 'setup'
  const isLiveView = phase === 'countdown' || phase === 'recording'
  const isReview = phase === 'review'
  const hasRecording = recordingBlob != null
  const controlsDisabled = !hasRecording
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

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      clearCountdownTimeouts(countdownTimeoutIdsRef.current)
      clearMidiTest()
      resetPlaybackToStart()
      renderer.setKeyboardOpacity(1)
      revokePreviewUrl(previewUrlRef.current)
      stopMediaStream(setupPreviewStreamRef.current)
      stopMediaStream(recordingStreamRef.current)
      setupPreviewStreamRef.current = null
      recordingStreamRef.current = null
      if (setupPreviewVideoRef.current != null) {
        setupPreviewVideoRef.current.srcObject = null
      }
      if (liveVideoRef.current != null) {
        liveVideoRef.current.srcObject = null
      }
      if (reviewVideoRef.current != null) {
        reviewVideoRef.current.pause()
      }
      audioScheduler.setMuted(false)
    }
  }, [])

  useEffect(() => {
    audioScheduler.setMuted(midiMuted)

    return () => {
      audioScheduler.setMuted(false)
    }
  }, [midiMuted])

  useEffect(() => {
    let cancelled = false

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.()
        if (cancelled || devices == null) {
          return
        }

        setAudioDevices(devices.filter((device) => device.kind === 'audioinput'))
        setCameraDevices(devices.filter((device) => device.kind === 'videoinput'))
      } catch (error) {
        console.warn('Unable to enumerate media devices for Record Mode.', error)
      }
    }

    void loadDevices()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadMidiDevices = async () => {
      const midiNavigator = navigator as NavigatorWithMidi
      if (typeof midiNavigator.requestMIDIAccess !== 'function') {
        setMidiDevices([])
        return
      }

      try {
        const midiAccess = await midiNavigator.requestMIDIAccess()
        if (cancelled) {
          return
        }

        midiAccessRef.current = midiAccess
        setMidiDevices(
          Array.from(midiAccess.inputs.values()).map((input) => ({
            id: input.id,
            name: input.name?.trim() || 'Unknown MIDI Device',
          })),
        )
      } catch (error) {
        console.warn('Unable to enumerate MIDI devices for Record Mode.', error)
        if (!cancelled) {
          setMidiDevices([])
        }
      }
    }

    void loadMidiDevices()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isSetup) {
      stopMediaStream(setupPreviewStreamRef.current)
      setupPreviewStreamRef.current = null
      if (setupPreviewVideoRef.current != null) {
        setupPreviewVideoRef.current.srcObject = null
      }
      return
    }

    let cancelled = false

    const startPreview = async () => {
      stopMediaStream(setupPreviewStreamRef.current)
      setupPreviewStreamRef.current = null

      if (recordModeConfig.cameraDeviceId == null || recordModeConfig.cameraDeviceId.length === 0) {
        setCameraStatus('idle')
        if (setupPreviewVideoRef.current != null) {
          setupPreviewVideoRef.current.srcObject = null
        }
        return
      }

      setCameraStatus('loading')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: {
              exact: recordModeConfig.cameraDeviceId,
            },
          },
        })

        if (cancelled) {
          stopMediaStream(stream)
          return
        }

        setupPreviewStreamRef.current = stream

        if (setupPreviewVideoRef.current == null) {
          stopMediaStream(stream)
          return
        }

        setupPreviewVideoRef.current.srcObject = stream
        await setupPreviewVideoRef.current.play()

        if (!cancelled && isMountedRef.current) {
          setCameraStatus('ready')
        }
      } catch (error) {
        console.warn('Unable to start Record Mode camera preview.', error)
        if (!cancelled && isMountedRef.current) {
          setCameraStatus('error')
        }
      }
    }

    void startPreview()

    return () => {
      cancelled = true
      stopMediaStream(setupPreviewStreamRef.current)
      setupPreviewStreamRef.current = null
      if (setupPreviewVideoRef.current != null) {
        setupPreviewVideoRef.current.srcObject = null
      }
    }
  }, [isSetup, recordModeConfig.cameraDeviceId])

  useEffect(() => {
    if (!isLiveView || liveVideoRef.current == null || recordingStreamRef.current == null) {
      return
    }

    let cancelled = false

    const attachLiveStream = async () => {
      try {
        liveVideoRef.current!.srcObject = recordingStreamRef.current
        await liveVideoRef.current!.play()
        if (!cancelled && isMountedRef.current) {
          setCameraStatus('ready')
        }
      } catch (error) {
        console.warn('Unable to start live recording preview.', error)
        if (!cancelled && isMountedRef.current) {
          setCameraStatus('error')
        }
      }
    }

    void attachLiveStream()

    return () => {
      cancelled = true
    }
  }, [isLiveView])

  useEffect(() => {
    if (!isReview || previewUrl == null || reviewVideoRef.current == null) {
      return
    }

    const reviewVideo = reviewVideoRef.current
    reviewVideo.src = previewUrl
    if (typeof reviewVideo.load === 'function') {
      reviewVideo.load()
    }

    const handleTimeUpdate = () => {
      setPreviewCurrentTime(reviewVideo.currentTime)

      if (precomputedTempoMap == null) {
        return
      }

      const videoTime = reviewVideo.currentTime
      if (videoTime < RECORD_MODE_PRE_ROLL_SECONDS) {
        return
      }

      const elapsedSincePreviewStart = performance.now() - previewStartTimeRef.current
      if (elapsedSincePreviewStart < 2000) {
        return
      }

      const currentEngineSeconds = tickToSeconds(playbackEngine.getCurrentTick(), precomputedTempoMap)
      const engineTimeWithPreRoll = currentEngineSeconds + RECORD_MODE_PRE_ROLL_SECONDS
      if (Math.abs(videoTime - engineTimeWithPreRoll) > 0.3) {
        playbackEngine.seek(
          secondsToTick(
            Math.max(0, videoTime - RECORD_MODE_PRE_ROLL_SECONDS),
            precomputedTempoMap,
          ),
        )
      }
    }

    const handleEnded = () => {
      setIsPreviewPlaying(false)
      reviewVideo.currentTime = 0
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
      setPreviewDuration(Number.isFinite(reviewVideo.duration) ? reviewVideo.duration : 0)
      setPreviewCurrentTime(reviewVideo.currentTime)
    }

    reviewVideo.addEventListener('timeupdate', handleTimeUpdate)
    reviewVideo.addEventListener('ended', handleEnded)
    reviewVideo.addEventListener('pause', handlePause)
    reviewVideo.addEventListener('play', handlePlay)
    reviewVideo.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      reviewVideo.removeEventListener('timeupdate', handleTimeUpdate)
      reviewVideo.removeEventListener('ended', handleEnded)
      reviewVideo.removeEventListener('pause', handlePause)
      reviewVideo.removeEventListener('play', handlePlay)
      reviewVideo.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [isReview, previewUrl, precomputedTempoMap])

  useEffect(() => {
    setMidiTestStatus('idle')
    clearMidiTest()
  }, [recordModeConfig.midiDeviceId])

  const handleMidiTest = () => {
    clearMidiTest()
    setMidiTestStatus('pending')

    const midiDeviceId = recordModeConfig.midiDeviceId
    const midiInput = midiDeviceId == null
      ? undefined
      : midiAccessRef.current?.inputs.get(midiDeviceId)

    if (midiInput == null) {
      setMidiTestStatus('failure')
      return
    }

    const previousHandler = midiInput.onmidimessage
    const cleanup = () => {
      if (midiInput.onmidimessage === handleMidiMessage) {
        midiInput.onmidimessage = previousHandler ?? null
      }
      if (midiTestTimeoutRef.current != null) {
        clearTimeout(midiTestTimeoutRef.current)
        midiTestTimeoutRef.current = null
      }
      midiTestCleanupRef.current = null
    }

    const handleMidiMessage = (event: MidiMessageEventLike) => {
      const data = event.data == null ? [] : Array.from(event.data)
      const status = data[0] ?? 0
      const velocity = data[2] ?? 0
      const messageType = status & 0xf0

      if (messageType === 0x90 && velocity > 0) {
        cleanup()
        setMidiTestStatus('success')
      }
    }

    midiInput.onmidimessage = handleMidiMessage
    midiTestCleanupRef.current = cleanup
    midiTestTimeoutRef.current = globalThis.setTimeout(() => {
      cleanup()
      setMidiTestStatus('failure')
    }, MIDI_TEST_TIMEOUT_MS)
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

  const startAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    renderer.setKeyboardOpacity(0.3)
    setAlignStep('waiting-low-a')
  }

  const cancelAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    setAlignStep('idle')
    renderer.setKeyboardOpacity(1)
  }

  const syncPlaybackToReviewTime = (videoTime: number, shouldPlay: boolean): boolean => {
    const state = useAppStore.getState()
    if (state.projectData == null || state.precomputedTempoMap == null) {
      return false
    }

    previewStartTimeRef.current = performance.now()

    if (videoTime < RECORD_MODE_PRE_ROLL_SECONDS) {
      playbackEngine.pause()
      playbackEngine.playWithPreRoll(RECORD_MODE_PRE_ROLL_SECONDS - videoTime)
      if (!shouldPlay) {
        playbackEngine.pause()
      }
      return true
    }

    const targetTick = secondsToTick(
      videoTime - RECORD_MODE_PRE_ROLL_SECONDS,
      state.precomputedTempoMap,
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
    const reviewVideo = reviewVideoRef.current
    if (reviewVideo == null) {
      return
    }

    if (isPreviewPlaying) {
      reviewVideo.pause()
      playbackEngine.pause()
      setIsPreviewPlaying(false)
      return
    }

    audioScheduler.setMuted(false)
    setMidiMuted(false)

    try {
      await reviewVideo.play()
      if (!syncPlaybackToReviewTime(reviewVideo.currentTime, true)) {
        setIsPreviewPlaying(true)
        return
      }

      setIsPreviewPlaying(true)
    } catch (error) {
      resetPlaybackToStart()
      console.warn('Unable to play Record Mode preview.', error)
    }
  }

  const beginRecording = async () => {
    if (
      !isSetup ||
      recordModeConfig.cameraDeviceId == null ||
      typeof MediaRecorder !== 'function' ||
      navigator.mediaDevices?.getUserMedia == null
    ) {
      return
    }

    clearCountdownTimeouts(countdownTimeoutIdsRef.current)
    clearMidiTest()
    cancelAlignment()
    setIsTrackVisible(false)
    setPreviewCurrentTime(0)
    setPreviewDuration(0)
    setIsPreviewPlaying(false)
    setRecordingBlob(null)
    setPreviewUrl(null)
    revokePreviewUrl(previewUrlRef.current)
    previewUrlRef.current = null
    stopMediaStream(setupPreviewStreamRef.current)
    setupPreviewStreamRef.current = null
    if (setupPreviewVideoRef.current != null) {
      setupPreviewVideoRef.current.srcObject = null
    }

    setCameraStatus('loading')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: recordModeConfig.useMic
          ? (
              recordModeConfig.audioSourceDeviceId == null || recordModeConfig.audioSourceDeviceId.length === 0
                ? true
                : {
                    deviceId: {
                      exact: recordModeConfig.audioSourceDeviceId,
                    },
                  }
            )
          : false,
        video: {
          deviceId: {
            exact: recordModeConfig.cameraDeviceId,
          },
        },
      })

      recordingStreamRef.current = stream
      recordingChunksRef.current = []
      setMidiMuted(true)
      setPhase('countdown')
      setCountdownValue(3)

      try {
        playbackEngine.seek(0)
        playbackEngine.playWithPreRoll(RECORD_MODE_PRE_ROLL_SECONDS)
      } catch (error) {
        console.warn('Unable to start playback for Record Mode countdown.', error)
      }

      try {
        await audioScheduler.warmUp()
      } catch (error) {
        console.warn('Unable to warm up audio for Record Mode countdown.', error)
      }

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

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      })

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data != null) {
          recordingChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
        const nextPreviewUrl = URL.createObjectURL(blob)
        previewUrlRef.current = nextPreviewUrl
        stopMediaStream(recordingStreamRef.current)
        recordingStreamRef.current = null
        if (liveVideoRef.current != null) {
          liveVideoRef.current.srcObject = null
        }
        audioScheduler.setMuted(false)
        if (isMountedRef.current) {
          setRecordingBlob(blob)
          setPreviewUrl(nextPreviewUrl)
          setPreviewCurrentTime(0)
          setPreviewDuration(0)
          setIsPreviewPlaying(false)
          setCountdownValue(null)
          setPhase('review')
        }
      }

      mediaRecorderRef.current = mediaRecorder
      setCountdownValue(null)
      setPhase('recording')
      mediaRecorder.start()
    } catch (error) {
      stopMediaStream(recordingStreamRef.current)
      recordingStreamRef.current = null
      setCountdownValue(null)
      setPhase('setup')
      setCameraStatus('error')
      audioScheduler.setMuted(false)
      setMidiMuted(false)
      console.warn('Unable to start Record Mode recording.', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current == null || mediaRecorderRef.current.state === 'inactive') {
      return
    }

    mediaRecorderRef.current.stop()
    mediaRecorderRef.current = null
    resetPlaybackToStart()
    audioScheduler.setMuted(false)
    setMidiMuted(false)
  }

  const resetToSetup = () => {
    cancelAlignment()
    clearCountdownTimeouts(countdownTimeoutIdsRef.current)
    resetPlaybackToStart()
    audioScheduler.setMuted(false)
    setMidiMuted(false)
    setCameraStatus('idle')
    setCountdownValue(null)
    setPhase('setup')
    setRecordingBlob(null)
    setPreviewCurrentTime(0)
    setPreviewDuration(0)
    setPreviewUrl(null)
    setIsPreviewPlaying(false)
    setIsTrackVisible(false)
    revokePreviewUrl(previewUrlRef.current)
    previewUrlRef.current = null
    if (reviewVideoRef.current != null) {
      reviewVideoRef.current.pause()
      reviewVideoRef.current.currentTime = 0
    }
    stopMediaStream(recordingStreamRef.current)
    recordingStreamRef.current = null
    if (liveVideoRef.current != null) {
      liveVideoRef.current.srcObject = null
    }
    setCameraOverlay({ ...cameraOverlayInitial })
  }

  const handleExport = async () => {
    if (isExporting || recordingBlob == null) {
      return
    }

    const pixiCanvas = getVisualizerCanvas()
    if (pixiCanvas == null) {
      console.warn('Unable to export Record Mode composite because the visualizer canvas was not found.')
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
            playbackEngine.playWithPreRoll(RECORD_MODE_PRE_ROLL_SECONDS)
            await exportVideo.play()
          },
        },
      )
      setIsExporting(false)

      const suggestedName = window.prompt('Name this piece:', 'My Recording')
      if (suggestedName != null) {
        const normalizedName = suggestedName.trim() || 'My Recording'
        addPiece({
          createdAt: Date.now(),
          filePath: null,
          id: globalThis.crypto?.randomUUID?.() ?? `piece-${Date.now()}`,
          name: normalizedName,
          type: 'recording',
        })
      }
    } catch (error) {
      setIsExporting(false)
      resetPlaybackToStart()
      console.warn('Unable to export Record Mode composite.', error)
    }
  }

  const handlePreviewScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    const reviewVideo = reviewVideoRef.current
    if (reviewVideo == null || !isReview) {
      return
    }

    const nextTime = Number(event.target.value)
    reviewVideo.currentTime = nextTime
    setPreviewCurrentTime(nextTime)
    syncPlaybackToReviewTime(nextTime, isPreviewPlaying)
  }

  return (
    <section className={styles.recordMode} data-testid="record-mode">
      {isSetup ? (
        <>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => {
              setAppMode('create')
            }}
          >
            ← Back
          </button>

          <div className={styles.content} data-testid="record-mode-content">
            <div className={styles.column} data-testid="record-mode-input-setup">
              <h2 className={styles.header}>INPUT SETUP</h2>

              <section className={styles.section}>
                <label className={styles.label} htmlFor="record-mode-audio-select">AUDIO</label>
                <select
                  id="record-mode-audio-select"
                  className={styles.select}
                  data-testid="record-mode-audio-select"
                  value={recordModeConfig.audioSourceDeviceId ?? ''}
                  onChange={(event) => {
                    setRecordModeConfig({
                      audioSourceDeviceId: event.target.value || null,
                    })
                  }}
                >
                  <option value="">Select audio input</option>
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || 'Unnamed audio input'}
                    </option>
                  ))}
                </select>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${recordModeConfig.useMidiAudio ? styles.toggleActive : ''}`}
                    aria-pressed={recordModeConfig.useMidiAudio}
                    onClick={() => {
                      setRecordModeConfig({ useMidiAudio: !recordModeConfig.useMidiAudio })
                    }}
                  >
                    MIDI AUDIO
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${recordModeConfig.useMic ? styles.toggleActive : ''}`}
                    aria-pressed={recordModeConfig.useMic}
                    onClick={() => {
                      setRecordModeConfig({ useMic: !recordModeConfig.useMic })
                    }}
                  >
                    MIC
                  </button>
                </div>
              </section>

              <section className={styles.section}>
                <label className={styles.label} htmlFor="record-mode-midi-select">MIDI</label>
                <div className={styles.inlineRow}>
                  <select
                    id="record-mode-midi-select"
                    className={styles.select}
                    data-testid="record-mode-midi-select"
                    value={recordModeConfig.midiDeviceId ?? ''}
                    onChange={(event) => {
                      setRecordModeConfig({
                        midiDeviceId: event.target.value || null,
                      })
                    }}
                  >
                    <option value="">Select MIDI input</option>
                    {midiDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.testButton}
                    onClick={handleMidiTest}
                  >
                    TEST
                  </button>
                </div>
                <span
                  className={`${styles.midiTestStatus} ${midiTestStatus === 'success'
                    ? styles.midiTestSuccess
                    : midiTestStatus === 'failure'
                      ? styles.midiTestFailure
                      : ''}`}
                  data-testid="record-mode-midi-test-status"
                >
                  {midiTestStatus === 'success'
                    ? '✓'
                    : midiTestStatus === 'failure'
                      ? '✕'
                      : midiTestStatus === 'pending'
                        ? '…'
                        : ''}
                </span>
              </section>

              <section className={styles.section}>
                <label className={styles.label} htmlFor="record-mode-camera-select">CAMERA</label>
                <select
                  id="record-mode-camera-select"
                  className={styles.select}
                  data-testid="record-mode-camera-select"
                  value={recordModeConfig.cameraDeviceId ?? ''}
                  onChange={(event) => {
                    setRecordModeConfig({
                      cameraDeviceId: event.target.value || null,
                    })
                  }}
                >
                  <option value="">Select camera input</option>
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || 'Unnamed camera'}
                    </option>
                  ))}
                </select>
                <div className={styles.cameraPreview}>
                  <video
                    ref={setupPreviewVideoRef}
                    autoPlay
                    className={styles.previewVideo}
                    data-testid="record-mode-camera-preview"
                    muted
                    playsInline
                  />
                  {cameraStatus === 'loading' ? (
                    <div className={styles.overlayMessage}>Requesting camera access...</div>
                  ) : null}
                  {cameraStatus === 'error' ? (
                    <div className={styles.overlayMessage}>Camera unavailable - check permissions</div>
                  ) : null}
                </div>
              </section>

              <button
                type="button"
                className={styles.recordButton}
                data-testid="record-mode-record-button"
                disabled={recordModeConfig.cameraDeviceId == null || isExporting}
                onClick={() => {
                  void beginRecording()
                }}
              >
                <span className={styles.recordDot} aria-hidden="true">●</span>
                <span>RECORD</span>
              </button>
            </div>

            <div className={styles.divider} data-testid="record-mode-divider" />

            <div className={styles.column} data-testid="record-mode-controls">
              <h2 className={styles.header}>CONTROLS</h2>
              {renderAdjustmentControls(true, 'record-mode-disabled-controls')}
              <p className={styles.disabledNote}>Controls activate after recording</p>
            </div>
          </div>
        </>
      ) : null}

      {isLiveView ? (
        <div className={styles.liveView} data-testid="record-mode-live-view">
          <video
            ref={liveVideoRef}
            autoPlay
            className={styles.liveVideo}
            data-testid="record-mode-live-video"
            muted
            playsInline
          />
          {cameraStatus === 'loading' ? (
            <div className={styles.overlayMessage}>Requesting camera access...</div>
          ) : null}
          {cameraStatus === 'error' ? (
            <div className={styles.overlayMessage}>Camera unavailable - check permissions</div>
          ) : null}
          {countdownValue !== null ? (
            <div className={styles.countdown} data-testid="record-mode-countdown">
              {countdownValue}
            </div>
          ) : null}
          {phase === 'recording' ? (
            <div className={styles.recordingIndicator} data-testid="record-mode-rec-indicator">
              <span className={styles.recordingPulse} aria-hidden="true" />
              <span>REC</span>
            </div>
          ) : null}
          {phase === 'recording' ? (
            <div className={styles.liveControlBar}>
              <button
                type="button"
                className={styles.stopButton}
                aria-label="Stop recording"
                onClick={stopRecording}
              >
                ■ STOP
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isReview ? (
        <div className={styles.reviewLayout} data-testid="record-mode-review-layout">
          <div
            className={styles.reviewVisualizer}
            data-testid="record-mode-review-visualizer"
            style={{ transform: `translate3d(0px, ${cameraOverlay.offsetY}px, 0)` }}
          >
            <CanvasArea />
          </div>

          <div className={styles.reviewVideoSlot} data-testid="record-mode-review-video-slot">
            <div className={styles.cropViewport} data-testid="record-mode-crop-viewport">
              <div
                className={styles.cropFrame}
                data-testid="record-mode-crop-frame"
                style={cropFrameStyle}
              >
                <video
                  ref={reviewVideoRef}
                  className={styles.reviewVideo}
                  data-testid="record-mode-review-video"
                  controls={false}
                  loop={false}
                />
              </div>
            </div>
          </div>

          <div className={styles.reviewControlsPanel} data-testid="record-mode-active-controls">
            {renderAdjustmentControls(false, 'record-mode-enabled-controls')}
          </div>

          <div className={styles.overlayBar} data-testid="record-mode-control-bar">
            <button
              type="button"
              className={styles.controlButton}
              aria-label="Back"
              disabled={isExporting}
              onClick={resetToSetup}
            >
              ←
            </button>

            <button
              type="button"
              className={styles.controlButton}
              aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
              aria-pressed={isPreviewPlaying}
              disabled={isExporting || !hasRecording}
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
              disabled={!hasRecording}
              onChange={handlePreviewScrub}
            />

            <span className={styles.timeDisplay}>
              {formatClock(previewCurrentTime)} / {formatClock(previewDuration)}
            </span>

            <button
              type="button"
              className={styles.controlButton}
              aria-label="Re-record"
              disabled={isExporting}
              onClick={resetToSetup}
            >
              ↺ RERECORD
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
            >
              {midiMuted ? '🔇' : '🎹'}
            </button>

            <button
              type="button"
              className={styles.controlButton}
              aria-label={isExporting ? 'Exporting' : 'Export'}
              disabled={isExporting || !hasRecording}
              onClick={() => {
                void handleExport()
              }}
            >
              {isExporting ? 'EXPORTING...' : 'EXPORT'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )

  function renderAdjustmentControls(disabled: boolean, testId: string) {
    const wrapperClassName = disabled ? styles.disabledControls : styles.enabledControls
    const isAligned = alignStep === 'complete'

    return (
      <div className={wrapperClassName} data-testid={testId}>
        <section className={styles.section}>
          <label className={styles.label} htmlFor={`${testId}-move-x`}>MOVE X</label>
          <input
            id={`${testId}-move-x`}
            aria-label={disabled ? 'Disabled Move X' : 'Move X'}
            className={styles.slider}
            type="range"
            min={-500}
            max={500}
            value={cameraOverlay.offsetX}
            disabled={disabled}
            onChange={(event) => {
              setCameraOverlay({ offsetX: Number(event.target.value) })
            }}
          />
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor={`${testId}-move-y`}>MOVE Y</label>
          <input
            id={`${testId}-move-y`}
            aria-label={disabled ? 'Disabled Move Y' : 'Move Y'}
            className={styles.slider}
            type="range"
            min={-500}
            max={500}
            value={cameraOverlay.offsetY}
            disabled={disabled}
            onChange={(event) => {
              setCameraOverlay({ offsetY: Number(event.target.value) })
            }}
          />
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor={`${testId}-scale`}>SCALE</label>
          <input
            id={`${testId}-scale`}
            aria-label={disabled ? 'Disabled Scale' : 'Scale'}
            className={styles.slider}
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={cameraOverlay.scale}
            disabled={disabled}
            onChange={(event) => {
              setCameraOverlay({ scale: Number(event.target.value) })
            }}
          />
        </section>

        <section className={styles.section}>
          <span className={styles.label}>CROP</span>
          <div className={styles.cropGrid}>
            <input
              className={styles.numberInput}
              aria-label="Crop Top"
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropTop}
              disabled={disabled}
              onChange={(event) => {
                setCameraOverlay({ cropTop: Number(event.target.value) })
              }}
            />
            <input
              className={styles.numberInput}
              aria-label="Crop Right"
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropRight}
              disabled={disabled}
              onChange={(event) => {
                setCameraOverlay({ cropRight: Number(event.target.value) })
              }}
            />
            <input
              className={styles.numberInput}
              aria-label="Crop Bottom"
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropBottom}
              disabled={disabled}
              onChange={(event) => {
                setCameraOverlay({ cropBottom: Number(event.target.value) })
              }}
            />
            <input
              className={styles.numberInput}
              aria-label="Crop Left"
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropLeft}
              disabled={disabled}
              onChange={(event) => {
                setCameraOverlay({ cropLeft: Number(event.target.value) })
              }}
            />
          </div>
        </section>

        {alignStep === 'waiting-low-a' ? (
          <p className={styles.alignInstruction}>
            Click the lowest A key on your piano in the camera feed
          </p>
        ) : null}
        {alignStep === 'waiting-high-c' ? (
          <p className={styles.alignInstruction}>
            Now click the highest C key on your piano in the camera feed
          </p>
        ) : null}
        {isAligned ? (
          <p className={styles.alignInstruction}>
            Aligned - adjust with Move X/Y if needed
          </p>
        ) : null}

        <button
          type="button"
          className={styles.placeholderButton}
          disabled={disabled}
          onClick={startAlignment}
        >
          ALIGN
        </button>

        {alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c' ? (
          <button
            type="button"
            className={styles.placeholderButton}
            disabled={disabled}
            onClick={cancelAlignment}
          >
            Cancel
          </button>
        ) : null}

        <section className={styles.section}>
          <label className={styles.trackToggleRow}>
            <span className={styles.label}>TRACK</span>
            <input
              aria-label="Track toggle"
              type="checkbox"
              checked={isTrackVisible}
              disabled={disabled}
              onChange={() => {
                setIsTrackVisible((previous) => !previous)
              }}
            />
          </label>
        </section>
      </div>
    )
  }

  function clearMidiTest() {
    midiTestCleanupRef.current?.()
    midiTestCleanupRef.current = null
    if (midiTestTimeoutRef.current != null) {
      clearTimeout(midiTestTimeoutRef.current)
      midiTestTimeoutRef.current = null
    }
  }
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop()
  })
}

function clearCountdownTimeouts(timeoutIds: Array<ReturnType<typeof globalThis.setTimeout>>) {
  timeoutIds.forEach((timeoutId) => {
    globalThis.clearTimeout(timeoutId)
  })
  timeoutIds.length = 0
}

function revokePreviewUrl(previewUrl: string | null) {
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
    console.warn('Unable to reset playback in Record Mode.', error)
  }
}

function getVisualizerCanvas(): HTMLCanvasElement | null {
  const preferredCanvas = document.querySelector('[data-testid="canvas-area"] canvas')
  if (preferredCanvas instanceof HTMLCanvasElement) {
    return preferredCanvas
  }

  return document.querySelector('canvas')
}

function formatClock(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
