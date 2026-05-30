import React, { useState, useEffect } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { MenuBar } from './components/MenuBar/MenuBar'
import { TrackList } from './components/TrackList/TrackList'
import { EffectsPanel, Inspector } from './components/EffectsPanel'
import { CanvasArea } from './components/CanvasArea/CanvasArea'
import { TransportBar } from './components/TransportBar/TransportBar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { ExportModal } from './components/ExportModal/ExportModal'
import { useCommandShortcuts } from './commands/useCommandShortcuts'
import styles from './App.module.css'

export function App() {
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [showEffects, setShowEffects] = useState(true)

  // Use stub in dev (non-Electron), real API in production
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.electronAPI) {
      // Dynamically inject stub for dev environment
      import('./preload/stub').then(({ installStub }) => installStub())
    }
  }, [])

  // Wire command shortcuts globally
  useCommandShortcuts()

  return (
    <div className={styles.app}>
      <TitleBar />
      <MenuBar onExportClick={() => setExportModalOpen(true)} />

      <div className={styles.workspace}>
        <TrackList />
        <div className={styles.centerColumn}>
          <div className={styles.canvasWrapper}>
            <CanvasArea />
            {showEffects ? (
              <div className={styles.effectsOverlay}>
                <EffectsPanel onClose={() => setShowEffects(false)} />
              </div>
            ) : null}
          </div>
          <TransportBar />
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
