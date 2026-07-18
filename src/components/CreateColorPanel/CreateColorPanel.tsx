import React, { useEffect, useRef, useState } from 'react'

import { useAppStore } from '../../store/store'
import styles from './CreateColorPanel.module.css'

const PITCH_CLASS_FIELDS = [
  { label: 'C', pitchClass: 0 },
  { label: 'C#', pitchClass: 1 },
  { label: 'D', pitchClass: 2 },
  { label: 'D#', pitchClass: 3 },
  { label: 'E', pitchClass: 4 },
  { label: 'F', pitchClass: 5 },
  { label: 'F#', pitchClass: 6 },
  { label: 'G', pitchClass: 7 },
  { label: 'G#', pitchClass: 8 },
  { label: 'A', pitchClass: 9 },
  { label: 'A#', pitchClass: 10 },
  { label: 'B', pitchClass: 11 },
] as const

const COLOR_COMMIT_THROTTLE_MS = 90

type PendingColorCommit = {
  color: string
  commit(color: string): void
}

export function CreateColorPanel() {
  const createNoteColors = useAppStore((state) => state.createNoteColors)
  const setCreateNoteColorMode = useAppStore((state) => state.setCreateNoteColorMode)
  const setCreateSingleNoteColor = useAppStore((state) => state.setCreateSingleNoteColor)
  const setCreatePitchClassColor = useAppStore((state) => state.setCreatePitchClassColor)
  const [draftSingleColor, setDraftSingleColor] = useState(createNoteColors.singleColor)
  const [draftPitchClassColors, setDraftPitchClassColors] = useState(createNoteColors.pitchClassColors)
  const pendingCommitRef = useRef<PendingColorCommit | null>(null)
  const commitTimeoutRef = useRef<number | null>(null)
  const lastCommitAtRef = useRef(Number.NEGATIVE_INFINITY)

  const flushPendingColorCommit = () => {
    if (commitTimeoutRef.current != null) {
      window.clearTimeout(commitTimeoutRef.current)
      commitTimeoutRef.current = null
    }

    const pendingCommit = pendingCommitRef.current
    if (pendingCommit == null) {
      return
    }

    pendingCommitRef.current = null
    lastCommitAtRef.current = window.performance.now()
    pendingCommit.commit(pendingCommit.color)
  }

  const scheduleColorCommit = (color: string, commit: (nextColor: string) => void) => {
    pendingCommitRef.current = { color, commit }

    const elapsedSinceLastCommit = window.performance.now() - lastCommitAtRef.current
    if (elapsedSinceLastCommit >= COLOR_COMMIT_THROTTLE_MS) {
      flushPendingColorCommit()
      return
    }

    if (commitTimeoutRef.current != null) {
      return
    }

    commitTimeoutRef.current = window.setTimeout(
      flushPendingColorCommit,
      COLOR_COMMIT_THROTTLE_MS - elapsedSinceLastCommit,
    )
  }

  useEffect(() => {
    setDraftSingleColor(createNoteColors.singleColor)
  }, [createNoteColors.singleColor])

  useEffect(() => {
    setDraftPitchClassColors(createNoteColors.pitchClassColors)
  }, [createNoteColors.pitchClassColors])

  useEffect(() => () => {
    if (commitTimeoutRef.current != null) {
      window.clearTimeout(commitTimeoutRef.current)
    }
  }, [])

  return (
    <section className={styles.panel} data-testid="color-panel">
      <div className={styles.header}>COLOR PICKER</div>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>CREATE NOTE COLORS</div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabel}>Mode</div>
            <div className={styles.segmentedControl} role="group" aria-label="Create note color mode">
              {(['single', 'pitchClass'] as const).map((mode) => {
                const isActive = createNoteColors.mode === mode

                return (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.segmentButton} ${isActive ? styles.segmentButtonActive : ''}`}
                    aria-pressed={isActive}
                    onClick={() => {
                      setCreateNoteColorMode(mode)
                    }}
                  >
                    {mode === 'single' ? 'Single' : 'Pitch Class'}
                  </button>
                )
              })}
            </div>
          </div>

          {createNoteColors.mode === 'single' ? (
            <label className={styles.colorField}>
              <span className={styles.colorLabel}>Note</span>
              <input
                type="color"
                aria-label="Single note color"
                value={draftSingleColor}
                onBlur={flushPendingColorCommit}
                onChange={(event) => {
                  const nextColor = event.target.value
                  setDraftSingleColor(nextColor)
                  scheduleColorCommit(nextColor, setCreateSingleNoteColor)
                }}
              />
            </label>
          ) : (
            <div className={styles.pitchClassGrid}>
              {PITCH_CLASS_FIELDS.map(({ label, pitchClass }) => (
                <label key={pitchClass} className={styles.colorField}>
                  <span className={styles.colorLabel}>{label}</span>
                  <input
                    type="color"
                    aria-label={`${label} pitch class color`}
                    value={draftPitchClassColors[pitchClass] ?? createNoteColors.singleColor}
                    onBlur={flushPendingColorCommit}
                    onChange={(event) => {
                      const nextColor = event.target.value
                      setDraftPitchClassColors((currentColors) => ({
                        ...currentColors,
                        [pitchClass]: nextColor,
                      }))
                      scheduleColorCommit(nextColor, (color) => {
                        setCreatePitchClassColor(pitchClass, color)
                      })
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
