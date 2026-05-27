import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './NoteStyleSection.module.css'

const NOTE_STYLES = ['solid', 'gradient', 'saber'] as const

export function NoteStyleSection() {
  const { noteStyle } = useVisualizerSettings()
  const setNoteStyle = useAppStore((state) => state.setNoteStyle)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>Note Style</div>
      <div className={styles.cards}>
        {NOTE_STYLES.map((style) => (
          <button
            key={style}
            className={style === noteStyle ? styles.cardActive : styles.card}
            onClick={() => setNoteStyle(style)}
          >
            <div className={styles.preview}>
              <div
                className={
                  style === 'solid'
                    ? styles.previewSolid
                    : style === 'gradient'
                      ? styles.previewGradient
                      : styles.previewSaber
                }
              />
            </div>
            <span className={styles.label}>{capitalize(style)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
