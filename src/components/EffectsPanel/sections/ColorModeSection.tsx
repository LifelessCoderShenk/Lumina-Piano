import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './ColorModeSection.module.css'
import { HandSplitControls } from './HandSplitControls'
import { PitchClassGrid } from './PitchClassGrid'
import { VelocityControls } from './VelocityControls'

const TABS = [
  { id: 'track', label: 'Track' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'split', label: 'Split' },
  { id: 'velocity', label: 'Vel' },
] as const

export function ColorModeSection() {
  const { colorMode } = useVisualizerSettings()
  const setColorMode = useAppStore((state) => state.setColorMode)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>Color Mode</div>
      <div className={styles.tabRow}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === colorMode ? styles.tabActive : styles.tab}
            onClick={() => setColorMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {colorMode === 'track' ? <div className={styles.helperText}>Track colors come from the track list swatches.</div> : null}
      {colorMode === 'pitch' ? <PitchClassGrid /> : null}
      {colorMode === 'split' ? <HandSplitControls /> : null}
      {colorMode === 'velocity' ? <VelocityControls /> : null}
    </section>
  )
}
