import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/store'
import { applyLuminaProjectDocument, createLuminaProjectDocument, type LuminaProjectDocument } from './luminaProject'
import { readRecovery, writeRecovery } from './recoveryStorage'
import styles from './ProjectRecovery.module.css'

export function ProjectRecovery() {
  const [pending, setPending] = useState<LuminaProjectDocument | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef('')
  const hasProject = useAppStore(state => state.projectData != null)
  useEffect(() => {
    let active = true
    if (typeof indexedDB === 'undefined') return
    void readRecovery().then(document => {
      if (active) { setPending(document); setReady(true) }
    }).catch(() => {
      if (active) setError('Recovery could not be read. Save your project before closing. Existing recovery is untouched.')
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!ready || pending != null) return
    let saving = false
    let active = true
    const save = async () => {
      const state = useAppStore.getState()
      if (saving || state.projectData == null || (state.appMode !== 'create' && state.appMode !== 'select')) return
      saving = true
      try {
        const name = state.pieces.find(piece => piece.id === state.currentPieceId)?.name ?? 'Recovered project'
        const document = createLuminaProjectDocument(state, name)
        // Playback ticks are not edits; avoid rewriting storage on every frame.
        const signature = JSON.stringify({ projectData: document.projectData, workspace: { ...document.workspace, playback: { ...document.workspace.playback, currentTick: 0 } } })
        if (signature === lastSaved.current) return
        await writeRecovery(document)
        lastSaved.current = signature
        if (active) setError(null)
      } catch {
        if (active) setError('Recovery could not be saved. Save your project before closing.')
      } finally { saving = false }
    }
    const timer = setInterval(() => { void save() }, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [pending, ready])
  const resolve = async (restore: boolean) => {
    if (busy || pending == null) return
    setBusy(true)
    try {
      if (restore) await applyLuminaProjectDocument(pending)
      else await writeRecovery(null)
      setPending(null)
      lastSaved.current = ''
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not recover this project. Your recovery copy is retained.')
    } finally { setBusy(false) }
  }
  if (pending == null && error == null) return null
  return <aside className={styles.banner} aria-label="Project recovery">
    {pending != null && <><span>Resume “{pending.name}”?</span>
      <button type="button" disabled={busy || hasProject} title={hasProject ? 'Restart Lumina before restoring this session to avoid replacing your current work.' : undefined} onClick={() => void resolve(true)}>Restore</button>
      <button type="button" disabled={busy} onClick={() => void resolve(false)}>Discard recovery</button>
      {hasProject && <span>Restart to restore; your current project stays open.</span>}
    </>}
    {error && <span role="alert">{error}</span>}
  </aside>
}
