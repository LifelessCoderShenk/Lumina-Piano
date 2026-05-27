import React from 'react'
import { useProjectData } from '../../store/store'
import styles from './Inspector.module.css'

export interface InspectorProps {
  onOpenEffects(): void
}

export function Inspector({ onOpenEffects }: InspectorProps) {
  const { isProjectLoaded } = useProjectData()

  return (
    <aside className={styles.inspector}>
      <div className={styles.header}>INSPECTOR</div>
      <div className={styles.content}>
        <div className={styles.emptyState}>
          {isProjectLoaded ? 'Open the effects panel to customize the visualizer' : 'Load a MIDI file to begin'}
        </div>
      </div>
      <div className={styles.footer}>
        <button className={styles.openEffectsBtn} onClick={onOpenEffects}>
          Open Effects Panel
        </button>
      </div>
    </aside>
  )
}
