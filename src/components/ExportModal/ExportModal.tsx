import { useEffect, useId, useMemo, useRef } from 'react'

import { ExportComplete } from './ExportComplete'
import { ExportProgress } from './ExportProgress'
import { ExportSettings } from './ExportSettings'
import { useExportState } from './useExportState'
import styles from './ExportModal.module.css'

export interface ExportModalProps {
  isOpen: boolean
  onClose(): void
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const {
    browseOutputPath,
    cancelExport,
    ensureDefaultOutputPath,
    openFile,
    resetTransientState,
    setFps,
    setIncludeAudio,
    setOutputPath,
    setResolution,
    startExport,
    state,
  } = useExportState()

  const isExporting = state.phase === 'exporting'
  const canDismiss = !isExporting
  const startDisabled = state.outputPath.trim().length === 0
  const dialogClassName = [
    styles.dialog,
    isExporting ? styles.dialogLocked : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (!isOpen) {
      if (!isExporting) {
        resetTransientState()
      }
      return
    }

    void ensureDefaultOutputPath()
  }, [ensureDefaultOutputPath, isExporting, isOpen, resetTransientState])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const focusableElements = getFocusableElements(modalRef.current)
    focusableElements[0]?.focus()

    return () => {
      previousActiveElementRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!canDismiss) {
          return
        }

        event.preventDefault()
        resetTransientState()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(modalRef.current)
      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
        return
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [canDismiss, isOpen, onClose, resetTransientState])

  const content = useMemo(() => {
    if (state.phase === 'complete') {
      return (
        <ExportComplete
          completedFilePath={state.completedFilePath}
          onClose={() => {
            resetTransientState()
            onClose()
          }}
          onOpenFile={openFile}
        />
      )
    }

    if (state.phase === 'exporting') {
      return (
        <ExportProgress
          estimatedSecondsRemaining={state.estimatedSecondsRemaining}
          fps={state.fps}
          framesRendered={state.framesRendered}
          includeAudio={state.includeAudio}
          onCancel={cancelExport}
          phaseLabel={state.phaseLabel}
          progress={state.progress}
          resolution={state.resolution}
          totalFrames={state.totalFrames}
        />
      )
    }

    if (state.phase === 'error') {
      return (
        <div className={styles.errorState}>
          <div className={styles.errorBanner}>
            <span className={styles.errorIcon}>!</span>
            <div className={styles.errorText}>
              <strong>Export failed</strong>
              <span>{state.errorMessage ?? 'Export failed'}</span>
            </div>
          </div>

          <div className={styles.errorActions}>
            <button
              className={styles.retryButton}
              onClick={resetTransientState}
              type="button"
            >
              Try Again
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                resetTransientState()
                onClose()
              }}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )
    }

    return (
      <ExportSettings
        fps={state.fps}
        includeAudio={state.includeAudio}
        onBrowse={() => {
          void browseOutputPath()
        }}
        onFpsChange={setFps}
        onIncludeAudioChange={setIncludeAudio}
        onOutputPathChange={setOutputPath}
        onResolutionChange={setResolution}
        onStartExport={() => {
          void startExport()
        }}
        outputPath={state.outputPath}
        resolution={state.resolution}
        startDisabled={startDisabled}
      />
    )
  }, [
    browseOutputPath,
    cancelExport,
    onClose,
    openFile,
    resetTransientState,
    setFps,
    setIncludeAudio,
    setOutputPath,
    setResolution,
    startDisabled,
    startExport,
    state,
  ])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (!canDismiss) {
          return
        }

        if (event.target === event.currentTarget) {
          resetTransientState()
          onClose()
        }
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={dialogClassName}
        ref={modalRef}
        role="dialog"
      >
        <div className={styles.header}>
          <h2 className={styles.title} id={titleId}>Export Video</h2>
          <button
            aria-label="Close export dialog"
            className={styles.closeButton}
            disabled={!canDismiss}
            onClick={() => {
              if (!canDismiss) {
                return
              }

              resetTransientState()
              onClose()
            }}
            type="button"
          >
            x
          </button>
        </div>

        <div className={styles.body}>
          {content}
        </div>
      </div>
    </div>
  )
}

function getFocusableElements(container: HTMLDivElement | null): HTMLElement[] {
  if (container == null) {
    return []
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}
