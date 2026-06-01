import React, { useState, useEffect } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { MenuBar } from './components/MenuBar/MenuBar'
import { TrackList } from './components/TrackList/TrackList'
import { EffectsPanel, Inspector } from './components/EffectsPanel'
import { CanvasArea } from './components/CanvasArea/CanvasArea'
import { TransportBar } from './components/TransportBar/TransportBar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { ExportModal } from './components/ExportModal/ExportModal'
import { EndScreen } from './components/EndScreen/EndScreen'
import { LearnHome } from './components/LearnHome/LearnHome'
import { ListenSession } from './components/LearnSession/ListenSession'
import { NoteByNoteSession } from './components/LearnSession/NoteByNoteSession'
import { PlayAlongSession } from './components/LearnSession/PlayAlongSession'
import { ModeSelector } from './components/ModeSelector'
import { SongPage } from './components/SongPage/SongPage'
import { useCommandShortcuts } from './commands/useCommandShortcuts'
import { useAppStore } from './store/store'
import styles from './App.module.css'

export function App() {
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const appMode = useAppStore((state) => state.appMode)
  const learnSessionMode = useAppStore((state) => state.learnV3.sessionConfig.mode)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const showEffects = useAppStore((state) => state.showEffects)
  const setShowEffects = useAppStore((state) => state.setShowEffects)

  // Use stub in dev (non-Electron), real API in production
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.electronAPI) {
      // Dynamically inject stub for dev environment
      import('./preload/stub').then(({ installStub }) => installStub())
    }
  }, [])

  // Wire command shortcuts globally
  useCommandShortcuts()

  const handleModeSelect = (mode: 'create' | 'learn') => {
    setAppMode(mode)
  }

  return (
    <div className={styles.app}>
      <TitleBar />
      <MenuBar onExportClick={() => setExportModalOpen(true)} />

      <div className={styles.workspace}>
        <TrackList />
        <div className={styles.centerColumn}>
          <div className={styles.canvasWrapper}>
            {appMode === 'select' ? (
              <ModeSelector onSelect={handleModeSelect} />
            ) : appMode === 'learn' ? (
              <LearnHome />
            ) : appMode === 'learnSong' ? (
              <SongPage />
            ) : appMode === 'learnSession' ? (
              learnSessionMode === 'listen' ? (
                <div className={styles.listenSessionLayout}>
                  <ListenSession />
                  <CanvasArea />
                </div>
              ) : learnSessionMode === 'noteByNote' ? (
                <>
                  <CanvasArea />
                  <NoteByNoteSession />
                </>
              ) : learnSessionMode === 'playAlong' ? (
                <>
                  <CanvasArea />
                  <PlayAlongSession />
                </>
              ) : (
                <div className={styles.learnMode}>
                  <div className={styles.learnMessage}>Learn Session Coming Soon</div>
                </div>
              )
            ) : appMode === 'learnEnd' ? (
              <EndScreen />
            ) : (
              <CanvasArea />
            )}
            {appMode === 'create' && showEffects ? (
              <div className={styles.effectsOverlay}>
                <EffectsPanel onClose={() => setShowEffects(false)} />
              </div>
            ) : null}
          </div>
          {appMode === 'create' ? <TransportBar /> : null}
        </div>
        <Inspector onOpenEffects={() => setShowEffects(true)} />
      </div>

      <StatusBar />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  )
}
