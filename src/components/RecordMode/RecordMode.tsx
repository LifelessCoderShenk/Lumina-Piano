/*
INPUT: Camera/audio services, shared Web MIDI input events, and Record Mode configuration.
OUTPUT: Record Mode's camera, MIDI visualization, audio, and review surface.
PURPOSE: Records a performance while subscribing to the same normalized MIDI stream used by other live-input views instead of replacing device message handlers.
*/

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, AudioLines, Check, Download, FileMusic, LoaderCircle, PanelLeftClose, PanelLeftOpen, Pause, Play, RefreshCcw, Rows3, Square, Upload, Video, X } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { LiveMidiInputController, type LiveMidiEvent } from '../../midi/LiveMidiInputController'
import { acquireLiveMidiInput, type LiveMidiInputLease } from '../../midi/liveMidiInputService'
import { audioScheduler } from '../../audio/AudioScheduler'
import { hasRenderableMidiAudio, renderOfflineMidiAudioBuffer } from '../../audio/renderOfflineMidiAudio'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { getActiveVisualizerCanvas } from '../../renderer/activeCanvas'
import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import type { LiveMidiNote } from '../../renderer/VisualizerRenderer'
import { getAppState, useAppStore } from '../../store/store'
import { secondsToTick } from '../../tempo/tempoMap'
import { exportPerformanceVideoDeterministically } from '../../export/PerformanceVideoExporter'
import { resolveExportDimensions } from '../../export/exportDimensions'
import { getCompositePreviewLayout, resolveCompositeVisualizerSize } from '../../utils/compositeExport'
import { probeBlobDuration } from '../../utils/blobDuration'
import { CanvasArea } from '../CanvasArea/CanvasArea'
import { RecordingTimelineEditor } from '../RecordingTimelineEditor/RecordingTimelineEditor'
import { TranscriptorMode } from '../TranscriptorMode/TranscriptorMode'
import { useCameraAlignment } from '../shared/useCameraAlignment'
import { useCountdown } from '../shared/useCountdown'
import { useMediaRecording } from '../shared/useMediaRecording'
import { createRecordingMediaRecorder } from '../shared/mediaRecorderMimeType'
import { resolveRecordingExportTiming } from '../shared/recordingTimeline'
import { usePreviewPlayback } from '../shared/usePreviewPlayback'
import { useRecordingTimeline } from '../shared/useRecordingTimeline'
import { useRecordingTimelineReview } from '../shared/useRecordingTimelineReview'
import { getExpandableVisualizerStyle } from '../shared/expandableVisualizerLayout'
import styles from './RecordMode.module.css'

type CameraStatus = 'idle' | 'loading' | 'ready' | 'error'
type MidiTestStatus = 'idle' | 'pending' | 'success' | 'failure'
type RecordModePhase = 'setup' | 'countdown' | 'recording' | 'review'
type PerformanceExportFormat = 'mp4' | 'webm'
type PerformanceVideoSource = 'captured' | 'imported'

const MIDI_TEST_TIMEOUT_MS = 5_000
const RECORD_MODE_PRE_ROLL_SECONDS = 3
const SYSTEM_DEFAULT_AUDIO_VALUE = '__system-default-audio__'
const PERFORMANCE_CAMERA_CONSTRAINTS = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 30 },
} as const

interface RecordModeProps {
  isTranscriptionSidebarCollapsed?: boolean
  onSourceVideoDimensionsChange?(dimensions: { height: number; width: number } | null): void
  onBusyChange?(busy: boolean): void
  onTranscriptionSidebarCollapsedChange?(collapsed: boolean): void
}

export function RecordMode({ isTranscriptionSidebarCollapsed = false, onSourceVideoDimensionsChange, onBusyChange, onTranscriptionSidebarCollapsedChange }: RecordModeProps = {}) {
  const view = useAppStore((state) => state.recordModeView)
  const transcriptionPhase = useAppStore((state) => state.transcriptionPhase)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setRecordModeView = useAppStore((state) => state.setRecordModeView)
  const [videoPhase, setVideoPhase] = useState<RecordModePhase>('setup')
  const [videoExporting, setVideoExporting] = useState(false)
  const busy = view === 'video'
    ? videoPhase === 'countdown' || videoPhase === 'recording' || videoExporting
    : !['idle', 'stopped'].includes(transcriptionPhase)
  const busyReason = view === 'video'
    ? videoExporting ? 'Finish or cancel the export before switching.' : 'Stop or cancel the current recording before switching.'
    : 'Stop or cancel the current transcription before switching.'

  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  return <section className={styles.recordHub} data-testid="record-mode">
    <header className={styles.recordHubHeader}>
      <button type="button" className={styles.hubBackButton} title={busy ? busyReason : 'Return to Falling Keys'} disabled={busy} onClick={() => setAppMode('create')}><AppIcon icon={ArrowLeft} size={18} /> Falling Keys</button>
      <div className={styles.recordViewTabs} role="tablist" aria-label="Recording type">
        <button type="button" role="tab" aria-selected={view === 'video'} title={busy ? busyReason : 'Record a camera performance'} disabled={busy} onClick={() => setRecordModeView('video')}><AppIcon icon={Video} size={16} />Performance video</button>
        <button type="button" role="tab" aria-selected={view === 'transcription'} title={busy ? busyReason : 'Record and edit sheet music'} disabled={busy} onClick={() => setRecordModeView('transcription')}><AppIcon icon={FileMusic} size={16} />Transcription</button>
      </div>
      {view === 'transcription' && <button
        type="button"
        className={styles.sidebarToggle}
        aria-label={isTranscriptionSidebarCollapsed ? 'Show setup' : 'Hide setup'}
        title={isTranscriptionSidebarCollapsed ? 'Show setup' : 'Hide setup'}
        aria-expanded={!isTranscriptionSidebarCollapsed}
        aria-controls="transcription-sidebar-root"
        onClick={() => onTranscriptionSidebarCollapsedChange?.(!isTranscriptionSidebarCollapsed)}
      ><AppIcon icon={isTranscriptionSidebarCollapsed ? PanelLeftOpen : PanelLeftClose} size={16} /><span>{isTranscriptionSidebarCollapsed ? 'Show setup' : 'Hide setup'}</span></button>}
    </header>
    <div className={styles.recordHubBody}>
      {view === 'video' ? <PerformanceVideoRecorder onSourceVideoDimensionsChange={onSourceVideoDimensionsChange} onPhaseChange={setVideoPhase} onExportingChange={setVideoExporting} /> : <TranscriptorMode />}
    </div>
  </section>
}

