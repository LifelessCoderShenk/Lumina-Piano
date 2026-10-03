import React, { useEffect, useState } from 'react'

import { loadMidiBytes } from '../../midi/loadMidiProject'
import { loadLuminaProjectFileFromPath } from '../../project/luminaProject'
import { loadMusicXmlFileFromPath } from '../../musicxml/loadMusicXmlProject'
import { useAppStore } from '../../store/store'
import { applySamplePieceColorDefault } from './samplePieceColorDefaults'
import styles from './PiecesColumn.module.css'

const SAMPLE_SHORTCUT_COUNT = 2

const columnStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const headingStyle = {
  color: 'var(--color-text-header)',
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

interface PiecesColumnProps {
  showSamplePieces?: boolean
}

export function PiecesColumn({ showSamplePieces = false }: PiecesColumnProps) {
  const [loadingPieceId, setLoadingPieceId] = useState<string | null>(null)
  const [openingRecordingId, setOpeningRecordingId] = useState<string | null>(null)
  const [recordingOpenError, setRecordingOpenError] = useState<string | null>(null)
  const [projectOpenError, setProjectOpenError] = useState<string | null>(null)
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

  const handleRecordingClick = async (piece: { filePath: string | null; id: string; name: string }) => {
    if (piece.filePath == null || openingRecordingId != null) {
      return
    }

    const openPath = window.electronAPI?.shell?.openPath
    if (typeof openPath !== 'function') {
      setRecordingOpenError('Opening recordings is unavailable.')
      return
    }

    setRecordingOpenError(null)
    setOpeningRecordingId(piece.id)
    try {
      await openPath(piece.filePath)
    } catch (error) {
      console.error(`Failed to open recording "${piece.name}":`, error)
      setRecordingOpenError(`Failed to open ${piece.name}.`)
    } finally {
      setOpeningRecordingId(null)
    }
  }

  const handleProjectClick = async (piece: { filePath: string | null; id: string; name: string }) => {
    if (piece.filePath == null || loadingPieceId != null) return
    setProjectOpenError(null); setLoadingPieceId(piece.id)
    try {
      await loadLuminaProjectFileFromPath(piece.filePath)
      useAppStore.setState({ currentPieceId: piece.id })
    } catch (error) {
      console.error(`Failed to open project "${piece.name}":`, error)
      setProjectOpenError(error instanceof Error ? error.message : `Failed to open ${piece.name}.`)
    } finally { setLoadingPieceId(null) }
  }

  const handleScoreClick = async (piece: { filePath: string | null; id: string; name: string }) => {
    if (piece.filePath == null || loadingPieceId != null) return
    setProjectOpenError(null); setLoadingPieceId(piece.id)
    try {
      await loadMusicXmlFileFromPath(piece.filePath)
      useAppStore.setState({ currentPieceId: piece.id })
    } catch (error) {
      console.error(`Failed to open score "${piece.name}":`, error)
      setProjectOpenError(error instanceof Error ? error.message : `Failed to open ${piece.name}.`)
    } finally { setLoadingPieceId(null) }
  }

  return (
    <section className={styles.column} data-testid="pieces-column" style={columnStyle}>
      <h2 className={styles.heading} style={headingStyle}>{showSamplePieces ? 'Samples' : 'All pieces'}</h2>

      <div className={styles.listFrame}>
        {showSamplePieces ? <SamplePiecesList /> : <>
          <DefaultSamplePieceCards />

          {pieces.map((piece) => {
          const isSelected = currentPieceId === piece.id
          const isRecordingPiece = piece.type === 'recording'
          const isProjectPiece = piece.type === 'project' || piece.filePath?.toLowerCase().endsWith('.lumina') === true
          const isScorePiece = piece.type === 'musicxml' || /\.(musicxml|xml)$/i.test(piece.filePath ?? '')
          const isMidiPiece = piece.filePath != null && /\.(mid|midi)$/i.test(piece.filePath)
          const title = piece.filePath == null
            ? isRecordingPiece ? 'Recording file unavailable' : 'Piece file unavailable'
            : isRecordingPiece
            ? `Open ${piece.name} in your default media player`
            : isProjectPiece
            ? `Open editable project ${piece.name}`
            : isScorePiece
            ? `Load MusicXML score ${piece.name}`
            : isMidiPiece
            ? `Load ${piece.name}`
            : 'This file type is not supported yet'

          return (
            <button
              key={piece.id}
              type="button"
              className={`${styles.card} ${styles.userPiece} ${isSelected ? styles.selectedCard : ''} ${isRecordingPiece ? styles.recordingPiece : ''}`}
              disabled={isRecordingPiece && piece.filePath == null}
              title={title}
              style={{
                ...interactiveCardStyle,
                backgroundColor: isSelected ? 'var(--color-icon)' : undefined,
                fontStyle: isRecordingPiece ? 'italic' : undefined,
                opacity: isRecordingPiece ? 0.65 : 1,
              }}
              onClick={() => {
                if (isRecordingPiece) {
                  void handleRecordingClick(piece)
                  return
                }
                if (isProjectPiece) { void handleProjectClick(piece); return }
                if (isScorePiece) { void handleScoreClick(piece); return }
                void handlePieceClick(piece.id)
              }}
            >
              <span className={styles.cardContent}>
                <span>
                  {openingRecordingId === piece.id
                    ? 'Opening...'
                    : loadingPieceId === piece.id
                      ? 'Loading...'
                      : piece.name}
                </span>
                {isRecordingPiece ? (
                  <span aria-hidden="true" className={styles.recordingBadge}>
                    REC
                  </span>
                ) : isProjectPiece ? <span aria-hidden="true" className={styles.projectBadge}>PROJECT</span>
                  : isScorePiece ? <span aria-hidden="true" className={styles.scoreBadge}>SCORE</span> : null}
              </span>
            </button>
          )
          })}
        </>}
      </div>

      {loadPieceError != null ? (
        <p className={styles.errorMessage} role="alert">
          {loadPieceError}
        </p>
      ) : null}
      {recordingOpenError != null ? (
        <p className={styles.errorMessage} role="alert">
          {recordingOpenError}
        </p>
      ) : null}
      {projectOpenError != null ? <p className={styles.errorMessage} role="alert">{projectOpenError}</p> : null}
    </section>
  )
}

function DefaultSamplePieceCards() {
  const [fileNames, setFileNames] = useState<string[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingFileName, setLoadingFileName] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    const samplePiecesApi = window.electronAPI?.samplePieces

    if (samplePiecesApi == null) {
      setFileNames([])
      return () => {
        isCurrent = false
      }
    }

    void samplePiecesApi.list()
      .then((nextFileNames) => {
        if (isCurrent) {
          setFileNames(nextFileNames.slice(0, SAMPLE_SHORTCUT_COUNT))
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to list default sample pieces:', error)
        if (isCurrent) {
          setErrorMessage('Failed to load sample pieces.')
          setFileNames([])
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const loadDefaultSamplePiece = async (fileName: string) => {
    const samplePiecesApi = window.electronAPI?.samplePieces
    if (samplePiecesApi == null) {
      setErrorMessage('Sample pieces are unavailable.')
      return
    }

    setErrorMessage(null)
    setLoadingFileName(fileName)

    try {
      await loadMidiBytes(await samplePiecesApi.read(fileName))
      applySamplePieceColorDefault(fileName)
    } catch (error) {
      console.error(`Failed to load default sample piece "${fileName}":`, error)
      setErrorMessage(`Failed to load ${formatSamplePieceLabel(fileName)}.`)
    } finally {
      setLoadingFileName(null)
    }
  }

  return <>
    {fileNames?.map((fileName) => {
      const name = formatSamplePieceLabel(fileName)
      return (
        <button
          key={fileName}
          type="button"
          className={`${styles.card} ${styles.userPiece}`}
          disabled={loadingFileName != null}
          title={`Load ${name}`}
          style={interactiveCardStyle}
          onClick={() => {
            void loadDefaultSamplePiece(fileName)
          }}
        >
          {loadingFileName === fileName ? `Loading ${name}...` : name}
        </button>
      )
    })}
    {errorMessage != null ? <p className={styles.errorMessage} role="alert">{errorMessage}</p> : null}
  </>
}

function SamplePiecesList() {
  const [fileNames, setFileNames] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [loadingFileName, setLoadingFileName] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    const samplePiecesApi = window.electronAPI?.samplePieces

    if (samplePiecesApi == null) {
      setErrorMessage('Sample pieces are unavailable.')
      setIsLoadingList(false)
      return () => {
        isCurrent = false
      }
    }

    void samplePiecesApi.list()
      .then((nextFileNames) => {
        if (isCurrent) {
          setFileNames(nextFileNames)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to list sample pieces:', error)
        if (isCurrent) {
          setErrorMessage('Failed to load sample pieces.')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingList(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const loadSamplePiece = async (fileName: string) => {
    const samplePiecesApi = window.electronAPI?.samplePieces
    if (samplePiecesApi == null) {
      setErrorMessage('Sample pieces are unavailable.')
      return
    }

    setErrorMessage(null)
    setLoadingFileName(fileName)

    try {
      await loadMidiBytes(await samplePiecesApi.read(fileName))
      applySamplePieceColorDefault(fileName)
    } catch (error) {
      console.error(`Failed to load sample piece "${fileName}":`, error)
      setErrorMessage(`Failed to load ${formatSamplePieceLabel(fileName)}.`)
    } finally {
      setLoadingFileName(null)
    }
  }

  if (isLoadingList) {
    return <p className={styles.sampleListStatus}>Loading sample pieces...</p>
  }

  if (errorMessage != null) {
    return <p className={styles.errorMessage} role="alert">{errorMessage}</p>
  }

  if (fileNames.length === 0) {
    return <p className={styles.sampleListStatus}>No sample pieces are available.</p>
  }

  return fileNames.map((fileName) => (
    <button
      key={fileName}
      type="button"
      className={`${styles.card} ${styles.userPiece}`}
      disabled={loadingFileName != null}
      onClick={() => {
        void loadSamplePiece(fileName)
      }}
    >
      {loadingFileName === fileName
        ? `Loading ${formatSamplePieceLabel(fileName)}...`
        : formatSamplePieceLabel(fileName)}
    </button>
  ))
}

function formatSamplePieceLabel(fileName: string): string {
  const name = fileName.replace(/\.midi?$/i, '').replace(/[-_]+/g, ' ').trim()
  return name.replace(/\b\w/g, (character) => character.toUpperCase())
}
