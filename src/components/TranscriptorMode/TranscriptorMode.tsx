import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable, ChevronDown, Circle, FilePlus2, Layers3, ListMusic, Play, Square, Pause } from 'lucide-react'
import { audioScheduler } from '../../audio/AudioScheduler'
import { CanvasArea, type PointerKeyboardNoteEvent } from '../CanvasArea/CanvasArea'
import { AppIcon } from '../AppIcon/AppIcon'
import type { LiveMidiInputEvent, MidiDeviceDescriptor } from '../../midi/LiveMidiInputController'
import { acquireLiveMidiInput, type LiveMidiInputLease } from '../../midi/liveMidiInputService'
import { parseMidi } from '../../midi/parser'
import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { getKeyboardLayoutMetrics } from '../../renderer/layoutConstants'
import { buildScoreDocument } from '../../transcription/scoreModel'
import { LiveTranscriptionCapture } from '../../transcription/capture'
import { createSamplePlaybackPlan, type SamplePlaybackPlan } from '../../transcription/samplePlayback'
import { normalizeTranscriptionSettings } from '../../transcription/settings'
import { TranscriptionMetronome } from '../../transcription/metronome'
import { useAppStore } from '../../store/store'
import { exportTranscription, type TranscriptionExportFormat } from '../../transcription/exportTranscription'
import { ScoreSheet } from './ScoreSheet'
import { TranscriptionEditor } from './TranscriptionEditor'
import { TranscriptionOptions } from './TranscriptionOptions'
import { TranscriptionExportPanel } from './TranscriptionExportPanel'
import { WebcamOverlay } from './WebcamOverlay'
import { useTranscriptionWorkspace } from './useTranscriptionWorkspace'
import { useTranscriptionMedia } from './useTranscriptionMedia'
import { useTranscriptionReview } from './useTranscriptionReview'
import styles from './TranscriptorMode.module.css'
import { LeadInPlayback } from '../../transcription/leadIn'
import { spliceNotes } from '../../transcription/takes'
import type { RecordingOperation, TranscriptionSession, TimeRange } from '../../transcription/types'
import { useTakeMedia } from './useTakeMedia'
import { TakesPanel } from './TakesPanel'
import { RecordedAudioLayer } from './RecordedAudioLayer'

const MIDI_SOURCE = 'transcriptor-midi'
const SAMPLE_SOURCE = 'transcriptor-sample-midi'
const REVIEW_SOURCE = 'transcriptor-review'
const SAMPLE_FILE = 'Pirates of the Caribbean.mid'
const MIN_KEYBOARD_HEIGHT = 140
const MIN_SCORE_HEIGHT = 220
const KEYBOARD_RESIZE_STEP = 20
interface VisualNote { id: string; pitch: number; velocity: number; startedAtMs: number }

function getKeyboardHeightBounds(workspaceHeight: number) {
  return {
    min: Math.min(MIN_KEYBOARD_HEIGHT, Math.max(1, workspaceHeight - MIN_SCORE_HEIGHT)),
    max: Math.max(MIN_KEYBOARD_HEIGHT, workspaceHeight - MIN_SCORE_HEIGHT),
  }
}

function clampKeyboardHeight(height: number, workspaceHeight: number) {
  const bounds = getKeyboardHeightBounds(workspaceHeight)
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, height)))
}

function explainMidiError(error: unknown) {
  const detail = error instanceof Error ? error.message : ''
  if (/permission|not granted|denied/i.test(detail)) return 'MIDI access was not allowed. You can still record with the on-screen piano.'
  if (/not available|not supported/i.test(detail)) return 'MIDI is unavailable here. You can still record with the on-screen piano.'
  return detail || 'MIDI input is unavailable. You can still record with the on-screen piano.'
}

