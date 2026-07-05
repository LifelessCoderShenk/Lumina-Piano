import React, { useState } from 'react'

import { isMidiFilePath } from '../../midi/loadMidiProject'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { type Piece, useAppStore } from '../../store/store'
import styles from './TopBar.module.css'

const topBarStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const iconButtonStyle = {
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-icon)',
} as const

interface TopBarProps {
  isSettingsOpen?: boolean
  onToggleSettings?: () => void
}

export function TopBar({ isSettingsOpen = false, onToggleSettings }: TopBarProps) {
  const [isOpeningFile, setIsOpeningFile] = useState(false)
  const addPiece = useAppStore((state) => state.addPiece)
  const clearLoadedPiece = useAppStore((state) => state.clearLoadedPiece)
  const enterCameraMode = useAppStore((state) => state.enterCameraMode)
  const enterRecordMode = useAppStore((state) => state.enterRecordMode)
  const loadPiece = useAppStore((state) => state.loadPiece)
  const isProjectLoaded = useAppStore((state) => state.isProjectLoaded)

  const handleAddPiece = async () => {
    if (isOpeningFile) {
      return
    }

    const electronApi = window.electronAPI
    const openFile = electronApi?.openMidiFile ?? electronApi?.dialog?.openMidiFile
    if (typeof openFile !== 'function') {
      console.error('Piece file picker bridge is unavailable.')
      return
    }

    setIsOpeningFile(true)

    try {
      const filePath = await openFile()
      if (filePath == null) {
        return
      }

      const piece = createPieceFromFilePath(filePath)
      addPiece(piece)

      if (piece.type !== 'midi') {
        return
      }

      await loadPiece(piece.id)
    } finally {
      setIsOpeningFile(false)
    }
  }

  const handleClearLoadedPiece = () => {
    playbackEngine.pause()
    playbackEngine.seek(0)
    clearLoadedPiece()
  }

  const cameraTitle = isProjectLoaded ? 'Open Camera Mode' : 'Load a piece first'

  return (
    <div className={styles.topBar} data-testid="top-bar" style={topBarStyle}>
      <button
        type="button"
        className={styles.button}
        aria-label="Add Piece"
        title="Add MIDI or MP4 piece"
        onClick={() => {
          void handleAddPiece()
        }}
        disabled={isOpeningFile}
        style={iconButtonStyle}
      >
        {isOpeningFile ? '...' : '+'}
      </button>

      <button
        type="button"
        className={styles.button}
        aria-label="Home"
        title="Clear the current piece"
        onClick={handleClearLoadedPiece}
        style={iconButtonStyle}
      >
        HM
      </button>

      <button
        type="button"
        className={styles.button}
        aria-label="Settings"
        title={isSettingsOpen ? 'Close visualizer settings' : 'Open visualizer settings'}
        aria-pressed={isSettingsOpen}
        onClick={() => {
          onToggleSettings?.()
        }}
        style={iconButtonStyle}
      >
        PC
      </button>

      <button
        type="button"
        className={styles.button}
        aria-label="Camera"
        title={cameraTitle}
        disabled={!isProjectLoaded}
        onClick={() => {
          enterCameraMode()
        }}
        style={{
          ...iconButtonStyle,
          opacity: isProjectLoaded ? 1 : 0.5,
        }}
      >
        CM
      </button>

      <button
        type="button"
        className={styles.button}
        aria-label="Record"
        title="Open Record Mode"
        onClick={() => {
          enterRecordMode()
        }}
        style={iconButtonStyle}
      >
        RC
      </button>
    </div>
  )
}

function createPieceFromFilePath(filePath: string): Piece {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath
  const pieceType = isMidiFilePath(filePath) ? 'midi' : 'recording'
  const name = fileName.replace(/\.[^.]+$/, '') || fileName

  return {
    createdAt: Date.now(),
    filePath,
    id: globalThis.crypto?.randomUUID?.() ?? `piece-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    type: pieceType,
  }
}