interface PerformanceVideoRecorderProps extends RecordModeProps {
  onExportingChange?(exporting: boolean): void
  onPhaseChange?(phase: RecordModePhase): void
}

function PerformanceVideoRecorder({ onSourceVideoDimensionsChange, onExportingChange, onPhaseChange }: PerformanceVideoRecorderProps = {}) {
  const setupPreviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null)
  const soundtrackAudioRef = useRef<HTMLAudioElement | null>(null)
  const soundtrackUrlRef = useRef<string | null>(null)
  const setupPreviewStreamRef = useRef<MediaStream | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef(false)
  const midiControllerRef = useRef<LiveMidiInputController | null>(null)
  const midiTestTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const midiTestCleanupRef = useRef<(() => void) | null>(null)
  const liveMidiNotesRef = useRef<Map<string, LiveMidiNote[]>>(new Map())
  const recordingAttemptRef = useRef(0)
  const exportAbortRef = useRef<AbortController | null>(null)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [midiDevices, setMidiDevices] = useState<Array<{ id: string; name: string }>>([])
  const [mediaDeviceError, setMediaDeviceError] = useState<string | null>(null)
  const [midiDeviceError, setMidiDeviceError] = useState<string | null>(null)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [setupPreviewRevision, setSetupPreviewRevision] = useState(0)
  const [midiTestStatus, setMidiTestStatus] = useState<MidiTestStatus>('idle')
  const [phase, setPhase] = useState<RecordModePhase>('setup')
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingSource, setRecordingSource] = useState<PerformanceVideoSource>('captured')
  const [sourcePreRollSeconds, setSourcePreRollSeconds] = useState(RECORD_MODE_PRE_ROLL_SECONDS)
  const [isImportingVideo, setIsImportingVideo] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [soundtrackBlob, setSoundtrackBlob] = useState<Blob | null>(null)
  const [soundtrackName, setSoundtrackName] = useState<string | null>(null)
  const [soundtrackMuted, setSoundtrackMuted] = useState(false)
  const [isImportingSoundtrack, setIsImportingSoundtrack] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<PerformanceExportFormat>('webm')
  const [exportProgress, setExportProgress] = useState(0)
  const [isFinalizingExport, setIsFinalizingExport] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportWarning, setExportWarning] = useState<string | null>(null)
  const [midiMuted, setMidiMuted] = useState(false)
  const [cameraAudioMuted, setCameraAudioMuted] = useState(false)
  const [isTimelineOpen, setIsTimelineOpen] = useState(false)
  const [hasCameraAudio, setHasCameraAudio] = useState(false)
  const [nativeVideoDimensions, setNativeVideoDimensions] = useState<{ height: number; width: number } | null>(null)
  const addPiece = useAppStore((state) => state.addPiece)
  const currentPieceId = useAppStore((state) => state.currentPieceId)
  const pieces = useAppStore((state) => state.pieces)
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const visualizerSettings = useAppStore((state) => state.visualizerSettings)
  const recordModeConfig = useAppStore((state) => state.recordModeConfig)
  const setRecordModeConfig = useAppStore((state) => state.setRecordModeConfig)
  const setVisualizerSettings = useAppStore((state) => state.setVisualizerSettings)
  const loadedPieceName = pieces.find((piece) => piece.id === currentPieceId)?.name ?? 'My Recording'
  const isSetup = phase === 'setup'
  const isLiveView = phase === 'countdown' || phase === 'recording'
  const isReview = phase === 'review'
  const hasRecording = recordingBlob != null

  useEffect(() => {
    if (!recordModeConfig.useMidiAudio) setRecordModeConfig({ useMidiAudio: true })
  }, [recordModeConfig.useMidiAudio, setRecordModeConfig])

  useEffect(() => { onPhaseChange?.(phase) }, [onPhaseChange, phase])
  useEffect(() => { onExportingChange?.(isExporting) }, [isExporting, onExportingChange])
  const {
    cameraOverlay,
    cancelAlignment,
    cropFrameStyle,
    feedOrientationStyle,
    resetCameraOverlay,
    setPreviewViewportElement,
  } = useCameraAlignment(nativeVideoDimensions)
  const isPortraitPerformance = visualizerSettings.aspectRatio === '9:16'
  const expandableVisualizerStyle = getExpandableVisualizerStyle(
    isPortraitPerformance ? '65%' : '60%',
    cameraOverlay,
  )
  const performanceCameraSlotStyle = isPortraitPerformance ? { height: '35%' } : undefined
  const { clearCountdown, countdownValue, setCountdownValue, waitForCountdownStep } = useCountdown()
  const { mediaRecorderRef, recordingChunksRef, stopMediaStream } = useMediaRecording()
  const recordingTimeline = useRecordingTimeline()
  const { syncReviewTimeline } = useRecordingTimelineReview({
    preRollSeconds: sourcePreRollSeconds,
    precomputedTempoMap,
    timeline: recordingTimeline.timeline,
  })
  const syncSoundtrack = useCallback((cameraVideoTimeSeconds: number, shouldPlay: boolean, force = false) => {
    const audio = soundtrackAudioRef.current
    if (audio == null || soundtrackUrlRef.current == null || soundtrackMuted) {
      audio?.pause()
      return
    }

    const masterTimeMs = (Math.max(0, cameraVideoTimeSeconds) * 1000) + recordingTimeline.timeline.startOffsetMs.cameraVideo
    const soundtrackTimeSeconds = (
      masterTimeMs - recordingTimeline.timeline.startOffsetMs.performanceAudio
    ) / 1000
    if (soundtrackTimeSeconds < 0) {
      audio.pause()
      if (force) audio.currentTime = 0
      return
    }

    const duration = Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY
    const nextTime = Math.min(soundtrackTimeSeconds, duration)
    if (force || Math.abs(audio.currentTime - nextTime) > 0.15) audio.currentTime = nextTime
    if (shouldPlay && nextTime < duration) void audio.play().catch(() => undefined)
    else audio.pause()
  }, [recordingTimeline.timeline.startOffsetMs, soundtrackMuted])
  const syncPreviewTimeline = useCallback((videoTimeSeconds: number, shouldPlay: boolean, force = false) => {
    syncSoundtrack(videoTimeSeconds, shouldPlay, force)
    return syncReviewTimeline(videoTimeSeconds, shouldPlay, force)
  }, [syncReviewTimeline, syncSoundtrack])
  const resetReviewPlayback = useCallback(() => {
    resetPlaybackToStart()
    const audio = soundtrackAudioRef.current
    if (audio != null) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])
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
    active: isReview,
    onBeforePlay: () => {
      audioScheduler.setMuted(false)
      setMidiMuted(false)
    },
    onResetPlayback: resetReviewPlayback,
    playErrorMessage: 'Unable to play Record Mode preview.',
    precomputedTempoMap,
    preRollSeconds: sourcePreRollSeconds,
    previewVideoRef: reviewVideoRef,
    syncTimelinePlayback: syncPreviewTimeline,
  })

  useEffect(() => {
    isMountedRef.current = true
    const setupPreviewVideo = setupPreviewVideoRef.current
    const liveVideo = liveVideoRef.current

    return () => {
      isMountedRef.current = false
      recordingAttemptRef.current += 1
      clearCountdown()
      clearMidiTest()
      resetPlaybackToStart()
      getActiveVisualizerRenderer()?.setKeyboardOpacity(1)
      clearPreviewSource()
      revokeMediaUrl(soundtrackUrlRef.current)
      soundtrackUrlRef.current = null
      stopMediaStream(setupPreviewStreamRef.current)
      stopMediaStream(recordingStreamRef.current)
      setupPreviewStreamRef.current = null
      recordingStreamRef.current = null
      if (setupPreviewVideo != null) {
        setupPreviewVideo.srcObject = null
      }
      if (liveVideo != null) {
        liveVideo.srcObject = null
      }
      pausePreview()
      exportAbortRef.current?.abort()
      onExportingChange?.(false)
      audioScheduler.setMuted(false)
    }
  }, [clearCountdown, clearPreviewSource, onExportingChange, pausePreview, stopMediaStream])

  useEffect(() => {
    const reviewVideo = reviewVideoRef.current
    if (!isReview || reviewVideo == null) return
    const pauseSoundtrack = () => soundtrackAudioRef.current?.pause()
    reviewVideo.addEventListener('pause', pauseSoundtrack)
    reviewVideo.addEventListener('ended', pauseSoundtrack)
    return () => {
      reviewVideo.removeEventListener('pause', pauseSoundtrack)
      reviewVideo.removeEventListener('ended', pauseSoundtrack)
    }
  }, [isReview])

  useEffect(() => {
    if (soundtrackMuted) soundtrackAudioRef.current?.pause()
  }, [soundtrackMuted])

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

        const nextAudioDevices = devices.filter((device) => device.kind === 'audioinput')
        const nextCameraDevices = devices.filter((device) => device.kind === 'videoinput')
        setAudioDevices(nextAudioDevices)
        setCameraDevices(nextCameraDevices)
        const selected = useAppStore.getState().recordModeConfig
        const cameraMissing = selected.cameraDeviceId != null && !nextCameraDevices.some((device) => device.deviceId === selected.cameraDeviceId)
        const audioMissing = selected.audioSourceDeviceId != null && !nextAudioDevices.some((device) => device.deviceId === selected.audioSourceDeviceId)
        if (cameraMissing || audioMissing) {
          useAppStore.getState().setRecordModeConfig({
            ...(cameraMissing ? { cameraDeviceId: null } : {}),
            ...(audioMissing ? { audioSourceDeviceId: null, useMic: false } : {}),
          })
          setMediaDeviceError(cameraMissing && audioMissing
            ? 'The selected camera and audio input disconnected. Choose the available devices again.'
            : cameraMissing
              ? 'The selected camera disconnected. Choose another camera.'
              : 'The selected audio input disconnected. Input Audio was turned off.')
        } else {
          setMediaDeviceError(null)
        }
      } catch (error) {
        console.warn('Unable to enumerate media devices for Record Mode.', error)
        if (!cancelled) setMediaDeviceError('Camera and audio inputs could not be listed. Check the app’s device permissions.')
      }
    }

    void loadDevices()
    const handleDeviceChange = () => {
      void loadDevices()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)

    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const lease: LiveMidiInputLease = acquireLiveMidiInput()
    const controller = lease.controller
    midiControllerRef.current = controller
    const unsubscribeDevices = controller.subscribeDevices((devices) => {
      if (cancelled) {
        return
      }
      setMidiDevices([...devices])
      const selectedDeviceId = useAppStore.getState().recordModeConfig.midiDeviceId
      if (selectedDeviceId != null && !devices.some((device) => device.id === selectedDeviceId)) {
        clearMidiTest()
        useAppStore.getState().setRecordModeConfig({ midiDeviceId: null })
      }
    })

    void lease.initialize().then(() => {
      if (!cancelled) setMidiDeviceError(null)
      controller.selectDevice(useAppStore.getState().recordModeConfig.midiDeviceId)
    }).catch((error: unknown) => {
      console.warn('Unable to enumerate MIDI devices for Record Mode.', error)
      if (!cancelled) {
        setMidiDevices([])
        setMidiDeviceError('MIDI is unavailable. Camera recording still works without it.')
      }
    })

    return () => {
      cancelled = true
      clearMidiTest()
      unsubscribeDevices()
      lease.release()
      if (midiControllerRef.current === controller) {
        midiControllerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    midiControllerRef.current?.selectDevice(recordModeConfig.midiDeviceId)
  }, [recordModeConfig.midiDeviceId])

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
    const setupPreviewVideo = setupPreviewVideoRef.current

    const startPreview = async () => {
      stopMediaStream(setupPreviewStreamRef.current)
      setupPreviewStreamRef.current = null
      setNativeVideoDimensions(null)
      onSourceVideoDimensionsChange?.(null)

      if (recordModeConfig.cameraDeviceId == null || recordModeConfig.cameraDeviceId.length === 0) {
        setCameraStatus('idle')
        if (setupPreviewVideo != null) {
          setupPreviewVideo.srcObject = null
        }
        return
      }

      setCameraStatus('loading')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...PERFORMANCE_CAMERA_CONSTRAINTS,
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
        optimizeCameraTracks(stream)

        if (setupPreviewVideo == null) {
          stopMediaStream(stream)
          return
        }

        setupPreviewVideo.srcObject = stream
        await setupPreviewVideo.play()

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
      if (setupPreviewVideo != null) {
        setupPreviewVideo.srcObject = null
      }
    }
  }, [isSetup, onSourceVideoDimensionsChange, recordModeConfig.cameraDeviceId, setupPreviewRevision, stopMediaStream])

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
    setMidiTestStatus('idle')
    clearMidiTest()
  }, [recordModeConfig.midiDeviceId])

  useEffect(() => {
    if (!isLiveView || recordModeConfig.midiDeviceId == null) {
      return
    }
    const midiController = midiControllerRef.current
    if (midiController == null) {
      return
    }
    const liveMidiNotes = liveMidiNotesRef.current

    const syncLiveMidiVisualization = () => {
      const activeRenderer = getActiveVisualizerRenderer()
      const notes = [...liveMidiNotes.values()].flat()
      if (activeRenderer?.setLiveNoteSource != null) {
        activeRenderer.setLiveNoteSource('record-midi', notes)
      } else {
        activeRenderer?.setLiveMidiNotes?.(notes)
        activeRenderer?.setActiveKeyPitches?.(notes.map((note) => note.pitch))
      }
    }
    const unsubscribe = midiController.subscribe((event: LiveMidiEvent) => {
      const noteId = `${event.channel}:${event.pitch}`
      const notes = liveMidiNotes.get(noteId) ?? []

      if (event.type === 'noteon') {
        notes.push({
          id: notes.length === 0 ? noteId : `${noteId}:${event.timestampMs}:${notes.length}`,
          pitch: event.pitch,
          startedAtMs: event.timestampMs,
          velocity: event.velocity,
        })
        liveMidiNotes.set(noteId, notes)
        syncLiveMidiVisualization()
        if (recordModeConfig.useMidiAudio) {
          void audioScheduler.playLiveNote(event.pitch, event.velocity)
        }
      } else {
        notes.shift()
        if (notes.length > 0) liveMidiNotes.set(noteId, notes)
        else liveMidiNotes.delete(noteId)
        syncLiveMidiVisualization()
      }
    })

    return () => {
      liveMidiNotes.clear()
      syncLiveMidiVisualization()
      unsubscribe()
    }
  }, [isLiveView, recordModeConfig.midiDeviceId, recordModeConfig.useMidiAudio])

  const handleMidiTest = () => {
    clearMidiTest()
    setMidiTestStatus('pending')

    const midiController = midiControllerRef.current
    if (recordModeConfig.midiDeviceId == null || midiController == null) {
      setMidiTestStatus('failure')
      return
    }

    let unsubscribe: () => void = () => {}
    const cleanup = () => {
      unsubscribe()
      if (midiTestTimeoutRef.current != null) {
        clearTimeout(midiTestTimeoutRef.current)
        midiTestTimeoutRef.current = null
      }
      midiTestCleanupRef.current = null
    }

    const handleMidiMessage = (event: LiveMidiEvent) => {
      if (event.type === 'noteon') {
        cleanup()
        setMidiTestStatus('success')
      }
    }

    unsubscribe = midiController.subscribe(handleMidiMessage)
    midiTestCleanupRef.current = cleanup
    midiTestTimeoutRef.current = globalThis.setTimeout(() => {
      cleanup()
      setMidiTestStatus('failure')
    }, MIDI_TEST_TIMEOUT_MS)
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
    const attempt = ++recordingAttemptRef.current
    const attemptIsActive = () => isMountedRef.current && recordingAttemptRef.current === attempt

    clearCountdown()
    clearMidiTest()
    cancelAlignment()
    resetPreviewState()
    setRecordingBlob(null)
    clearPreviewSource()
    setRecordingSource('captured')
    setSourcePreRollSeconds(RECORD_MODE_PRE_ROLL_SECONDS)
    setImportError(null)
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
          ...PERFORMANCE_CAMERA_CONSTRAINTS,
          deviceId: {
            exact: recordModeConfig.cameraDeviceId,
          },
        },
      })

      if (!attemptIsActive()) {
        stopMediaStream(stream)
        return
      }

      recordingStreamRef.current = stream
      optimizeCameraTracks(stream)
      recordingChunksRef.current = []
      setHasCameraAudio(getAudioTrackCount(stream) > 0)
      recordingTimeline.resetTimeline()
      // MIDI AUDIO drives physical notes through the shared scheduler. Keep
      // it audible while recording whenever the user has enabled it.
      setMidiMuted(!recordModeConfig.useMidiAudio)
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
      if (!attemptIsActive()) {
        return
      }

      setCountdownValue(2)
      await waitForCountdownStep(1000)
      if (!attemptIsActive()) {
        return
      }

      setCountdownValue(1)
      await waitForCountdownStep(1000)
      if (!attemptIsActive()) {
        return
      }

      const mediaRecorder = createRecordingMediaRecorder(stream)

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data != null && event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = () => {
        console.warn('Record Mode recorder failed.')
        if (isMountedRef.current) {
          setCameraStatus('error')
        }
      }

      mediaRecorder.onstop = () => {
        if (recordingChunksRef.current.length === 0) {
          mediaRecorderRef.current = null
          stopMediaStream(recordingStreamRef.current)
          recordingStreamRef.current = null
          if (liveVideoRef.current != null) {
            liveVideoRef.current.srcObject = null
          }
          if (isMountedRef.current) {
            setCameraStatus('error')
            setPhase('setup')
            setSetupPreviewRevision((revision) => revision + 1)
          }
          return
        }

        const blob = new Blob(recordingChunksRef.current, { type: mediaRecorder.mimeType || 'video/webm' })
        const nextPreviewUrl = URL.createObjectURL(blob)
        setPreviewSource(nextPreviewUrl)
        stopMediaStream(recordingStreamRef.current)
        recordingStreamRef.current = null
        if (liveVideoRef.current != null) {
          liveVideoRef.current.srcObject = null
        }
        audioScheduler.setMuted(false)
        if (isMountedRef.current) {
          setRecordingBlob(blob)
          resetPreviewState()
          setCountdownValue(null)
          setPhase('review')
        }
      }

      mediaRecorderRef.current = mediaRecorder
      setCountdownValue(null)
      setPhase('recording')
      mediaRecorder.start(1000)
    } catch (error) {
      if (!attemptIsActive()) return
      stopMediaStream(recordingStreamRef.current)
      recordingStreamRef.current = null
      setCountdownValue(null)
      setPhase('setup')
      setCameraStatus('error')
      // The setup preview was intentionally released before asking for the
      // capture stream. Reacquire it after a failed capture request instead
      // of leaving the user on a blank camera panel.
      setSetupPreviewRevision((revision) => revision + 1)
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

  const cancelCountdownRecording = () => {
    if (phase !== 'countdown') return
    recordingAttemptRef.current += 1
    clearCountdown()
    resetPlaybackToStart()
    audioScheduler.setMuted(false)
    setMidiMuted(false)
    setCountdownValue(null)
    stopMediaStream(recordingStreamRef.current)
    recordingStreamRef.current = null
    if (liveVideoRef.current != null) liveVideoRef.current.srcObject = null
    setCameraStatus('idle')
    setPhase('setup')
    setSetupPreviewRevision((revision) => revision + 1)
  }

  const resetToSetup = () => {
    recordingAttemptRef.current += 1
    cancelAlignment()
    clearCountdown()
    resetPlaybackToStart()
    audioScheduler.setMuted(false)
    setMidiMuted(false)
    setCameraStatus('idle')
    setCountdownValue(null)
    setPhase('setup')
    setRecordingBlob(null)
    setRecordingSource('captured')
    setSourcePreRollSeconds(RECORD_MODE_PRE_ROLL_SECONDS)
    setImportError(null)
    setIsTimelineOpen(false)
    setCameraAudioMuted(false)
    recordingTimeline.resetTimeline()
    resetPreviewState()
    clearPreviewSource()
    if (reviewVideoRef.current != null) {
      reviewVideoRef.current.pause()
      reviewVideoRef.current.currentTime = 0
    }
    stopMediaStream(recordingStreamRef.current)
    recordingStreamRef.current = null
    if (liveVideoRef.current != null) {
      liveVideoRef.current.srcObject = null
    }
    resetCameraOverlay()
  }

  const importPerformanceVideo = async () => {
    if (!isSetup || isImportingVideo) return
    const picker = window.electronAPI?.openVideoFile ?? window.electronAPI?.dialog?.openVideoFile
    if (typeof picker !== 'function' || typeof window.electronFS?.readFile !== 'function') {
      setImportError('Video import is available in the desktop app.')
      return
    }

    setIsImportingVideo(true)
    setImportError(null)
    try {
      const filePath = await picker()
      if (filePath == null) return
      const bytes = await window.electronFS.readFile(filePath)
      if (bytes.byteLength === 0) throw new Error('The selected video is empty.')

      const blob = new Blob([new Uint8Array(bytes)], { type: getVideoMimeType(filePath) })
      recordingAttemptRef.current += 1
      clearCountdown()
      clearPreviewSource()
      resetPreviewState()
      recordingTimeline.resetTimeline()
      setCameraAudioMuted(false)
      setHasCameraAudio(true)
      setRecordingSource('imported')
      setSourcePreRollSeconds(0)
      setRecordingBlob(blob)
      setPreviewSource(URL.createObjectURL(blob))
      setPhase('review')
    } catch (error) {
      console.warn('Unable to import Performance Video footage.', error)
      setImportError(error instanceof Error ? error.message : 'Unable to open this video.')
    } finally {
      setIsImportingVideo(false)
    }
  }

  const importPerformanceAudio = async () => {
    if (isImportingSoundtrack) return
    const picker = window.electronAPI?.openAudioFile ?? window.electronAPI?.dialog?.openAudioFile
    if (typeof picker !== 'function' || typeof window.electronFS?.readFile !== 'function') {
      setImportError('Soundtrack import is available in the desktop app.')
      return
    }

    setIsImportingSoundtrack(true)
    setImportError(null)
    try {
      const filePath = await picker()
      if (filePath == null) return
      const bytes = await window.electronFS.readFile(filePath)
      if (bytes.byteLength === 0) throw new Error('The selected audio file is empty.')

      const blob = new Blob([new Uint8Array(bytes)], { type: getAudioMimeType(filePath) })
      const nextUrl = URL.createObjectURL(blob)
      revokeMediaUrl(soundtrackUrlRef.current)
      soundtrackUrlRef.current = nextUrl
      setSoundtrackBlob(blob)
      setSoundtrackName(getFileName(filePath))
      setSoundtrackMuted(false)
      recordingTimeline.setTrackStartOffsetMs('performanceAudio', 0)
      if (isReview) setIsTimelineOpen(true)
    } catch (error) {
      console.warn('Unable to import Performance Video soundtrack.', error)
      setImportError(error instanceof Error ? error.message : 'Unable to open this audio file.')
    } finally {
      setIsImportingSoundtrack(false)
    }
  }

  const handleVideoMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const dimensions = { height: video.videoHeight, width: video.videoWidth }
      setNativeVideoDimensions(dimensions)
      onSourceVideoDimensionsChange?.(dimensions)
    }
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

    const selectedOutputPath = await window.electronAPI?.dialog.showSaveDialog({
      defaultPath: `${loadedPieceName}_recording.${exportFormat}`,
      filters: [{ extensions: [exportFormat], name: exportFormat === 'mp4' ? 'MP4 Video' : 'WebM Video' }],
    })
    if (selectedOutputPath == null) {
      return
    }

    setIsExporting(true)
    setIsFinalizingExport(false)
    setExportProgress(0)
    setExportError(null)
    setExportWarning(null)
    const abortController = new AbortController()
    exportAbortRef.current = abortController
    const visualizerResolutionCleanup: { current: (() => void) | null } = { current: null }

    try {
      const exportStateSnapshot = getAppState()
      const timelineSnapshot = {
        startOffsetMs: { ...recordingTimeline.timeline.startOffsetMs },
      }
      const exportStartTiming = resolveRecordingExportTiming(
        0,
        sourcePreRollSeconds * 1000,
        timelineSnapshot,
      )
      let expectedDurationSeconds: number | null = null
      try {
        expectedDurationSeconds = await probeBlobDuration(recordingBlob)
      } catch (error) {
        console.warn('Unable to verify Record Mode source duration before export.', error)
        setExportWarning('Recording duration could not be verified; export will use the video source duration.')
      }

      let midiAudioBuffer: AudioBuffer | null = null
      if (recordModeConfig.useMidiAudio && hasRenderableMidiAudio(exportStateSnapshot)) {
        if (expectedDurationSeconds == null) {
          setExportWarning('MIDI audio could not be prepared because the recording duration is unavailable.')
        } else {
          try {
            midiAudioBuffer = await renderOfflineMidiAudioBuffer(
              exportStateSnapshot,
              Math.max(0.001, expectedDurationSeconds),
              sourcePreRollSeconds,
            )
          } catch (error) {
            console.warn('Unable to render MIDI audio for Record Mode export.', error)
            setExportWarning('MIDI audio was unavailable, so this export will contain the remaining available audio only.')
          }
        }
      }

      const outputPath = ensureVideoPath(selectedOutputPath, exportFormat)
      const previewLayout = getCompositePreviewLayout(
        document.querySelector<HTMLElement>('[data-testid="record-mode-review-visualizer"]'),
        pixiCanvas,
      )
      await exportPerformanceVideoDeterministically(
        recordingBlob,
        pixiCanvas,
        {
          cameraOverlay,
          abortSignal: abortController.signal,
          expectedDurationSeconds,
          frameRate: visualizerSettings.framerate,
          includeCameraAudio: hasCameraAudio && !cameraAudioMuted && (
            recordingSource === 'imported' || recordModeConfig.useMic
          ),
          midiAudioBuffer,
          midiAudioSourceTimeAtExportStartSeconds: exportStartTiming.midiAudioBufferTimeMs / 1000,
          soundtrackBlob: soundtrackMuted ? null : soundtrackBlob,
          soundtrackSourceTimeAtExportStartSeconds: (
            timelineSnapshot.startOffsetMs.cameraVideo - timelineSnapshot.startOffsetMs.performanceAudio
          ) / 1000,
          onProgress: setExportProgress,
          onFinalizing: () => setIsFinalizingExport(true),
          outputResolution: resolveExportDimensions(
            visualizerSettings.resolution,
            visualizerSettings.aspectRatio,
          ),
          previewLayout,
          onAfterExportStop: () => {
            visualizerResolutionCleanup.current?.()
            visualizerResolutionCleanup.current = null
            getActiveVisualizerRenderer()?.setReviewTimelineTick?.(null)
            resetPlaybackToStart()
          },
          onBeforeExportStart: ({ height, width }) => {
            playbackEngine.pause()
            const activeRenderer = getActiveVisualizerRenderer()
            activeRenderer?.setReviewTimelineTick?.(null)
            if (
              activeRenderer == null ||
              typeof activeRenderer.isReady !== 'function' ||
              typeof activeRenderer.resize !== 'function' ||
              typeof activeRenderer.renderFrame !== 'function' ||
              !activeRenderer.isReady()
            ) {
              return
            }

            const previousViewport = {
              height: exportStateSnapshot.viewportHeight,
              width: exportStateSnapshot.viewportWidth,
            }
            const liveLayoutContext = activeRenderer.getRenderLayoutContext?.()
            const exportSize = resolveCompositeVisualizerSize(width, height, previewLayout)
            activeRenderer.beginOfflineRender()
            visualizerResolutionCleanup.current = () => {
              activeRenderer.resize(previousViewport.width, previousViewport.height, {
                ...(liveLayoutContext == null ? {} : { layoutContext: liveLayoutContext }),
              })
              activeRenderer.endOfflineRender()
              activeRenderer.renderFrame(getAppState().currentTick)
            }
            activeRenderer.resize(exportSize.width, exportSize.height, {
              ...(liveLayoutContext == null ? {} : { layoutContext: liveLayoutContext }),
              pixelRatio: 1,
              postprocessScale: 1,
            })
          },
          onBeforeDrawFrame: (cameraSourceTimeSeconds) => {
            const activeRenderer = getActiveVisualizerRenderer()
            const tempoMap = exportStateSnapshot.precomputedTempoMap
            if (activeRenderer == null || !activeRenderer.isReady() || tempoMap == null) return
            const timing = resolveRecordingExportTiming(
              cameraSourceTimeSeconds * 1000,
              sourcePreRollSeconds * 1000,
              timelineSnapshot,
            )
            activeRenderer.renderFrame(
              secondsToTick(timing.midiVideoPerformanceTimeMs / 1000, tempoMap),
              { animationTimeSeconds: cameraSourceTimeSeconds },
            )
          },
          outputPath,
        },
      )
      setExportProgress(1)
      const suggestedName = window.prompt('Name this piece:', 'My Recording')
      if (suggestedName != null) {
        const normalizedName = suggestedName.trim() || 'My Recording'
        addPiece({
          createdAt: Date.now(),
          filePath: ensureVideoPath(selectedOutputPath, exportFormat),
          id: globalThis.crypto?.randomUUID?.() ?? `piece-${Date.now()}`,
          name: normalizedName,
          type: 'recording',
        })
      }
    } catch (error) {
      resetPlaybackToStart()
      if (abortController.signal.aborted) {
        setExportWarning('Export canceled.')
        return
      }
      console.warn('Unable to export Record Mode composite.', error)
      setExportError(error instanceof Error ? error.message : 'Unable to export this recording.')
    } finally {
      visualizerResolutionCleanup.current?.()
      exportAbortRef.current = null
      setIsFinalizingExport(false)
      setIsExporting(false)
    }
  }

  return (
    <section className={styles.recordMode} data-testid="record-mode-video">
      {isSetup ? (
        <div className={styles.setupStage} data-testid="record-mode-content">
          <CanvasArea aspectRatioOverride="fit" engine="three" keyboardPointerEnabled keyboardOnly noteFieldTravelSeconds={RECORD_MODE_PRE_ROLL_SECONDS} />
          <div className={styles.setupControlsRegion}>
            <div className={styles.setupPanel} data-testid="record-mode-input-setup">
              <div className={styles.setupPanelHeader}>
                <div>
                  <h2 className={styles.header}>PERFORMANCE SETUP</h2>
                  <p className={styles.setupIntro}>Set your camera and inputs. The keyboard stays live below while you get ready.</p>
                </div>
                <span className={styles.audioIncluded}><AppIcon icon={Check} size={16} /> Piano audio included</span>
              </div>

              <section className={`${styles.section} ${styles.setupSection}`}>
                <label className={styles.label} htmlFor="record-mode-frame-select">FRAME</label>
                <select
                  id="record-mode-frame-select"
                  aria-label="Performance frame"
                  className={styles.select}
                  value={visualizerSettings.aspectRatio}
                  onChange={(event) => setVisualizerSettings({
                    aspectRatio: event.target.value as typeof visualizerSettings.aspectRatio,
                  })}
                >
                  <option value="fit">Fit widescreen</option>
                  <option value="16:9">16:9 Widescreen</option>
                  <option value="9:16">9:16 Vertical</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="4:3">4:3 Classic</option>
                </select>
              </section>

              <section className={`${styles.section} ${styles.setupSection}`}>
                <div className={styles.cameraSourceHeader}>
                  <label className={styles.label} htmlFor="record-mode-audio-select">INPUT AUDIO <span className={styles.optionalLabel}>OPTIONAL</span></label>
                  <button
                    type="button"
                    className={styles.importVideoButton}
                    data-testid="record-mode-import-soundtrack"
                    disabled={isImportingSoundtrack}
                    onClick={() => { void importPerformanceAudio() }}
                  >
                    <AppIcon icon={isImportingSoundtrack ? LoaderCircle : AudioLines} size={14} className={isImportingSoundtrack ? styles.loadingIcon : undefined} />
                    {soundtrackName == null ? 'ADD FILE' : 'CHANGE FILE'}
                  </button>
                </div>
                <select
                  id="record-mode-audio-select"
                  className={styles.select}
                  data-testid="record-mode-audio-select"
                  value={recordModeConfig.useMic ? recordModeConfig.audioSourceDeviceId ?? SYSTEM_DEFAULT_AUDIO_VALUE : ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setRecordModeConfig({
                      audioSourceDeviceId: value && value !== SYSTEM_DEFAULT_AUDIO_VALUE ? value : null,
                      useMic: value !== '',
                      useMidiAudio: true,
                    })
                  }}
                >
                  <option value="">No additional input</option>
                  <option value={SYSTEM_DEFAULT_AUDIO_VALUE}>System default input</option>
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || 'Unnamed audio input'}
                    </option>
                  ))}
                </select>
                <p className={styles.setupHint}>{soundtrackName == null
                  ? 'Choose a live input or add a finished audio track.'
                  : <>Soundtrack: <strong>{soundtrackName}</strong></>}</p>
              </section>

              <section className={`${styles.section} ${styles.setupSection}`}>
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
                    ? <><AppIcon icon={Check} size={16} /> MIDI ready</>
                    : midiTestStatus === 'failure'
                      ? <><AppIcon icon={X} size={16} /> No note detected</>
                      : midiTestStatus === 'pending'
                        ? <><AppIcon className={styles.loadingIcon} icon={LoaderCircle} size={16} /> Play a note…</>
                        : ''}
                </span>
                {midiDeviceError ? <p className={styles.setupWarning} role="status">{midiDeviceError}</p> : null}
              </section>

              <section className={`${styles.section} ${styles.setupSection} ${styles.cameraSetupSection}`}>
                <div className={styles.cameraSourceHeader}>
                  <label className={styles.label} htmlFor="record-mode-camera-select">CAMERA</label>
                  <button
                    type="button"
                    className={styles.importVideoButton}
                    data-testid="record-mode-import-video"
                    disabled={isImportingVideo}
                    onClick={() => { void importPerformanceVideo() }}
                  >
                    <AppIcon icon={isImportingVideo ? LoaderCircle : Upload} size={14} className={isImportingVideo ? styles.loadingIcon : undefined} />
                    {isImportingVideo ? 'OPENING…' : 'IMPORT VIDEO'}
                  </button>
                </div>
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
                  <div
                    ref={setPreviewViewportElement}
                    className={styles.cropViewport}
                    data-testid="record-mode-setup-crop-viewport"
                  >
                    <div
                      className={styles.feedOrientation}
                      data-testid="record-mode-setup-feed-orientation"
                      style={feedOrientationStyle}
                    >
                      <div
                        className={styles.cropFrame}
                        data-testid="record-mode-setup-crop-frame"
                        style={cropFrameStyle}
                      >
                        <video
                          ref={setupPreviewVideoRef}
                          autoPlay
                          className={styles.framedVideo}
                          data-testid="record-mode-camera-preview"
                          muted
                          playsInline
                          onLoadedMetadata={handleVideoMetadata}
                        />
                      </div>
                    </div>
                  </div>
                  {cameraStatus === 'loading' ? (
                    <div className={styles.overlayMessage}>Requesting camera access...</div>
                  ) : null}
                  {cameraStatus === 'idle' ? (
                    <div className={styles.overlayMessage}>Choose a camera to preview it</div>
                  ) : null}
                  {cameraStatus === 'error' ? (
                    <div className={styles.overlayMessage}>Camera unavailable. Check the selected device and permission.</div>
                  ) : null}
                </div>
              </section>

              {mediaDeviceError ? <p className={styles.setupWarning} role="status">{mediaDeviceError}</p> : null}
              {importError ? <p className={styles.setupWarning} role="alert">{importError}</p> : null}

              <button
                type="button"
                className={styles.recordButton}
                data-testid="record-mode-record-button"
                disabled={recordModeConfig.cameraDeviceId == null || isExporting}
                onClick={() => {
                  void beginRecording()
                }}
                title={recordModeConfig.cameraDeviceId == null ? 'Choose a camera before recording' : 'Start performance recording'}
              >
                <span className={styles.recordDot} aria-hidden="true">●</span>
                <span>{recordModeConfig.cameraDeviceId == null ? 'CHOOSE A CAMERA' : 'RECORD'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLiveView ? (
        <div className={styles.liveView} data-testid="record-mode-live-view">
          <div
            className={styles.liveVisualizer}
            data-testid="record-mode-live-visualizer"
            style={expandableVisualizerStyle}
          >
            <CanvasArea aspectRatioOverride="fit" engine="three" keyboardPointerEnabled noteFieldTravelSeconds={RECORD_MODE_PRE_ROLL_SECONDS} />
          </div>
          <div className={styles.liveVideoSlot} data-testid="record-mode-live-video-slot" style={performanceCameraSlotStyle}>
            <div ref={setPreviewViewportElement} className={styles.cropViewport} data-testid="record-mode-live-crop-viewport">
              <div
                className={styles.feedOrientation}
                data-testid="record-mode-live-feed-orientation"
                style={feedOrientationStyle}
              >
                <div className={styles.cropFrame} data-testid="record-mode-live-crop-frame" style={cropFrameStyle}>
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    className={styles.framedVideo}
                    data-testid="record-mode-live-video"
                    muted
                    playsInline
                    onLoadedMetadata={handleVideoMetadata}
                  />
                </div>
              </div>
            </div>
          </div>
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
          {phase === 'recording' || phase === 'countdown' ? (
            <div className={styles.liveControlBar}>
              <button
                type="button"
                className={styles.stopButton}
                aria-label={phase === 'countdown' ? 'Cancel countdown' : 'Stop recording'}
                onClick={phase === 'countdown' ? cancelCountdownRecording : stopRecording}
              >
                <AppIcon icon={phase === 'countdown' ? X : Square} size={18} />
                {phase === 'countdown' ? 'CANCEL' : 'STOP'}
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
            style={expandableVisualizerStyle}
          >
            <CanvasArea aspectRatioOverride="fit" engine="three" noteFieldTravelSeconds={RECORD_MODE_PRE_ROLL_SECONDS} />
          </div>

          <div className={styles.reviewVideoSlot} data-testid="record-mode-review-video-slot" style={performanceCameraSlotStyle}>
            <div ref={setPreviewViewportElement} className={styles.cropViewport} data-testid="record-mode-crop-viewport">
              <div className={styles.feedOrientation} data-testid="record-mode-feed-orientation" style={feedOrientationStyle}>
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
                    muted={cameraAudioMuted}
                    onLoadedMetadata={handleVideoMetadata}
                  />
                </div>
              </div>
            </div>
          </div>

          {soundtrackUrlRef.current != null ? (
            <audio ref={soundtrackAudioRef} data-testid="record-mode-soundtrack" preload="auto" src={soundtrackUrlRef.current} />
          ) : null}

          {isTimelineOpen ? (
            <div className={styles.reviewTimeline} data-testid="record-mode-timeline">
              <RecordingTimelineEditor
                cameraAudioLinked
                hasCameraAudio={hasCameraAudio}
                isCameraAudioEnabled={!cameraAudioMuted}
                isMidiAudioEnabled={!midiMuted}
                hasPerformanceAudio={soundtrackBlob != null}
                isPerformanceAudioEnabled={!soundtrackMuted}
                onCameraAudioEnabledChange={(enabled) => setCameraAudioMuted(!enabled)}
                onMidiAudioEnabledChange={(enabled) => setMidiMuted(!enabled)}
                onPerformanceAudioEnabledChange={(enabled) => setSoundtrackMuted(!enabled)}
                showPerformanceAudio={soundtrackBlob != null}
                timeline={recordingTimeline.timeline}
                onReset={recordingTimeline.resetTimeline}
                onTrackOffsetChange={recordingTimeline.setTrackStartOffsetMs}
              />
            </div>
          ) : null}
          {exportError != null ? <p className={styles.exportError} role="alert">Export failed: {exportError}</p> : null}
          {exportWarning != null ? <p className={styles.exportWarning} role="status">{exportWarning}</p> : null}

          <div className={styles.overlayBar} data-testid="record-mode-control-bar">
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
              disabled={!hasRecording}
              onChange={handlePreviewScrub}
            />

            <span className={styles.timeDisplay}>
              {formatClock(previewCurrentTime)} / {formatClock(previewDuration)}
            </span>

            <button
              type="button"
              className={styles.controlButton}
              aria-label={recordingSource === 'imported' ? 'Change imported video' : 'Discard and re-record'}
              title={recordingSource === 'imported' ? 'Choose a different video or record with a camera' : 'Discard this recording and return to setup'}
              disabled={isExporting}
              onClick={resetToSetup}
            >
              <AppIcon icon={RefreshCcw} size={18} />
              {recordingSource === 'imported' ? 'CHANGE VIDEO' : 'DISCARD & RE-RECORD'}
            </button>

            <button
              type="button"
              className={styles.controlButton}
              aria-label={soundtrackName == null ? 'Add soundtrack' : 'Change soundtrack'}
              title={soundtrackName == null ? 'Add a separately recorded audio track' : `Soundtrack: ${soundtrackName}`}
              disabled={isExporting || isImportingSoundtrack}
              onClick={() => { void importPerformanceAudio() }}
            >
              <AppIcon icon={isImportingSoundtrack ? LoaderCircle : AudioLines} className={isImportingSoundtrack ? styles.loadingIcon : undefined} size={19} />
            </button>

            <button
              type="button"
              className={styles.controlButton}
              aria-label="Timeline"
              aria-pressed={isTimelineOpen}
              disabled={isExporting || !hasRecording}
              onClick={() => setIsTimelineOpen((previous) => !previous)}
            >
              <AppIcon icon={Rows3} size={20} />
            </button>

            <button
              type="button"
              className={styles.controlButton}
              aria-label={isExporting ? 'Exporting' : 'Export'}
              title={`Export ${exportFormat.toUpperCase()}`}
              disabled={isExporting || !hasRecording}
              onClick={() => {
                void handleExport()
              }}
            >
              <AppIcon icon={Download} size={20} />
            </button>
            <select
              aria-label="Performance export format"
              className={styles.exportFormat}
              disabled={isExporting}
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as PerformanceExportFormat)}
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
            </select>
            {isExporting ? <>
              <progress aria-label="Export progress" className={styles.exportProgress} max="1" value={exportProgress} />
              {isFinalizingExport
                ? <span className={styles.exportStatus}>FINALIZING…</span>
                : <button type="button" className={styles.controlButton} onClick={() => exportAbortRef.current?.abort()}>CANCEL</button>}
            </> : null}
          </div>
        </div>
      ) : null}
    </section>
  )

  function clearMidiTest() {
    midiTestCleanupRef.current?.()
    midiTestCleanupRef.current = null
    if (midiTestTimeoutRef.current != null) {
      clearTimeout(midiTestTimeoutRef.current)
      midiTestTimeoutRef.current = null
    }
  }
}

