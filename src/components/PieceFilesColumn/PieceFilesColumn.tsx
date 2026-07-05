import React from 'react'

import { useAppStore } from '../../store/store'
import styles from './PieceFilesColumn.module.css'

const columnStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const headingStyle = {
  color: 'var(--color-text-header)',
} as const

const activeItemStyle = {
  backgroundColor: 'var(--color-icon)',
  color: 'var(--color-text-body)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
} as const

const placeholderItemStyle = {
  color: 'var(--color-text-body)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
  cursor: 'default',
  opacity: 0.4,
  pointerEvents: 'none',
} as const

export function PieceFilesColumn() {
  const setAppMode = useAppStore((state) => state.setAppMode)

  return (
    <section className={styles.column} data-testid="piece-files-column" style={columnStyle}>
      <h2 className={styles.heading} style={headingStyle}>Piece Files</h2>

      <div className={styles.listFrame}>
        <button
          type="button"
          className={`${styles.itemButton} ${styles.activeItem}`}
          aria-pressed="true"
          style={activeItemStyle}
        >
          New Piece File
        </button>

        <button
          type="button"
          className={`${styles.itemButton} ${styles.samplePiece}`}
          aria-disabled="true"
          style={placeholderItemStyle}
        >
          Sample Pieces
        </button>
      </div>

      <button
        type="button"
        className={styles.learnButton}
        onClick={() => {
          setAppMode('learn')
        }}
      >
        Learn
      </button>
    </section>
  )
}
