import React, { useEffect, useState } from 'react'

import { useAppStore } from '../../store/store'
import styles from './PiecesColumn.module.css'

const DEFAULT_PLACEHOLDER_PIECES = [
  { id: 'default-1', name: 'Sample Piece 1', type: 'midi', filePath: null },
  { id: 'default-2', name: 'Sample Piece 2', type: 'midi', filePath: null },
] as const

const columnStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const headingStyle = {
  color: 'var(--color-text-header)',
} as const

const sampleCardStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--color-text-body)',
  cursor: 'default',
  fontFamily: 'var(--font-family-base)',
  minHeight: '40px',
  opacity: 0.4,
  padding: '8px 12px',
  pointerEvents: 'none',
  textAlign: 'left',
  width: '100%',
} as const

const interactiveCardStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--color-text-body)',
  cursor: 'pointer',
  fontFamily: 'var(--font-family-base)',
  minHeight: '40px',
  opacity: 1,
  padding: '8px 12px',
  pointerEvents: 'auto',
  textAlign: 'left',
  width: '100%',
} as const

export function PiecesColumn() {
  const [loadingPieceId, setLoadingPieceId] = useState<string | null>(null)
  const pieces = useAppStore((state) => state.pieces)
  const currentPieceId = useAppStore((state) => state.currentPieceId)
  const loadPieceError = useAppStore((state) => state.loadPieceError)
  const clearLoadPieceError = useAppStore((state) => state.clearLoadPieceError)
  const loadPiece = useAppStore((state) => state.loadPiece)

  useEffect(() => {
    if (loadPieceError == null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      clearLoadPieceError()
    }, 3000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [clearLoadPieceError, loadPieceError])

  const handlePieceClick = async (pieceId: string) => {
    if (loadingPieceId != null) {
      return
    }

    setLoadingPieceId(pieceId)
    try {
      await loadPiece(pieceId)
    } finally {
      setLoadingPieceId(null)
    }
  }

  return (
    <section className={styles.column} data-testid="pieces-column" style={columnStyle}>
      <h2 className={styles.heading} style={headingStyle}>Pieces</h2>

      <div className={styles.listFrame}>
        {DEFAULT_PLACEHOLDER_PIECES.map((piece) => (
          <button
            key={piece.id}
            type="button"
            className={`${styles.card} ${styles.samplePiece}`}
            aria-disabled="true"
            title="Sample MIDI coming soon"
            style={sampleCardStyle}
          >
            {piece.name}
          </button>
        ))}

        {pieces.map((piece) => {
          const isSelected = currentPieceId === piece.id
          const isRecordingPiece = piece.filePath != null && /\.mp4$/i.test(piece.filePath)
          const isMidiPiece = piece.filePath != null && /\.(mid|midi)$/i.test(piece.filePath)
          const title = piece.filePath == null
            ? 'Piece file unavailable'
            : isRecordingPiece
            ? 'MP4 recording pieces cannot be loaded yet'
            : isMidiPiece
            ? `Load ${piece.name}`
            : 'This file type is not supported yet'

          return (
            <button
              key={piece.id}
              type="button"
              className={`${styles.card} ${styles.userPiece} ${isSelected ? styles.selectedCard : ''} ${isRecordingPiece ? styles.recordingPiece : ''}`}
              title={title}
              style={{
                ...interactiveCardStyle,
                backgroundColor: isSelected ? 'var(--color-icon)' : undefined,
                fontStyle: isRecordingPiece ? 'italic' : undefined,
                opacity: isRecordingPiece ? 0.65 : 1,
              }}
              onClick={() => {
                void handlePieceClick(piece.id)
              }}
            >
              <span className={styles.cardContent}>
                <span>{loadingPieceId === piece.id ? 'Loading...' : piece.name}</span>
                {isRecordingPiece ? (
                  <span aria-hidden="true" className={styles.recordingBadge}>
                    REC
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      {loadPieceError != null ? (
        <p className={styles.errorMessage} role="alert">
          {loadPieceError}
        </p>
      ) : null}
    </section>
  )
}