export function TranscriptorMode() {
  const rootRef = useRef<HTMLElement | null>(null)
  const controller = useRef<LiveMidiInputLease | null>(null)
  const capture = useRef(new LiveTranscriptionCapture())
  const live = useRef(new Map<string, VisualNote[]>())
  const phaseRef = useRef(useAppStore.getState().transcriptionPhase)
  const musicalClock = useRef(new TranscriptionMetronome())
  const leadPlayer = useRef(new LeadInPlayback())
  const pending = useRef<{ operation: RecordingOperation; parent: TranscriptionSession | null; mediaOffsetMs: number; boundaryMs?: number; enter?: () => void } | null>(null)
  const [leadBars, setLeadBars] = useState(2)
  const [range, setRange] = useState<TimeRange>({ startMs: 0, endMs: 2000 })
  const sample = useRef<{ plan: SamplePlaybackPlan; index: number } | null>(null)
  const countdownTimer = useRef<number | null>(null)
  const takeId = useRef(crypto.randomUUID())
  const generation = useRef(0)
  const abortExport = useRef<AbortController | null>(null)
  const callbacks = useRef({ stop: (_completeRange?: boolean) => {}, receive: (_event: LiveMidiInputEvent, _source: string) => {}, flush: () => {} })
  const customKeyboardRatio = useRef<number | null>(null)
  const dividerPointer = useRef<number | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(270)
  const [keyboardHeightRatio, setKeyboardHeightRatio] = useState<number | undefined>(undefined)
  const [workspaceHeight, setWorkspaceHeight] = useState(0)
  const [activePitches, setActivePitches] = useState<number[]>([])
  const [keyFeedback, setKeyFeedback] = useState<{ pitch: number; x: number }[]>([])
  const [devices, setDevices] = useState<readonly MidiDeviceDescriptor[]>([])
  const [midiError, setMidiError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [inputMessage, setInputMessage] = useState<string | null>(null)
  const [sampleState, setSampleState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [pedal, setPedal] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [exportFormat, setExportFormat] = useState<TranscriptionExportFormat>('pdf')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [showEditor, setShowEditor] = useState(false)
  const [selectingPassage, setSelectingPassage] = useState(false)
  const [showRecordMore, setShowRecordMore] = useState(false)
  const recordMoreRef = useRef<HTMLDivElement | null>(null)
  const recordMoreButtonRef = useRef<HTMLButtonElement | null>(null)
  const [sidebarHost, setSidebarHost] = useState<HTMLElement | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'takes' | 'notation' | 'inputs'>('inputs')
  const notes = useAppStore((state) => state.transcriptionNotes)
  const phase = useAppStore((state) => state.transcriptionPhase)
  const rawSettings = useAppStore((state) => state.transcriptionSettings)
  const settings = useMemo(() => normalizeTranscriptionSettings(rawSettings), [rawSettings])
  const settingsRef = useRef(settings); settingsRef.current = settings
  const workspace = useTranscriptionWorkspace()
  const media = useTranscriptionMedia(settings, workspace.session.id, () => setInputMessage('One recording input stopped. Notes and other inputs are still recording.'))
  const review = useTranscriptionReview(notes, workspace.session.durationMs, settings.exportAudioMix === 'recorded' ? 0 : settings.pianoVolume ?? 1)
  const takeMedia = useTakeMedia(workspace.session, media.assets)
  const hasRecordedAudio = takeMedia.segments.some((segment) => (segment.kind ?? segment.source.kind) === 'audio' || (segment.source.hasMicrophone && segment.kind == null && segment.source.kind == null))
  const [leadTime, setLeadTime] = useState(0)
  const mediaPreviews = takeMedia.atAll(phase === 'lead-in' ? leadTime : review.timeMs)
  const capturing = !['idle', 'stopped'].includes(phase)
  const reviewing = phase === 'stopped' && notes.length > 0
  phaseRef.current = phase

  useEffect(() => {
    if (!showRecordMore) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !recordMoreRef.current?.contains(event.target)) setShowRecordMore(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setShowRecordMore(false); recordMoreButtonRef.current?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [showRecordMore])

  useLayoutEffect(() => {
    const host = document.getElementById('transcription-sidebar-root')
    if (host !== sidebarHost) setSidebarHost(host)
  })

  const score = useMemo(() => buildScoreDocument(notes, settings), [notes, settings])
  const reviewIds = useMemo(() => notes.filter((note) => note.startMs <= review.timeMs && note.endMs > review.timeMs).map((note) => note.id), [notes, review.timeMs])
  const displayedScore = useMemo(() => {
    if (!review.playing) return score
    const index = Math.floor(review.timeMs * settings.bpm * 480 / 60000 / score.ticksPerMeasure)
    const start = Math.floor(index / 4) * 4
    return { ...score, measures: score.measures.slice(start, start + 4) }
  }, [review.playing, review.timeMs, score, settings.bpm])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const resize = () => {
      const height = root.clientHeight
      if (height <= 0) return
      const requestedHeight = customKeyboardRatio.current == null
        ? getKeyboardLayoutMetrics(height).keyboardHeight
        : height * customKeyboardRatio.current
      const nextHeight = clampKeyboardHeight(requestedHeight, height)
      setWorkspaceHeight(height)
      setKeyboardHeight(nextHeight)
      setKeyboardHeightRatio(nextHeight / height)
    }
    resize(); const observer = new ResizeObserver(resize); observer.observe(root)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const frame = requestAnimationFrame(() => setKeyFeedback(activePitches.map((pitch) => ({ pitch, x: getActiveVisualizerRenderer()?.getKeyX(pitch) ?? 0 }))))
    return () => cancelAnimationFrame(frame)
  }, [activePitches, keyboardHeight])

  const resizeKeyboard = (requestedHeight: number) => {
    const root = rootRef.current
    if (!root) return
    const height = root.clientHeight || root.getBoundingClientRect().height
    if (height <= 0) return
    const nextHeight = clampKeyboardHeight(requestedHeight, height)
    customKeyboardRatio.current = nextHeight / height
    setWorkspaceHeight(height)
    setKeyboardHeight(nextHeight)
    setKeyboardHeightRatio(nextHeight / height)
  }

  const resizeKeyboardFromPointer = (clientY: number) => {
    const bounds = rootRef.current?.getBoundingClientRect()
    if (!bounds) return
    resizeKeyboard(bounds.bottom - clientY)
  }

  const resetKeyboardHeight = () => {
    const root = rootRef.current
    if (!root) return
    const height = root.clientHeight || root.getBoundingClientRect().height
    if (height <= 0) return
    customKeyboardRatio.current = null
    const nextHeight = clampKeyboardHeight(getKeyboardLayoutMetrics(height).keyboardHeight, height)
    setWorkspaceHeight(height)
    setKeyboardHeight(nextHeight)
    setKeyboardHeightRatio(nextHeight / height)
  }

  useEffect(() => {
    const lease = acquireLiveMidiInput(); controller.current = lease
    let mounted = true; let initialized = false
    const unsubscribe = lease.controller.subscribe((event) => callbacks.current.receive(event, 'midi'))
    const unsubscribeControls = lease.controller.subscribeControls?.((event) => callbacks.current.receive(event, 'midi'))
    const unsubscribeDevices = lease.controller.subscribeDevices((available) => {
      if (!mounted) return
      setDevices(available)
      const selected = settingsRef.current.midiDeviceId
      if (initialized && selected && !available.some((device) => device.id === selected)) {
        callbacks.current.flush()
        useAppStore.getState().setTranscriptionSettings({ midiDeviceId: null })
      }
    })
    void lease.initialize().then((available) => {
      if (!mounted) return
      const selected = settingsRef.current.midiDeviceId
      const preferred = available.some((device) => device.id === selected) ? selected : available[0]?.id ?? null
      lease.controller.selectDevice(preferred)
      useAppStore.getState().setTranscriptionSettings({ midiDeviceId: preferred })
      initialized = true
    }).catch((error) => { if (mounted) setMidiError(explainMidiError(error)) })
    return () => { mounted = false; unsubscribe(); unsubscribeControls?.(); unsubscribeDevices(); lease.release(); controller.current = null }
  }, [])
  useEffect(() => {
    callbacks.current.flush()
    controller.current?.controller.selectDevice(settings.midiDeviceId)
  }, [settings.midiDeviceId])

  useEffect(() => {
    const renderer = getActiveVisualizerRenderer()
    renderer?.setLiveNoteSource?.(REVIEW_SOURCE, review.playing ? notes.filter((note) => reviewIds.includes(note.id)).map((note) => ({ id: note.id, pitch: note.pitch, velocity: note.velocity, startedAtMs: performance.now() })) : [])
    return () => renderer?.setLiveNoteSource?.(REVIEW_SOURCE, [])
  }, [review.playing, reviewIds, notes])

  const updateVisuals = () => {
    const values = [...live.current.values()].flat()
    getActiveVisualizerRenderer()?.setLiveNoteSource?.(MIDI_SOURCE, values.filter((note) => note.id.startsWith('midi:')))
    getActiveVisualizerRenderer()?.setLiveNoteSource?.(SAMPLE_SOURCE, values.filter((note) => note.id.startsWith('sample:')))
    setActivePitches([...new Set(values.map((note) => note.pitch))])
  }
  const flush = () => {
    capture.current.closeHeld(performance.now()); live.current.clear(); updateVisuals(); setPedal(false)
  }
  const receive = (event: LiveMidiInputEvent, sourceId: string) => {
    const scheduled = pending.current
    if (phaseRef.current === 'lead-in' && scheduled?.boundaryMs != null && event.timestampMs >= scheduled.boundaryMs) scheduled.enter?.()
    const limit = scheduled?.operation.kind === 'replace' ? scheduled.operation.endMs! - scheduled.operation.startMs : Infinity
    if (phaseRef.current === 'recording' && capture.current.elapsed(event.timestampMs) >= limit) { callbacks.current.stop(true); return }
    if (event.type === 'controlchange') {
      if (event.controller === 64) setPedal(event.value >= 64)
    } else {
      const key = `${sourceId}:${event.channel}:${event.pitch}`
      const queue = live.current.get(key) ?? []
      if (event.type === 'noteon') queue.push({ id: `${key}:${event.timestampMs}:${queue.length}`, pitch: event.pitch, velocity: event.velocity, startedAtMs: event.timestampMs })
      else queue.shift()
      if (queue.length) live.current.set(key, queue); else live.current.delete(key)
      updateVisuals()
    }
    if (phaseRef.current === 'recording') capture.current.receive({ ...event, sourceId })
  }
  const cancelCountdown = () => { if (countdownTimer.current != null) window.clearInterval(countdownTimer.current); countdownTimer.current = null; setCountdown(0) }
  const stopRecording = (completeRange = false) => {
    generation.current++
    cancelCountdown(); leadPlayer.current.stop(); sample.current = null; setSampleState('idle'); musicalClock.current.stop()
    if (['countdown', 'preparing', 'lead-in'].includes(phaseRef.current)) {
      void media.stop(0); pending.current = null; workspace.restoreCurrent()
      phaseRef.current = useAppStore.getState().transcriptionPhase; return
    }
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return
    const operation = pending.current?.operation ?? { kind: 'fresh' as const, startMs: 0 }
    const parent = pending.current?.parent ?? null
    const offset = pending.current?.mediaOffsetMs ?? 0
    const limit = operation.kind === 'replace' ? operation.endMs! - operation.startMs : Infinity
    const now = performance.now() - (completeRange ? Math.max(0, capture.current.elapsed(performance.now()) - limit) : 0)
    const completed = capture.current.stop(now)
    const duration = capture.current.elapsed(now)
    const events = capture.current.events(), id = takeId.current
    const finishedMedia = media.stop(duration + offset)
    pending.current = null
    if (operation.kind === 'replace' && duration < limit) {
      workspace.restoreCurrent(); phaseRef.current = useAppStore.getState().transcriptionPhase; flush(); setMessage('Replacement canceled. The original take is unchanged.'); return
    }
    const finish = (saved: Awaited<typeof finishedMedia>) => {
      const segments = saved?.map((asset) => ({ sourceId: asset.id, inputId: asset.inputId, kind: asset.kind, sourceOffsetMs: offset, startMs: operation.startMs, durationMs: duration })) ?? null
      workspace.finish(completed, events, duration, id, operation, parent, segments)
      phaseRef.current = 'stopped'
    }
    if (media.readyCount > 0) {
      phaseRef.current = 'finalizing'; useAppStore.getState().setTranscriptionPhase('finalizing')
      void finishedMedia.then(finish)
    } else finish(null)
    flush(); setElapsed(duration)
  }
  callbacks.current = { stop: stopRecording, receive, flush }

  useEffect(() => {
    if (phase !== 'recording') return
    let previous: readonly unknown[] | null = null
    const timer = window.setInterval(() => {
      const now = performance.now(); const time = capture.current.elapsed(now)
      const operation = pending.current?.operation
      if (operation?.kind === 'replace' && time >= operation.endMs! - operation.startMs) { callbacks.current.stop(true); return }
      setElapsed(time + (operation?.startMs ?? 0))
      const preview = capture.current.preview(now)
      if (preview !== previous) { previous = preview; useAppStore.getState().setTranscriptionNotes(operation && operation.kind !== 'fresh' ? spliceNotes(pending.current?.parent?.editedNotes ?? [], preview, operation, takeId.current) : preview) }
    }, 80)
    return () => window.clearInterval(timer)
  }, [phase])
  useEffect(() => {
    if (phase !== 'recording' || sampleState !== 'playing') return
    const timer = window.setInterval(() => {
      const current = sample.current
      if (!current) return
      const now = performance.now(); const elapsed = capture.current.elapsed(now)
      while (current.index < current.plan.events.length && current.plan.events[current.index].atMs <= elapsed) {
        const event = current.plan.events[current.index++]
        callbacks.current.receive({ ...event, timestampMs: now - elapsed + event.atMs }, 'sample')
        if (event.type === 'noteon') void audioScheduler.playLiveNote(event.pitch, event.velocity, event.durationMs)
      }
      if (elapsed >= current.plan.durationMs + 24) callbacks.current.stop()
    }, 16)
    return () => window.clearInterval(timer)
  }, [phase, sampleState])
  useEffect(() => {
    const clock = musicalClock.current
    const lead = leadPlayer.current
    const currentGeneration = generation
    const blur = () => callbacks.current.flush()
    const unload = () => callbacks.current.stop()
    window.addEventListener('blur', blur); window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('blur', blur); window.removeEventListener('beforeunload', unload)
      callbacks.current.stop(); callbacks.current.flush(); clock.dispose(); lead.stop(); currentGeneration.current++
      if (countdownTimer.current != null) window.clearInterval(countdownTimer.current)
      abortExport.current?.abort()
    }
  }, [])

  const beginRecording = (samplePlan?: SamplePlaybackPlan, operation: RecordingOperation = { kind: 'fresh', startMs: 0 }) => {
    if (capturing || exporting || media.finalizing || !workspace.ready) return
    setShowRecordMore(false)
    review.pause(); setMessage(null)
    if (operation.kind === 'fresh') { setShowEditor(false); setSelectingPassage(false) }
    const config = settingsRef.current
    const id = crypto.randomUUID(); takeId.current = id
    const token = ++generation.current
    const parent = workspace.session.durationMs > 0 ? { ...workspace.session, settings: config, editedNotes: notes } : null
    pending.current = { operation, parent, mediaOffsetMs: 0 }
    const start = (timestamp = performance.now(), mediaStarted = false) => {
      if (generation.current !== token || !pending.current) return
      cancelCountdown()
      if (!mediaStarted) media.start(id)
      capture.current.start(timestamp)
      useAppStore.getState().setTranscriptionNotes(operation.kind === 'fresh' ? [] : parent?.editedNotes ?? [])
      setElapsed(operation.startMs); setPedal(false)
      pending.current.enter = undefined
      if (samplePlan) { sample.current = { plan: samplePlan, index: 0 }; setSampleState('playing') }
      phaseRef.current = 'recording'; useAppStore.getState().setTranscriptionPhase('recording')
      if (!config.metronome) musicalClock.current.stop()
    }
    void audioScheduler.warmUp().catch(() => undefined)
    if (operation.kind !== 'fresh' && operation.startMs > 0 && parent) {
      phaseRef.current = 'preparing'; useAppStore.getState().setTranscriptionPhase('preparing')
      const barMs = 60000 / config.bpm * Number(config.meter.split('/')[0]) * 4 / Number(config.meter.split('/')[1])
      const leadStart = Math.max(0, operation.startMs - leadBars * barMs)
      void leadPlayer.current.prepare(parent.editedNotes, leadStart, operation.startMs, config.pianoVolume ?? 1).then((scheduled) => {
        if (!scheduled || generation.current !== token || !pending.current) return
        const mediaStart = performance.now(); media.start(id)
        pending.current.mediaOffsetMs = scheduled.endAtMs - mediaStart
        pending.current.boundaryMs = scheduled.endAtMs
        pending.current.enter = () => start(scheduled.endAtMs, true)
        setLeadTime(leadStart)
        phaseRef.current = 'lead-in'; useAppStore.getState().setTranscriptionPhase('lead-in')
        scheduled.play()
        countdownTimer.current = window.setInterval(() => {
          if (performance.now() >= scheduled.endAtMs) { start(scheduled.endAtMs, true); return }
          setLeadTime(leadStart + Math.max(0, performance.now() - scheduled.startAtMs))
        }, 10)
      }).catch((error) => {
        if (generation.current !== token) return
        leadPlayer.current.stop(); pending.current = null; workspace.restoreCurrent(); phaseRef.current = useAppStore.getState().transcriptionPhase
        setMessage(error instanceof Error ? error.message : 'Lead-in playback unavailable.')
      })
      return
    }
    const count = samplePlan ? 0 : config.countInBeats ?? 0
    if (count || config.metronome) void musicalClock.current.start(config.bpm, Number(config.meter.split('/')[1]), Number(config.meter.split('/')[0])).catch(() => setMessage('Metronome audio is unavailable; recording is still available.'))
    if (!count) { start(); return }
    phaseRef.current = 'countdown'; useAppStore.getState().setTranscriptionPhase('countdown'); setCountdown(count)
    const beatMs = 60000 / config.bpm * 4 / Number(config.meter.split('/')[1])
    const deadline = performance.now() + count * beatMs
    countdownTimer.current = window.setInterval(() => {
      const remaining = deadline - performance.now()
      if (remaining <= 0) start(deadline); else setCountdown(Math.ceil(remaining / beatMs))
    }, 25)
  }
  const togglePause = () => {
    if (phase === 'recording') {
      review.pause(); capture.current.pause(performance.now()); media.pause(); musicalClock.current.stop()
      phaseRef.current = 'paused'; useAppStore.getState().setTranscriptionPhase('paused'); flush()
    } else {
      capture.current.resume(performance.now()); media.resume(); phaseRef.current = 'recording'; useAppStore.getState().setTranscriptionPhase('recording')
      if (settings.metronome) void musicalClock.current.start(settings.bpm, Number(settings.meter.split('/')[1]), Number(settings.meter.split('/')[0])).catch(() => undefined)
    }
  }
  const playSample = async () => {
    if (sampleState !== 'idle' || capturing || exporting) return
    const token = ++generation.current; setSampleState('loading'); setMessage(null)
    try {
      const plan = createSamplePlaybackPlan(parseMidi(await loadSampleMidiBytes()))
      if (generation.current !== token) return
      useAppStore.getState().setTranscriptionSettings({ bpm: plan.bpm, meter: plan.meter })
      beginRecording(plan)
    } catch (error) { setSampleState('idle'); setMessage(error instanceof Error ? error.message : 'Could not load sample MIDI.') }
  }
  const handleKeyboardNote = (event: PointerKeyboardNoteEvent) => receive({ ...event, channel: 0 }, 'pointer')
  const newTake = () => {
    setShowRecordMore(false); review.pause(); generation.current++; sample.current = null; setSampleState('idle')
    capture.current.clear(); workspace.clear(); media.clear(); setElapsed(0); setShowEditor(false); setSelectingPassage(false)
  }
  const save = async () => {
    setShowRecordMore(false)
    review.pause(); setExporting(true); setMessage(null); setExportProgress(0)
    const exportsAudio = exportFormat === 'mp3' || exportFormat === 'mp4' || exportFormat === 'webm'
    if (exportsAudio && settings.exportAudioMix === 'recorded' && !hasRecordedAudio) {
      setExporting(false); setMessage('This take has no recorded audio. Choose Piano only or Piano + inputs in Export.'); return
    }
    abortExport.current = new AbortController()
    try {
      const path = await exportTranscription(notes, { ...settings, title: `${settings.title || 'Transcribed piano'} - ${workspace.session.name || 'Take'}` }, exportFormat, {
        originalNotes: workspace.session.originalNotes, events: workspace.session.events, durationMs: workspace.session.durationMs,
        cameraTimeline: takeMedia.segments, signal: abortExport.current.signal, onProgress: setExportProgress,
      })
      if (path) setMessage(`Saved to ${path}`)
    } catch (error) { setMessage(error instanceof DOMException && error.name === 'AbortError' ? 'Export canceled.' : error instanceof Error ? error.message : 'Export failed.') }
    finally { setExporting(false); abortExport.current = null }
  }
  const phaseLabel = !workspace.ready ? 'Loading takes' : phase === 'preparing' ? 'Preparing' : phase === 'lead-in' ? 'Lead-in' : phase === 'finalizing' ? 'Finalizing' : phase === 'countdown' ? `Starting in ${countdown}` : phase === 'stopped' ? 'Review' : phase === 'recording' ? 'Recording' : phase === 'paused' ? 'Paused' : 'Ready'
  const statusTime = formatTime(phase === 'lead-in' ? leadTime : capturing ? elapsed : workspace.session.durationMs)
  const midiReady = Boolean(settings.midiDeviceId && !midiError)
  const inputsReady = media.enabledCount > 0 && media.readyCount === media.enabledCount

  return <section ref={rootRef} className={styles.transcriptor} data-testid="transcriptor-mode">
    {sidebarHost ? createPortal(<div className={styles.transcriptionSidebar}>
      <header><h2>Transcription</h2></header>
      <div className={styles.sidebarTabs} role="tablist" aria-label="Transcription tools">
        {([{ id: 'inputs', label: 'Inputs', icon: Cable }, { id: 'notation', label: 'Notation', icon: ListMusic }, { id: 'takes', label: 'Takes', icon: Layers3 }] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={sidebarTab === tab.id} onClick={() => setSidebarTab(tab.id)}><AppIcon icon={tab.icon} size={16} />{tab.label}</button>)}
      </div>
      <div role="tabpanel" className={styles.sidebarPanel}>
        {sidebarTab === 'takes' ? <><TakesPanel takes={workspace.takes} activeId={workspace.session.id} disabled={capturing || exporting || media.finalizing || !workspace.ready} onSelect={(id) => { setShowRecordMore(false); review.pause(); workspace.activate(id); setShowEditor(false); setSelectingPassage(false) }} onUpdate={workspace.updateTake} onDelete={(id) => { review.pause(); workspace.deleteTake(id) }} undoDelete={workspace.deleted ? workspace.undoDelete : null} />{workspace.takes.length === 0 && <p className={styles.sidebarEmpty}>Your recorded takes will appear here.</p>}</> : <TranscriptionOptions compact section={sidebarTab} settings={settings} onChange={workspace.changeSettings} devices={media.devices} sourceStates={media.sourceStates} midiDevices={devices} disabled={capturing || exporting || media.finalizing} estimatedBpm={workspace.session.estimatedBpm} midiMessage={midiError} mediaMessage={media.sourceStates.some((entry) => entry.status === 'error') ? null : inputMessage} />}
      </div>
    </div>, sidebarHost) : null}
    <CanvasArea engine="three" keyboardOnly={settings.liveView !== 'fallingKeys'} keyboardHeightRatio={keyboardHeightRatio} keyboardPointerEnabled={!exporting && !review.playing && ['idle', 'stopped', 'recording'].includes(phase) && sampleState === 'idle'} onKeyboardNote={handleKeyboardNote} />
    <div className={`${styles.scoreRegion} ${settings.liveView === 'fallingKeys' ? styles.fallingKeysRegion : ''}`} style={{ bottom: `${keyboardHeight}px` }}>
      <div className={styles.transcriptorToolbar}>
        <div className={`${styles.toolbarGroup} ${styles.toolbarSetup}`}>
          <label>Title <input aria-label="Transcription title" value={settings.title} maxLength={120} disabled={exporting || capturing} onChange={(event) => workspace.changeSettings({ title: event.target.value })} /></label>
          <label>BPM <input aria-label="Transcription BPM" type="number" min="20" max="300" value={settings.bpm} disabled={capturing || exporting} onChange={(event) => workspace.changeSettings({ bpm: Number(event.target.value), tempoMode: 'manual' })} /></label>
          <label>Meter <select aria-label="Transcription meter" value={settings.meter} disabled={capturing || exporting} onChange={(event) => workspace.changeSettings({ meter: event.target.value as '3/4' | '4/4' | '6/8' })}><option>3/4</option><option>4/4</option><option>6/8</option></select></label>
          <label>View <select aria-label="Live visualization" value={settings.liveView ?? 'score'} disabled={exporting} onChange={(event) => workspace.changeSettings({ liveView: event.target.value as 'score' | 'fallingKeys' })}><option value="score">Score</option><option value="fallingKeys">Falling keys</option></select></label>
        </div>
        {!reviewing && <div className={`${styles.toolbarGroup} ${styles.toolbarActions}`} aria-label="Recording controls">
          {capturing ? <>
            <button type="button" className={styles.stopButton} disabled={phase === 'finalizing'} onClick={() => stopRecording()}><AppIcon icon={Square} size={16} /> {phase === 'finalizing' ? 'Saving take…' : phase === 'countdown' ? 'Cancel count-in' : phase === 'lead-in' || phase === 'preparing' ? 'Cancel lead-in' : 'Stop'}</button>
            {(phase === 'recording' || phase === 'paused') && <button type="button" className={styles.sampleButton} onClick={togglePause}>{phase === 'paused' ? 'Resume' : 'Pause'}</button>}
          </> : <button type="button" className={styles.recordButton} disabled={!workspace.ready || exporting || media.finalizing || sampleState !== 'idle'} onClick={() => beginRecording()}><AppIcon icon={Circle} size={16} /> Record</button>}
          {!capturing && <button type="button" title="Create a demonstration take from the bundled MIDI sample" className={styles.demoButton} disabled={exporting || media.finalizing || sampleState !== 'idle'} onClick={() => void playSample()}><AppIcon icon={Play} size={16} />{sampleState === 'loading' ? 'Loading sample…' : 'Record sample'}</button>}
        </div>}
        {!capturing && <TranscriptionExportPanel key={workspace.session.id} settings={settings} format={exportFormat} takeName={workspace.session.name || 'Take'} disabled={!workspace.ready || media.finalizing || notes.length === 0} exporting={exporting} progress={exportProgress} hasRecordedAudio={hasRecordedAudio} onFormatChange={setExportFormat} onSettingsChange={workspace.changeSettings} onOpen={() => { review.pause(); setShowRecordMore(false) }} onExport={() => void save()} onCancel={() => abortExport.current?.abort()} />}
      </div>
      <div className={styles.inputStatus} aria-label="Transcription status" aria-live="polite">
        <span className={`${styles.statusPrimary} ${phase === 'recording' ? styles.recordingIndicator : ''}`}>{phaseLabel} <time>{statusTime}</time></span>
        <span className={`${styles.statusItem} ${midiReady ? styles.statusReady : styles.statusOff}`} aria-label={midiReady ? 'MIDI connected' : 'MIDI not connected'}>MIDI {midiReady ? 'on' : 'off'}</span>
        <span className={`${styles.statusItem} ${inputsReady ? styles.statusReady : styles.statusOff}`} aria-label={media.enabledCount ? `${media.readyCount} of ${media.enabledCount} recording inputs ready` : 'Recording inputs off'}>Inputs {media.enabledCount ? `${media.readyCount}/${media.enabledCount}` : 'off'}</span>
        {activePitches.length > 0 && <span className={`${styles.statusItem} ${styles.statusActive}`} aria-label={`${activePitches.length} active ${activePitches.length === 1 ? 'key' : 'keys'}`}>{activePitches.length} {activePitches.length === 1 ? 'key' : 'keys'}</span>}
        {pedal && <span className={`${styles.statusItem} ${styles.statusActive}`} aria-label="Sustain pedal down">Pedal</span>}
        {media.finalizing && <span className={`${styles.statusItem} ${styles.statusActive}`}>Saving media…</span>}
      </div>
      {message && <p role="status" className={styles.midiMessage}>{message}</p>}
      {[workspace.warning, takeMedia.warning, review.error].filter(Boolean).map((error, i) => <p key={i} className={styles.midiMessage}>{error}</p>)}
      {reviewing && <div className={styles.reviewBar}>
        <button type="button" disabled={exporting || media.finalizing} onClick={review.toggle}><AppIcon icon={review.playing ? Pause : Play} size={16} />{review.loading ? 'Preparing audio…' : review.playing ? 'Pause review' : 'Play review'}</button>
        <input type="range" aria-label="Transcription review position" min="0" max={review.duration} value={review.timeMs} onChange={(event) => review.seek(Number(event.target.value))} disabled={exporting} />
        <span>{formatTime(review.timeMs)} / {formatTime(review.duration)}</span>
        <button type="button" disabled={exporting} aria-expanded={showEditor} onClick={() => { setShowRecordMore(false); review.pause(); setSelectingPassage(false); setShowEditor(!showEditor) }}>{showEditor ? 'Hide editor' : 'Correct notes'}</button>
        <div className={styles.recordMore} ref={recordMoreRef}>
          <button ref={recordMoreButtonRef} type="button" aria-expanded={showRecordMore} aria-controls="transcription-record-more" disabled={exporting || media.finalizing || !workspace.ready} onClick={() => setShowRecordMore(!showRecordMore)}>Record more <AppIcon icon={ChevronDown} size={16} /></button>
          {showRecordMore && <div id="transcription-record-more" className={styles.recordMorePanel} role="region" aria-label="Record more options">
            <label>Lead-in <select aria-label="Lead-in bars" value={leadBars} onChange={(event) => setLeadBars(Number(event.target.value))}>{[1, 2, 4].map((bars) => <option key={bars} value={bars}>{bars} {bars === 1 ? 'bar' : 'bars'}</option>)}</select></label>
            <button type="button" onClick={() => beginRecording(undefined, { kind: 'continue', startMs: Math.max(workspace.session.durationMs, ...notes.map((note) => note.endMs)) })}>Continue take</button>
            <button type="button" onClick={() => { setShowRecordMore(false); review.pause(); setSelectingPassage(true); setShowEditor(true); setRange({ startMs: 0, endMs: Math.min(workspace.session.durationMs, 60000 / settings.bpm * Number(settings.meter.split('/')[0]) * 4 / Number(settings.meter.split('/')[1])) }) }}>Replace passage</button>
            <button type="button" title="Start a blank take. Existing takes remain saved." onClick={newTake}><AppIcon icon={FilePlus2} size={16} /> New take</button>
          </div>}
        </div>
      </div>}
      <div className={styles.scoreCanvasArea}>
        <div className={styles.scoreDocument}><ScoreSheet score={displayedScore} showChordNames={settings.chordNamesEnabled} autoScroll={phase === 'recording'} selectedIds={review.playing ? reviewIds : workspace.selectedIds} onSelect={(ids) => { if (!capturing && !exporting) { review.pause(); workspace.select(ids); setShowEditor(true) } }} /></div>
        {!['stopped', 'lead-in'].includes(phase) && media.sourceStates.filter((entry) => entry.status === 'ready' && entry.source.kind === 'video' && entry.stream).map((entry) => {
          const source = settings.mediaSources?.find((candidate) => candidate.id === entry.source.id) ?? entry.source
          return <WebcamOverlay key={entry.source.id} label={source.name} stream={entry.stream} overlay={source.overlay ?? settings.webcamOverlay!} onChange={(overlay) => settings.mediaSources?.length ? workspace.changeSettings({ mediaSources: settings.mediaSources.map((candidate) => candidate.id === source.id ? { ...candidate, overlay } : candidate) }) : workspace.changeSettings({ webcamOverlay: overlay })} disabled={exporting} />
        })}
        {['stopped', 'lead-in'].includes(phase) && mediaPreviews.filter((entry) => (entry.segment.kind ?? entry.segment.source.kind ?? 'video') === 'video').map((entry) => <WebcamOverlay key={`${entry.segment.sourceId}:${entry.segment.startMs}`} label={entry.config?.name ?? entry.segment.source.name ?? 'Camera'} stream={null} recordedUrl={entry.url} overlay={entry.config?.overlay ?? settings.webcamOverlay!} onChange={(overlay) => entry.config && workspace.changeSettings({ mediaSources: (settings.mediaSources ?? []).map((source) => source.id === entry.config!.id ? { ...source, overlay } : source) })} disabled={exporting || !entry.config} timeMs={entry.timeMs} playing={review.playing || phase === 'lead-in'} microphoneVolume={0} />)}
        {['stopped', 'lead-in'].includes(phase) && settings.exportAudioMix !== 'synth' && mediaPreviews.filter((entry) => (entry.segment.kind ?? entry.segment.source.kind) === 'audio').map((entry) => <RecordedAudioLayer key={`${entry.segment.sourceId}:${entry.segment.startMs}`} url={entry.url} timeMs={entry.timeMs} playing={review.playing || phase === 'lead-in'} volume={entry.config?.volume ?? 1} />)}
      </div>
      {showEditor && phase === 'stopped' && !exporting && <TranscriptionEditor notes={notes} settings={settings} selectedIds={workspace.selectedIds} onSelect={workspace.select} onEdit={(updated) => { review.pause(); workspace.edit(updated) }} onUndo={workspace.undo} onRedo={workspace.redo} canUndo={workspace.canUndo} canRedo={workspace.canRedo} range={selectingPassage ? range : undefined} onRangeChange={setRange} takeDurationMs={workspace.session.durationMs} onReplace={() => beginRecording(undefined, { kind: 'replace', ...range })} />}
    </div>
    <div
      role="separator"
      aria-label="Resize score and keyboard"
      aria-orientation="horizontal"
      aria-valuemin={getKeyboardHeightBounds(workspaceHeight).min}
      aria-valuemax={getKeyboardHeightBounds(workspaceHeight).max}
      aria-valuenow={keyboardHeight}
      aria-valuetext={workspaceHeight > 0 ? `${Math.round(keyboardHeight / workspaceHeight * 100)}% keyboard` : undefined}
      className={styles.scoreKeyboardDivider}
      style={{ bottom: `${keyboardHeight - 6}px` }}
      tabIndex={0}
      title="Drag to resize the score and keyboard. Double-click to reset."
      onDoubleClick={resetKeyboardHeight}
      onPointerDown={(event) => {
        dividerPointer.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        resizeKeyboardFromPointer(event.clientY)
      }}
      onPointerMove={(event) => {
        if (dividerPointer.current === event.pointerId) resizeKeyboardFromPointer(event.clientY)
      }}
      onPointerUp={(event) => {
        if (dividerPointer.current !== event.pointerId) return
        dividerPointer.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => { dividerPointer.current = null }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') { event.preventDefault(); resizeKeyboard(keyboardHeight + KEYBOARD_RESIZE_STEP) }
        if (event.key === 'ArrowDown') { event.preventDefault(); resizeKeyboard(keyboardHeight - KEYBOARD_RESIZE_STEP) }
        if (event.key === 'Home') { event.preventDefault(); resizeKeyboard(getKeyboardHeightBounds(workspaceHeight).min) }
        if (event.key === 'End') { event.preventDefault(); resizeKeyboard(getKeyboardHeightBounds(workspaceHeight).max) }
      }}
    />
    {settings.keyLabelsEnabled && keyFeedback.map((entry) => <span key={entry.pitch} className={styles.keyFeedback} style={{ left: entry.x, top: `calc(100% - ${keyboardHeight + 28}px)` }}>{formatPitch(entry.pitch)}</span>)}
  </section>
}

async function loadSampleMidiBytes(): Promise<Uint8Array> {
  const bridge = window.electronAPI?.samplePieces
  if (bridge) { const available = await bridge.list(); const name = available.includes(SAMPLE_FILE) ? SAMPLE_FILE : available[0]; if (name) return bridge.read(name) }
  const response = await fetch(`/sample-pieces/${encodeURIComponent(SAMPLE_FILE)}`)
  if (!response.ok) throw new Error('The Transcription sample MIDI is unavailable.')
  return new Uint8Array(await response.arrayBuffer())
}
function formatPitch(pitch: number): string { return `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}` }
function formatTime(ms: number): string { const seconds = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
