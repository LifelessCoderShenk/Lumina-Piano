import React, { useEffect, useRef, useState } from 'react'

import {
  CREATE_PITCH_CLASS_PALETTES,
  DEFAULT_VISUALIZER_BACKGROUND_COLOR,
  findCreatePitchClassPalette,
  TUTORIAL_CREATE_PRESET,
} from '../../store/createNoteColorPalettes'
import { useAppStore } from '../../store/store'
import { VisualStyleControl } from '../VisualStyleControl/VisualStyleControl'
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
  const setCreatePitchClassColors = useAppStore((state) => state.setCreatePitchClassColors)
  const setCreateVelocityColors = useAppStore((state) => state.setCreateVelocityColors)
  const backgroundColor = useAppStore((state) => state.backgroundColor)
  const setBackgroundColor = useAppStore((state) => state.setBackgroundColor)
  const [draftSingleColor, setDraftSingleColor] = useState(createNoteColors.singleColor)
  const [draftPitchClassColors, setDraftPitchClassColors] = useState(createNoteColors.pitchClassColors)
  const pendingCommitRef = useRef<PendingColorCommit | null>(null)
  const commitTimeoutRef = useRef<number | null>(null)
  const lastCommitAtRef = useRef(Number.NEGATIVE_INFINITY)
  const backgroundBeforeTutorialRef = useRef<string | null>(null)
  const activePitchClassPalette = findCreatePitchClassPalette(createNoteColors.pitchClassColors)

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
        <VisualStyleControl />
        <section className={styles.section}>
          <div className={styles.sectionTitle}>CREATE NOTE COLORS</div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabel}>Mode</div>
            <div className={styles.segmentedControl} role="group" aria-label="Create note color mode">
              {(['single', 'pitchClass', 'gradient', 'velocity', 'dynamic', 'random', 'tutorial'] as const).map((mode) => {
                const isActive = createNoteColors.mode === mode

                return (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.segmentButton} ${isActive ? styles.segmentButtonActive : ''}`}
                    aria-pressed={isActive}
                    onClick={() => {
                      const wasTutorial = createNoteColors.mode === 'tutorial'
                      if (mode === 'tutorial' && !wasTutorial) {
                        backgroundBeforeTutorialRef.current = backgroundColor
                        setBackgroundColor(TUTORIAL_CREATE_PRESET.backgroundColor)
                      } else if (mode !== 'tutorial' && wasTutorial) {
                        setBackgroundColor(
                          backgroundBeforeTutorialRef.current ?? DEFAULT_VISUALIZER_BACKGROUND_COLOR,
                        )
                        backgroundBeforeTutorialRef.current = null
                      }
                      setCreateNoteColorMode(mode)
                    }}
                  >
                    {mode === 'single'
                      ? 'Single'
                      : mode === 'pitchClass'
                        ? 'Pitch Class'
                        : mode === 'gradient'
                          ? 'Gradient'
                          : mode === 'velocity'
                            ? 'Dynamics'
                            : mode === 'dynamic'
                              ? 'Flow'
                              : mode === 'random'
                                ? 'Random'
                                : 'Tutorial'}
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
          ) : createNoteColors.mode === 'pitchClass' ? (
            <>
              <label className={styles.paletteField}>
                <span className={styles.colorLabel}>Palette</span>
                <select
                  aria-label="Pitch class palette"
                  value={activePitchClassPalette?.id ?? 'custom'}
                  onChange={(event) => {
                    const palette = CREATE_PITCH_CLASS_PALETTES.find(({ id }) => id === event.target.value)
                    if (palette == null) {
                      return
                    }

                    flushPendingColorCommit()
                    const nextColors = { ...palette.colors }
                    setDraftPitchClassColors(nextColors)
                    setCreatePitchClassColors(nextColors)
                  }}
                >
                  {activePitchClassPalette == null ? <option value="custom">Custom</option> : null}
                  {CREATE_PITCH_CLASS_PALETTES.map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </label>

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
            </>
          ) : createNoteColors.mode === 'gradient' ? (
            <div className={styles.gradientPreview} aria-label="Low red to high violet rainbow gradient">
              <div className={styles.rainbowSwatch} />
              <div className={styles.gradientLabels}>
                <span>Low: Red</span>
                <span>High: Violet</span>
              </div>
            </div>
          ) : createNoteColors.mode === 'velocity' ? (
            <div className={styles.velocityColors}>
              <div
                className={styles.velocitySwatch}
                aria-label="Soft to strong velocity color preview"
                style={{
                  background: `linear-gradient(90deg, ${createNoteColors.velocityLowColor ?? '#4b2f83'}, ${createNoteColors.velocityHighColor ?? '#62e8ff'})`,
                }}
              />
              <div className={styles.velocityColorFields}>
                <label className={styles.colorField}>
                  <span className={styles.colorLabel}>Soft</span>
                  <input
                    type="color"
                    aria-label="Soft note color"
                    value={createNoteColors.velocityLowColor ?? '#4b2f83'}
                    onChange={(event) => setCreateVelocityColors(
                      event.target.value,
                      createNoteColors.velocityHighColor ?? '#62e8ff',
                    )}
                  />
                </label>
                <label className={styles.colorField}>
                  <span className={styles.colorLabel}>Strong</span>
                  <input
                    type="color"
                    aria-label="Strong note color"
                    value={createNoteColors.velocityHighColor ?? '#62e8ff'}
                    onChange={(event) => setCreateVelocityColors(
                      createNoteColors.velocityLowColor ?? '#4b2f83',
                      event.target.value,
                    )}
                  />
                </label>
              </div>
            </div>
          ) : createNoteColors.mode === 'dynamic' ? (
            <div className={styles.dynamicPreview} aria-label="Colors flow through the performance timeline">
              <div className={styles.dynamicSwatch} />
              <span>Color follows the music</span>
            </div>
          ) : createNoteColors.mode === 'random' ? (
            <div className={styles.dynamicPreview} aria-label="Each note receives a stable random color">
              <div className={styles.randomSwatch} />
              <span>One stable color per note</span>
            </div>
          ) : (
            <div className={styles.tutorialPreview} aria-label="Tutorial preset: blue lower notes, green upper notes, charcoal background">
              <div className={styles.tutorialSwatch}>
                <span className={styles.tutorialLower}>Lower: Blue</span>
                <span className={styles.tutorialUpper}>Upper: Green</span>
              </div>
              <span className={styles.tutorialCaption}>
                Charcoal background · split at C4
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
