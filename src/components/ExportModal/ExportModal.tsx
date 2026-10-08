import { useEffect, useMemo } from 'react'
import { CircleAlert } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { ExportComplete } from './ExportComplete'
import { ExportProgress } from './ExportProgress'
import { ExportSettings } from './ExportSettings'
import { ExportSheetShell } from './ExportSheetShell'
import { useExportState } from './useExportState'
import styles from './ExportModal.module.css'

export interface ExportModalProps {
  isOpen: boolean
  onClose(): void
  variant?: 'modal' | 'sheet'
}

export function ExportModal({ isOpen, onClose, variant = 'modal' }: ExportModalProps) {
  const {
    browseOutputPath,
    cancelExport,
    ensureDefaultOutputPath,
    openFile,
    resetTransientState,
    setIncludeAudio,
    setOutputPath,
    startExport,
    state,
  } = useExportState()

  const isExporting = state.phase === 'exporting'
  const canDismiss = !isExporting
  const startDisabled = state.outputPath.trim().length === 0

  useEffect(() => {
    if (!isOpen) {
      if (!isExporting) {
        resetTransientState()
      }
      return
    }

    void ensureDefaultOutputPath()
  }, [ensureDefaultOutputPath, isExporting, isOpen, resetTransientState])


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
          framesRendered={state.framesRendered}
          formatSummary={state.formatSummary}
          includeAudio={state.includeAudio}
          onCancel={cancelExport}
          phaseLabel={state.phaseLabel}
          progress={state.progress}
          totalFrames={state.totalFrames}
        />
      )
    }

    if (state.phase === 'error') {
      return (
        <div className={styles.errorState}>
          <div className={styles.errorBanner}>
            <AppIcon className={styles.errorIcon} icon={CircleAlert} size={20} />
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
        includeAudio={state.includeAudio}
        onBrowse={() => {
          void browseOutputPath()
        }}
        onIncludeAudioChange={setIncludeAudio}
        onOutputPathChange={setOutputPath}
        onStartExport={() => {
          void startExport()
        }}
        outputPath={state.outputPath}
        startDisabled={startDisabled}
      />
    )
  }, [
    browseOutputPath,
    cancelExport,
    onClose,
    openFile,
    resetTransientState,
    setIncludeAudio,
    setOutputPath,
    startDisabled,
    startExport,
    state,
  ])

  return (
    <ExportSheetShell
      canDismiss={canDismiss}
      isOpen={isOpen}
      onClose={() => {
        if (!canDismiss) {
          return
        }
        resetTransientState()
        onClose()
      }}
      title="Export Video"
      variant={variant}
    >
      {content}
    </ExportSheetShell>
  )
}
