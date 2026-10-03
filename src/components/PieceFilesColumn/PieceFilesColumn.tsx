import React, { useState } from 'react'
import { FilePlus2, FolderOpen, LoaderCircle, Music2, Save } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { isMidiFilePath } from '../../midi/loadMidiProject'
import { chooseAndLoadLuminaProject, saveCurrentLuminaProject } from '../../project/luminaProject'
import { openAndLoadMusicXmlFile } from '../../musicxml/loadMusicXmlProject'
import { useAppStore, type Piece } from '../../store/store'
import styles from './PieceFilesColumn.module.css'

const columnStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const headingStyle = {
  color: 'var(--color-text-header)',
} as const

const activeItemStyle = {
  backgroundColor: 'var(--color-icon)',
  color: 'var(--color-text-body)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
} as const

interface PieceFilesColumnProps {
  isSamplePiecesSelected?: boolean
  onSelectPieceSource?: (source: 'new' | 'samples') => void
}

export function PieceFilesColumn({
  isSamplePiecesSelected = false,
  onSelectPieceSource = () => undefined,
}: PieceFilesColumnProps) {
  const [activeAction, setActiveAction] = useState<'midi' | 'score' | 'open' | 'save' | null>(null)
  const [projectMessage, setProjectMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null)
  const addPiece = useAppStore((state) => state.addPiece)
  const loadPiece = useAppStore((state) => state.loadPiece)
  const pieces = useAppStore((state) => state.pieces)
  const currentPieceId = useAppStore((state) => state.currentPieceId)
  const isProjectLoaded = useAppStore((state) => state.isProjectLoaded)
  const currentName = pieces.find((piece) => piece.id === currentPieceId)?.name ?? 'Untitled Project'
  const addMidi = async () => {
    if (activeAction != null) return
    const picker = window.electronAPI?.openMidiFile ?? window.electronAPI?.dialog?.openMidiFile
    if (typeof picker !== 'function') return
    setActiveAction('midi')
    try {
      const filePath = await picker()
      if (!filePath || !isMidiFilePath(filePath)) return
      const piece = createPiece(filePath)
      addPiece(piece)
      await loadPiece(piece.id)
      onSelectPieceSource('new')
    } finally { setActiveAction(null) }
  }

  const rememberProject = (result: { filePath: string; name: string }) => {
    const existing = useAppStore.getState().pieces.find((piece) => piece.filePath === result.filePath)
    const piece: Piece = {
      createdAt: existing?.createdAt ?? Date.now(), filePath: result.filePath,
      id: existing?.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
      name: result.name, type: 'project',
    }
    addPiece(piece)
    useAppStore.setState({ currentPieceId: piece.id })
    onSelectPieceSource('new')
  }

  const addScore = async () => {
    if (activeAction != null) return
    setActiveAction('score'); setProjectMessage(null)
    try {
      const result = await openAndLoadMusicXmlFile()
      if (result != null) {
        const existing = useAppStore.getState().pieces.find((piece) => piece.filePath === result.filePath)
        const piece: Piece = { createdAt: existing?.createdAt ?? Date.now(), filePath: result.filePath, id: existing?.id ?? globalThis.crypto?.randomUUID?.() ?? `score-${Date.now()}`, name: result.name, type: 'musicxml' }
        addPiece(piece); useAppStore.setState({ currentPieceId: piece.id }); onSelectPieceSource('new')
        setProjectMessage({ kind: 'status', text: 'Score imported' })
      }
    } catch (error) {
      console.error('Failed to import MusicXML:', error)
      setProjectMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not import score.' })
    } finally { setActiveAction(null) }
  }

  const openProject = async () => {
    if (activeAction != null) return
    setActiveAction('open'); setProjectMessage(null)
    try {
      const result = await chooseAndLoadLuminaProject()
      if (result != null) { rememberProject(result); setProjectMessage({ kind: 'status', text: 'Project opened' }) }
    } catch (error) {
      console.error('Failed to open Lumina project:', error)
      setProjectMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not open project.' })
    } finally { setActiveAction(null) }
  }

  const saveProject = async () => {
    if (activeAction != null || !isProjectLoaded) return
    setActiveAction('save'); setProjectMessage(null)
    try {
      const result = await saveCurrentLuminaProject(currentName)
      if (result != null) { rememberProject(result); setProjectMessage({ kind: 'status', text: 'Project saved' }) }
    } catch (error) {
      console.error('Failed to save Lumina project:', error)
      setProjectMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save project.' })
    } finally { setActiveAction(null) }
  }
  return (
    <section className={styles.column} data-testid="piece-files-column" style={columnStyle}>
      <h2 className={styles.heading} style={headingStyle}>Library</h2>
      <div className={styles.importActions}>
        <button type="button" className={styles.addMidiButton} disabled={activeAction != null} onClick={() => void addMidi()}>
          <AppIcon className={activeAction === 'midi' ? styles.loadingIcon : undefined} icon={activeAction === 'midi' ? LoaderCircle : FilePlus2} size={18} />
          {activeAction === 'midi' ? 'Opening…' : 'Add MIDI'}
        </button>
        <button type="button" className={styles.addMidiButton} disabled={activeAction != null} onClick={() => void addScore()}>
          <AppIcon className={activeAction === 'score' ? styles.loadingIcon : undefined} icon={activeAction === 'score' ? LoaderCircle : Music2} size={18} />
          {activeAction === 'score' ? 'Opening…' : 'Add score'}
        </button>
      </div>
      <div className={styles.projectActions}>
        <button type="button" className={styles.projectButton} disabled={activeAction != null} onClick={() => void openProject()}>
          <AppIcon className={activeAction === 'open' ? styles.loadingIcon : undefined} icon={activeAction === 'open' ? LoaderCircle : FolderOpen} size={16} />
          Open project
        </button>
        <button type="button" className={styles.projectButton} disabled={activeAction != null || !isProjectLoaded} onClick={() => void saveProject()}>
          <AppIcon className={activeAction === 'save' ? styles.loadingIcon : undefined} icon={activeAction === 'save' ? LoaderCircle : Save} size={16} />
          Save project
        </button>
      </div>
      {projectMessage != null ? <p className={projectMessage.kind === 'error' ? styles.errorMessage : styles.statusMessage} role={projectMessage.kind === 'error' ? 'alert' : 'status'}>{projectMessage.text}</p> : null}

      <div className={styles.listFrame}>
        <button
          type="button"
          className={`${styles.itemButton} ${!isSamplePiecesSelected ? styles.activeItem : ''}`}
          aria-pressed={!isSamplePiecesSelected}
          style={!isSamplePiecesSelected ? activeItemStyle : undefined}
          onClick={() => onSelectPieceSource('new')}
        >
          All pieces
        </button>

        <button
          type="button"
          className={`${styles.itemButton} ${isSamplePiecesSelected ? styles.activeItem : ''}`}
          aria-pressed={isSamplePiecesSelected}
          style={isSamplePiecesSelected ? activeItemStyle : undefined}
          onClick={() => onSelectPieceSource('samples')}
        >
          Samples
        </button>
      </div>

    </section>
  )
}

function createPiece(filePath: string): Piece {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath
  return { createdAt: Date.now(), filePath, id: globalThis.crypto?.randomUUID?.() ?? `piece-${Date.now()}`, name: fileName.replace(/\.[^.]+$/, '') || fileName, type: 'midi' }
}
