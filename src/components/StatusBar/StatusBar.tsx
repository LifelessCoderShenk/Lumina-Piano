import React from 'react'
import { useProjectData, useCameraState } from '../../store/store'
import styles from './StatusBar.module.css'

export function StatusBar() {
  const { projectData } = useProjectData()
  const { worldZoom } = useCameraState()
  const noteCount = projectData?.tracks.flatMap(t => t.notes).length ?? 0

  return (
    <div className={styles.statusBar}>
      <span className={styles.left}>
        Lumina Piano Engine v1.0.2 · 44.1kHz / 24-bit
      </span>
      <span className={styles.center}>
        {projectData ? 'Project Loaded' : 'Canvas Empty'}
      </span>
      <span className={styles.right}>
        {Math.round(worldZoom * 100)}% · {noteCount.toLocaleString()} notes
      </span>
    </div>
  )
}
