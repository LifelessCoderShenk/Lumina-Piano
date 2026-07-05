import React, { useState } from 'react'

import { useAppStore } from '../../store/store'
import { CameraControlsPanel } from '../CameraControlsPanel/CameraControlsPanel'
import { PieceFilesColumn } from '../PieceFilesColumn/PieceFilesColumn'
import { PiecesColumn } from '../PiecesColumn/PiecesColumn'
import { SecondBar } from '../SecondBar/SecondBar'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { TopBar } from '../TopBar/TopBar'
import styles from './EditPanel.module.css'

export function EditPanel() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const activeTab = useAppStore((state) => state.activeSecondBarTab)
  const setActiveSecondBarTab = useAppStore((state) => state.setActiveSecondBarTab)

  return (
    <aside
      className={styles.editPanel}
      data-testid="edit-panel"
      style={{ width: '25%', flexBasis: '25%' }}
      >
        <TopBar
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => {
          setIsSettingsOpen((current) => !current)
        }}
      />
      <SecondBar />

      <div className={styles.body} data-testid="edit-panel-body">
        {isSettingsOpen ? (
          <SettingsPanel
            onClose={() => {
              setIsSettingsOpen(false)
            }}
          />
        ) : activeTab === 'pieces' ? (
          <>
            <PieceFilesColumn />
            <div className={styles.divider} data-testid="edit-panel-divider" />
            <PiecesColumn />
          </>
        ) : activeTab === 'camera' ? (
          <CameraControlsPanel
            onBack={() => {
              setActiveSecondBarTab('pieces')
            }}
          />
        ) : activeTab === 'particles' ? (
          <div className={styles.placeholderPanel} data-testid="particles-panel">
            Particles panel coming soon
          </div>
        ) : (
          <div className={styles.placeholderPanel} data-testid="color-panel">
            Color Picker panel coming soon
          </div>
        )}
      </div>
    </aside>
  )
}
