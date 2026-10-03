import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/store'
import { createSession, moveHistory, pushEdit, readSession, saveSession, type EditHistory } from '../../transcription/session'
import { estimateTempo } from '../../transcription/analysis'
import { assembleTake } from '../../transcription/takes'
import { readCameraTake, readTakeCollection, saveCameraTake, saveTakeCollection } from '../../transcription/mediaStorage'
import type { CapturedNote, MediaSegment, RecordingOperation, TakeCollection, TranscriptionInputEvent, TranscriptionSession, TranscriptionSettings } from '../../transcription/types'

const notationKeys = new Set(['bpm', 'tempoMode', 'meter', 'quantization', 'keySignature', 'staffSplit', 'minimumNoteMs', 'chordToleranceMs'])
const historyFor = (session: TranscriptionSession): EditHistory => ({ past: [], present: { notes: session.editedNotes, settings: session.settings }, future: [] })

export function useTranscriptionWorkspace() {
  const [session, setSession] = useState<TranscriptionSession>(() => {
    const state = useAppStore.getState(), saved = readSession()
    const next = saved && (state.transcriptionNotes.length === 0 || JSON.stringify(state.transcriptionNotes) === JSON.stringify(saved.editedNotes)) ? saved : createSession(state.transcriptionSettings, state.transcriptionNotes)
    return { ...next, name: next.name ?? 'Take 1', settings: { ...next.settings, webcamEnabled: false, microphoneEnabled: false, mediaSources: next.settings.mediaSources?.map((source) => ({ ...source, enabled: false })) } }
  })
  const sessionRef = useRef(session)
  const [collection, setCollection] = useState<TakeCollection>({ version: 2, activeTakeId: session.editedNotes.length ? session.id : null, takes: session.editedNotes.length ? [session] : [] })
  const collectionRef = useRef(collection)
  const [ready, setReady] = useState(typeof indexedDB === 'undefined')
  const [warning, setWarning] = useState<string | null>(null)
  const [selectedIds, select] = useState<readonly string[]>([])
  const [history, setHistory] = useState<EditHistory>(() => historyFor(session))
  const historyRef = useRef(history)
  const histories = useRef(new Map<string, EditHistory>())
  const [deleted, setDeleted] = useState<TranscriptionSession | null>(null)
  const saves = useRef(Promise.resolve())
  const loadFailed = useRef(false)
  const revision = useRef(0)

  const activate = (next: TranscriptionSession, restoring = false) => {
    histories.current.set(sessionRef.current.id, historyRef.current)
    const state = useAppStore.getState()
    const settings = { ...next.settings, webcamEnabled: restoring ? false : state.transcriptionSettings.webcamEnabled, microphoneEnabled: restoring ? false : state.transcriptionSettings.microphoneEnabled, mediaSources: restoring ? next.settings.mediaSources?.map((source) => ({ ...source, enabled: false })) : next.settings.mediaSources }
    const active = { ...next, settings }
    sessionRef.current = active; setSession(active); select([])
    const nextHistory = histories.current.get(next.id) ?? historyFor(active)
    historyRef.current = nextHistory; setHistory(nextHistory)
    state.setTranscriptionNotes(next.editedNotes); state.setTranscriptionSettings(settings)
    state.setTranscriptionPhase(next.editedNotes.length || next.durationMs ? 'stopped' : 'idle')
  }
  const storeCollection = (next: TakeCollection) => {
    revision.current++; collectionRef.current = next; setCollection(next)
    if (typeof indexedDB === 'undefined') return
    if (loadFailed.current) { setWarning('Recovery is unavailable. The saved collection has not been overwritten. Export your take before closing.'); return }
    saves.current = saves.current.then(() => saveTakeCollection(next)).then(() => setWarning(null)).catch(() => setWarning('This take is in memory, but saving the take collection failed. Previous saved takes are safe; export before closing.'))
  }
  useEffect(() => {
    let canceled = false
    if (!useAppStore.getState().transcriptionNotes.length && session.editedNotes.length) activate(session, true)
    if (typeof indexedDB === 'undefined') return
    void (async () => {
      try {
        const saved = await readTakeCollection()
        if (canceled || revision.current) return
        if (saved) {
          collectionRef.current = saved; setCollection(saved)
          const active = saved.takes.find((take) => take.id === saved.activeTakeId) ?? saved.takes[0]
          if (active) activate(active, true)
          else activate(createSession(useAppStore.getState().transcriptionSettings), true)
        } else if (session.editedNotes.length) {
          const camera = await readCameraTake(session.id)
          const migrated = { ...session, mediaSegments: camera ? [{ sourceId: camera.id, sourceOffsetMs: 0, startMs: 0, durationMs: session.durationMs }] : [] }
          if (camera) await saveCameraTake(camera)
          const next: TakeCollection = { version: 2, activeTakeId: migrated.id, takes: [migrated] }
          await saveTakeCollection(next)
          if (!canceled) { collectionRef.current = next; setCollection(next); activate(migrated, true) }
        }
      } catch { loadFailed.current = true; if (!canceled) setWarning('Saved takes could not be loaded. Existing recovery data is untouched; export new recordings before closing.') }
      finally { if (!canceled) setReady(true) }
    })()
    return () => { canceled = true }
  // Hydration runs once; recording controls wait for ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = (next: TranscriptionSession) => {
    sessionRef.current = next; setSession(next)
    const warning = saveSession(next); if (warning) setWarning(warning)
    const current = collectionRef.current
    const takes = current.takes.some((take) => take.id === next.id) ? current.takes.map((take) => take.id === next.id ? next : take) : [...current.takes, next]
    storeCollection({ version: 2, activeTakeId: next.id, takes })
  }
  const applyHistory = (next: EditHistory) => {
    historyRef.current = next; setHistory(next)
    const state = useAppStore.getState()
    const settings = { ...next.present.settings, ...Object.fromEntries(Object.entries(state.transcriptionSettings).filter(([key]) => !notationKeys.has(key))) }
    state.setTranscriptionNotes(next.present.notes); state.setTranscriptionSettings(settings)
    persist({ ...sessionRef.current, editedNotes: next.present.notes, settings })
  }
  const finish = (notes: readonly CapturedNote[], events: readonly TranscriptionInputEvent[], durationMs: number, id = crypto.randomUUID(), operation: RecordingOperation = { kind: 'fresh', startMs: 0 }, parent: TranscriptionSession | null = null, media: MediaSegment | readonly MediaSegment[] | null = null) => {
    const state = useAppStore.getState()
    const estimatedBpm = operation.kind === 'fresh' ? estimateTempo(notes) : parent?.estimatedBpm ?? null
    const settings = { ...state.transcriptionSettings, ...(operation.kind === 'fresh' && state.transcriptionSettings.tempoMode === 'auto' && estimatedBpm != null ? { bpm: estimatedBpm } : {}) }
    const used = new Set(collectionRef.current.takes.map((take) => take.name))
    let number = 1; while (used.has(`Take ${number}`)) number++
    const next = { ...assembleTake(parent, notes, events, durationMs, settings, id, `Take ${number}`, operation, media), estimatedBpm }
    activate(next); persist(next)
  }
  return {
    session, sessionRef, takes: collection.takes, ready, warning, selectedIds, select, finish, deleted,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    activate: (id: string) => {
      const next = collectionRef.current.takes.find((take) => take.id === id)
      if (next) { activate(next); saveSession(next); storeCollection({ ...collectionRef.current, activeTakeId: id }) }
    },
    restoreCurrent: () => activate(sessionRef.current),
    updateTake: (id: string, patch: { name?: string; favorite?: boolean }) => {
      const takes = collectionRef.current.takes.map((take) => take.id === id ? { ...take, ...patch, name: patch.name?.trim().slice(0, 80) || take.name } : take)
      const active = takes.find((take) => take.id === sessionRef.current.id)
      if (active) { sessionRef.current = active; setSession(active); saveSession(active) }
      storeCollection({ ...collectionRef.current, takes })
    },
    deleteTake: (id: string) => {
      const current = collectionRef.current, removed = current.takes.find((take) => take.id === id)
      if (!removed) return
      setDeleted(removed)
      const takes = current.takes.filter((take) => take.id !== id)
      const active = id === current.activeTakeId ? takes.at(-1) : takes.find((take) => take.id === current.activeTakeId)
      if (id === sessionRef.current.id) { const next = active ?? createSession(useAppStore.getState().transcriptionSettings); activate(next); saveSession(next) }
      storeCollection({ version: 2, activeTakeId: active?.id ?? null, takes })
    },
    undoDelete: () => { if (deleted) { const next = { ...collectionRef.current, takes: [...collectionRef.current.takes, deleted], activeTakeId: deleted.id }; activate(deleted); saveSession(deleted); storeCollection(next); setDeleted(null) } },
    edit: (notes: readonly CapturedNote[]) => applyHistory(pushEdit(historyRef.current, { notes, settings: useAppStore.getState().transcriptionSettings })),
    changeSettings: (patch: Partial<TranscriptionSettings>) => {
      const state = useAppStore.getState(), previous = { notes: state.transcriptionNotes, settings: state.transcriptionSettings }
      state.setTranscriptionSettings(patch)
      if (state.transcriptionPhase === 'stopped') {
        if (Object.keys(patch).some((key) => notationKeys.has(key))) applyHistory(pushEdit({ ...historyRef.current, present: previous }, { ...previous, settings: useAppStore.getState().transcriptionSettings }))
        else persist({ ...sessionRef.current, settings: useAppStore.getState().transcriptionSettings })
      }
    },
    undo: () => applyHistory(moveHistory(historyRef.current, 'undo')),
    redo: () => applyHistory(moveHistory(historyRef.current, 'redo')),
    clear: () => {
      const next = createSession(useAppStore.getState().transcriptionSettings)
      activate(next); saveSession(next)
      storeCollection({ ...collectionRef.current, activeTakeId: null })
    },
  }
}
