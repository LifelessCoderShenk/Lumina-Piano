import React, { useEffect } from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './ColorModeSection.module.css'
import { HandSplitControls } from './HandSplitControls'
import { PitchClassGrid } from './PitchClassGrid'

const TABS = [
  { id: 'track', label: 'Track' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'split', label: 'Split' },
] as const

export function ColorModeSection() {
  const { colorMode } = useVisualizerSettings()
  const setColorMode = useAppStore((state) => state.setColorMode)

  useEffect(() => {
    if (colorMode === 'velocity') {
      setColorMode('track')
    }
  }, [colorMode, setColorMode])

  return (
    <CollapsibleSection
      className={styles.section}
      contentClassName={styles.sectionContent}
      title="Color Mode"
      titleClassName={styles.sectionHeader}
    >
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
    </CollapsibleSection>
  )
}