function ensureVideoPath(filePath: string, format: PerformanceExportFormat): string {
  return /\.[^\\/.]+$/i.test(filePath)
    ? filePath.replace(/\.[^\\/.]+$/i, `.${format}`)
    : `${filePath}.${format}`
}

function getVideoMimeType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (extension === 'webm') return 'video/webm'
  if (extension === 'mov') return 'video/quicktime'
  return 'video/mp4'
}

function getAudioMimeType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (extension === 'wav') return 'audio/wav'
  if (extension === 'mp3') return 'audio/mpeg'
  if (extension === 'm4a' || extension === 'aac') return 'audio/mp4'
  if (extension === 'ogg') return 'audio/ogg'
  if (extension === 'flac') return 'audio/flac'
  return 'application/octet-stream'
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || 'Soundtrack'
}

function revokeMediaUrl(url: string | null) {
  if (url != null) URL.revokeObjectURL(url)
}

function optimizeCameraTracks(stream: MediaStream) {
  const tracks = typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : []
  tracks.forEach((track) => {
    try { track.contentHint = 'motion' } catch { /* Some camera drivers expose a read-only hint. */ }
  })
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
  return getActiveVisualizerCanvas()
}

function getAudioTrackCount(stream: MediaStream): number {
  return typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks().length : 0
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
