import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './NoteStyleSection.module.css'

const NOTE_STYLES = ['solid', 'gradient', 'saber'] as const

export function NoteStyleSection() {
  const {
    gradientBottomColorLeft,
    gradientBottomColorLeftBlack,
    gradientBottomColorRight,
    gradientBottomColorRightBlack,
    gradientTopColor,
    noteGradientDirection,
    noteStyle,
  } = useVisualizerSettings()
  const setNoteStyle = useAppStore((state) => state.setNoteStyle)
  const setNoteGradientDirection = useAppStore((state) => state.setNoteGradientDirection)
  const setGradientTopColor = useAppStore((state) => state.setGradientTopColor)
  const setGradientBottomColorRight = useAppStore((state) => state.setGradientBottomColorRight)
  const setGradientBottomColorRightBlack = useAppStore((state) => state.setGradientBottomColorRightBlack)
  const setGradientBottomColorLeft = useAppStore((state) => state.setGradientBottomColorLeft)
  const setGradientBottomColorLeftBlack = useAppStore((state) => state.setGradientBottomColorLeftBlack)

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
                data-direction={style === 'gradient' ? noteGradientDirection : undefined}
              />
            </div>
            <span className={styles.label}>{capitalize(style)}</span>
          </button>
        ))}
      </div>
      {noteStyle === 'gradient' ? (
        <>
          <div className={styles.directionSection}>
            <div className={styles.directionLabel}>Gradient Direction</div>
            <div className={styles.directionTabs}>
              <button
                className={noteGradientDirection === 'vertical' ? styles.directionTabActive : styles.directionTab}
                onClick={() => setNoteGradientDirection('vertical')}
              >
                Vertical
              </button>
              <button
                className={noteGradientDirection === 'horizontal' ? styles.directionTabActive : styles.directionTab}
                onClick={() => setNoteGradientDirection('horizontal')}
              >
                Horizontal
              </button>
            </div>
          </div>
          <div className={styles.gradientSection}>
            <div className={styles.directionLabel}>Gradient Colors</div>
            <div className={styles.colorRow}>
              <span className={styles.colorLabel}>Top Color</span>
              <input
                className={styles.colorInput}
                type="color"
                value={gradientTopColor}
                onChange={(event) => setGradientTopColor(event.target.value)}
              />
            </div>
            <div className={styles.colorGroup}>
              <div className={styles.groupTitle}>Right Hand</div>
              <div className={styles.colorRow}>
                <span className={styles.colorLabel}>White Keys</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={gradientBottomColorRight}
                  onChange={(event) => setGradientBottomColorRight(event.target.value)}
                />
              </div>
              <div className={styles.colorRow}>
                <span className={styles.colorLabel}>Black Keys</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={gradientBottomColorRightBlack}
                  onChange={(event) => setGradientBottomColorRightBlack(event.target.value)}
                />
              </div>
            </div>
            <div className={styles.colorGroup}>
              <div className={styles.groupTitle}>Left Hand</div>
              <div className={styles.colorRow}>
                <span className={styles.colorLabel}>White Keys</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={gradientBottomColorLeft}
                  onChange={(event) => setGradientBottomColorLeft(event.target.value)}
                />
              </div>
              <div className={styles.colorRow}>
                <span className={styles.colorLabel}>Black Keys</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={gradientBottomColorLeftBlack}
                  onChange={(event) => setGradientBottomColorLeftBlack(event.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
