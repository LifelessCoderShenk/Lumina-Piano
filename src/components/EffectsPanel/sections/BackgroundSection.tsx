import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './BackgroundSection.module.css'

export function BackgroundSection() {
  const { backgroundColor, laneOpacity } = useVisualizerSettings()
  const setBackgroundColor = useAppStore((state) => state.setBackgroundColor)
  const setLaneOpacity = useAppStore((state) => state.setLaneOpacity)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>Background</div>
      <div className={styles.field}>
        <label className={styles.label}>BG Color</label>
        <input className={styles.colorInput} type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} />
      </div>
      <div className={styles.field}>
        <div className={styles.headerRow}>
          <label className={styles.label}>Lane Opacity</label>
          <span className={styles.value}>{laneOpacity}%</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={laneOpacity}
          onChange={(event) => setLaneOpacity(Number(event.target.value))}
        />
      </div>
    </section>
  )
}
