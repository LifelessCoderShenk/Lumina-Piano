/*
INPUT: Active app and recording state plus mode-specific tool availability.
OUTPUT: The primary Falling Keys tools and a wide Create recording-workspace entry.
PURPOSE: Opens Performance video and Transcription from one clear Create action.
*/

import React from 'react'
import { Camera, Circle, FileX2, SlidersHorizontal } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { useAppStore } from '../../store/store'
import styles from './TopBar.module.css'

const topBarStyle = { backgroundColor: 'var(--color-bg)' } as const
const iconButtonStyle = { backgroundColor: 'var(--color-bg)', color: 'var(--color-icon)' } as const

interface TopBarProps {
  isSettingsOpen?: boolean
  isCreateNavigationLocked?: boolean
  onToggleSettings?: () => void
}

export function TopBar({ isSettingsOpen = false, isCreateNavigationLocked = false, onToggleSettings }: TopBarProps) {
  const appMode = useAppStore((state) => state.appMode)
  const recordModeView = useAppStore((state) => state.recordModeView)
  const transcriptionPhase = useAppStore((state) => state.transcriptionPhase)
  const clearLoadedPiece = useAppStore((state) => state.clearLoadedPiece)
  const enterCameraMode = useAppStore((state) => state.enterCameraMode)
  const enterRecordMode = useAppStore((state) => state.enterRecordMode)
  const isTranscriptionRecorder = appMode === 'createRecord' && recordModeView === 'transcription'
  const switchingLocked = isCreateNavigationLocked || (isTranscriptionRecorder && !['idle', 'stopped'].includes(transcriptionPhase))
  const lockedTitle = 'Stop or cancel the current recording before leaving this workspace'
  const isProjectLoaded = useAppStore((state) => state.isProjectLoaded)

  const openCreate = () => {
    playbackEngine.pause()
    if (appMode !== 'createRecord') enterRecordMode()
  }
  const handleClearLoadedPiece = () => {
    playbackEngine.pause()
    playbackEngine.seek(0)
    clearLoadedPiece()
  }
  const cameraTitle = isProjectLoaded ? 'Open Camera Mode' : 'Load a piece first'

  return <div className={styles.topBar} data-testid="top-bar" style={topBarStyle}>
    {!isTranscriptionRecorder && <>
      <button type="button" className={styles.button} aria-label="Clear piece" title={switchingLocked ? lockedTitle : isProjectLoaded ? 'Clear the current piece' : 'No piece loaded'} disabled={switchingLocked || !isProjectLoaded} onClick={handleClearLoadedPiece} style={{ ...iconButtonStyle, color: isProjectLoaded && !switchingLocked ? 'var(--color-icon)' : 'var(--color-icon-muted)' }}><AppIcon icon={FileX2} size={20} /></button>
      <button type="button" className={styles.button} aria-label="Settings" title={switchingLocked ? lockedTitle : isSettingsOpen ? 'Close visualizer settings' : 'Open visualizer settings'} disabled={switchingLocked} aria-pressed={isSettingsOpen} onClick={() => onToggleSettings?.()} style={iconButtonStyle}><AppIcon icon={SlidersHorizontal} size={20} /></button>
      <button type="button" className={styles.button} aria-label="Camera" title={switchingLocked ? lockedTitle : cameraTitle} disabled={switchingLocked || !isProjectLoaded} onClick={enterCameraMode} style={{ ...iconButtonStyle, color: isProjectLoaded && !switchingLocked ? 'var(--color-icon)' : 'var(--color-icon-muted)' }}><AppIcon icon={Camera} size={20} /></button>
    </>}
    <button type="button" className={`${styles.button} ${styles.createButton}`} aria-label="Create" aria-pressed={appMode === 'createRecord'} title={switchingLocked ? lockedTitle : 'Open Performance video and Transcription'} disabled={switchingLocked} onClick={openCreate} style={iconButtonStyle}>
      <AppIcon icon={Circle} size={20} />
      <span>Create</span>
    </button>
  </div>
}
