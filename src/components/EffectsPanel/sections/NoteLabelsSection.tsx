import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './NoteLabelsSection.module.css'

const LABEL_FORMAT_OPTIONS = [
  { label: 'C', value: 'name' },
  { label: 'C4', value: 'nameOctave' },
] as const

export function NoteLabelsSection() {
  const settings = useVisualizerSettings()
  const store = useAppStore()

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>Note Labels</div>

      <div className={styles.row}>
        <span className={styles.label}>Labels on notes</span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.noteLabelsOnNotes}
            onChange={(event) => store.setNoteLabelsOnNotes(event.target.checked)}
          />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Labels on keys</span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.noteLabelsOnKeys}
            onChange={(event) => store.setNoteLabelsOnKeys(event.target.checked)}
          />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </div>

      <div className={styles.formatRow}>
        <span className={styles.label}>Format</span>
        <div className={styles.formatTabs}>
          {LABEL_FORMAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={option.value === settings.noteLabelFormat ? styles.formatTabActive : styles.formatTab}
              onClick={() => store.setNoteLabelFormat(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Label color</span>
        <input
          className={styles.colorInput}
          type="color"
          value={settings.noteLabelColor}
          onChange={(event) => store.setNoteLabelColor(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.headerRow}>
          <span className={styles.label}>Label size</span>
          <span className={styles.value}>{settings.noteLabelSize}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={8}
          max={16}
          value={settings.noteLabelSize}
          onChange={(event) => store.setNoteLabelSize(Number(event.target.value))}
        />
      </div>
    </section>
  )
}
