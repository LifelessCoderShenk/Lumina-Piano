import type { ExportFormatSummary } from './useExportState'
import { Film } from 'lucide-react'
import { AppIcon } from '../AppIcon/AppIcon'
import styles from './ExportProgress.module.css'

interface ExportProgressProps {
  formatSummary: ExportFormatSummary | null
  includeAudio: boolean
  phaseLabel: string
  progress: number
  framesRendered: number
  totalFrames: number
  estimatedSecondsRemaining: number
  onCancel(): void
}

export interface ProgressBarProps {
  progress: number
  isComplete: boolean
}

export function ExportProgress({
  estimatedSecondsRemaining,
  framesRendered,
  formatSummary,
  includeAudio,
  onCancel,
  phaseLabel,
  progress,
  totalFrames,
}: ExportProgressProps) {
  const clampedProgress = clamp(progress, 0, 1)
  const progressPercent = Math.round(clampedProgress * 100)

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Format</h3>
        <div className={styles.formatRow}>
          <div className={styles.formatChip}>
            <AppIcon className={styles.formatIcon} icon={Film} size={16} />
            <span>MP4 (H.264)</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Export Settings</h3>
        <p className={styles.settingsSummary}>
          {formatSummary == null ? 'Settings snapshot unavailable' : formatExportSummary(formatSummary)}
        </p>
      </section>

      <div className={styles.switchColumn}>
        <label className={styles.switchRow}>
          <span className={styles.switchLabel}>Include Audio</span>
          <span className={styles.switchControl}>
            <input
              checked={includeAudio}
              className={styles.switchInput}
              disabled
              readOnly
              type="checkbox"
            />
            <span className={styles.switchTrack} />
            <span className={styles.switchThumb} />
          </span>
        </label>
      </div>

      <section className={styles.progressSection}>
        <div className={styles.progressHeading}>
          <span className={styles.progressLabel}>{phaseLabel}</span>
          <span className={styles.progressEta}>{formatRemainingTime(estimatedSecondsRemaining)}</span>
        </div>

        <ProgressBar isComplete={false} progress={clampedProgress} />

        <div className={styles.progressMeta}>
          <span>
            {framesRendered.toLocaleString()} / {totalFrames.toLocaleString()} frames
          </span>
          <span>{progressPercent}%</span>
        </div>
      </section>

      <button
        className={styles.cancelButton}
        onClick={onCancel}
        type="button"
      >
        Cancel Export
      </button>
    </div>
  )
}

export function ProgressBar({ isComplete, progress }: ProgressBarProps) {
  const progressValue = Math.round(clamp(progress, 0, 1) * 100)
  const className = [
    styles.progressBar,
    isComplete ? styles.progressBarComplete : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <progress
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progressValue}
      className={className}
      max={100}
      role="progressbar"
      value={progressValue}
    />
  )
}

function formatRemainingTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Preparing...'
  }

  if (seconds < 60) {
    return `~${Math.max(1, Math.round(seconds))} sec remaining`
  }

  const minutes = Math.max(1, Math.round(seconds / 60))
  return `~${minutes} min remaining`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatExportSummary(summary: ExportFormatSummary): string {
  const aspectRatio = summary.aspectRatio === 'fit' ? 'Fit (16:9)' : summary.aspectRatio
  return `${summary.width}×${summary.height} · ${summary.fps} FPS · ${aspectRatio}`
}
