import { ToggleButton } from './ToggleButton'
import styles from './ExportProgress.module.css'

interface ExportProgressProps {
  resolution: '720p' | '1080p' | '4K'
  fps: 30 | 60
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
  fps,
  framesRendered,
  includeAudio,
  onCancel,
  phaseLabel,
  progress,
  resolution,
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
            <FormatIcon />
            <span>MP4 (H.264)</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Resolution</h3>
        <div className={styles.toggleRow}>
          <ToggleButton disabled label="1080p" onClick={noop} selected={resolution === '1080p'} />
          <ToggleButton disabled label="4K" onClick={noop} selected={resolution === '4K'} />
          <ToggleButton disabled label="720p" onClick={noop} selected={resolution === '720p'} />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Frame Rate</h3>
        <div className={styles.toggleRow}>
          <ToggleButton disabled label="30 fps" onClick={noop} selected={fps === 30} />
          <ToggleButton disabled label="60 fps" onClick={noop} selected={fps === 60} />
        </div>
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

function noop(): void {}

function FormatIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.formatIcon}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="M5.5 4.75h9a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1Zm0 3.5h9M7.75 3v3.5M12.25 3v3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  )
}
