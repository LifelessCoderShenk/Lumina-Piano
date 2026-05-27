import { ToggleButton } from './ToggleButton'
import styles from './ExportSettings.module.css'

interface ExportSettingsProps {
  resolution: '720p' | '1080p' | '4K'
  fps: 30 | 60
  outputPath: string
  includeAudio: boolean
  onResolutionChange(resolution: '720p' | '1080p' | '4K'): void
  onFpsChange(fps: 30 | 60): void
  onOutputPathChange(path: string): void
  onBrowse(): void
  onIncludeAudioChange(value: boolean): void
  onStartExport(): void
  startDisabled: boolean
}

export function ExportSettings({
  fps,
  includeAudio,
  onBrowse,
  onFpsChange,
  onIncludeAudioChange,
  onOutputPathChange,
  onResolutionChange,
  onStartExport,
  outputPath,
  resolution,
  startDisabled,
}: ExportSettingsProps) {
  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Resolution</h3>
        <div className={styles.toggleRow}>
          <ToggleButton
            label="1080p"
            onClick={() => onResolutionChange('1080p')}
            selected={resolution === '1080p'}
          />
          <ToggleButton
            label="4K"
            onClick={() => onResolutionChange('4K')}
            selected={resolution === '4K'}
          />
          <ToggleButton
            label="720p"
            onClick={() => onResolutionChange('720p')}
            selected={resolution === '720p'}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Frame Rate</h3>
        <div className={styles.toggleRow}>
          <ToggleButton
            label="30 fps"
            onClick={() => onFpsChange(30)}
            selected={fps === 30}
          />
          <ToggleButton
            label="60 fps"
            onClick={() => onFpsChange(60)}
            selected={fps === 60}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Output Destination</h3>
        <div className={styles.pathRow}>
          <input
            className={styles.pathInput}
            onChange={(event) => onOutputPathChange(event.target.value)}
            spellCheck={false}
            type="text"
            value={outputPath}
          />
          <button
            className={styles.browseButton}
            onClick={onBrowse}
            type="button"
          >
            Browse
          </button>
        </div>
      </section>

      <label className={styles.switchRow}>
        <span className={styles.switchLabel}>Include Audio</span>
        <span className={styles.switchControl}>
          <input
            checked={includeAudio}
            className={styles.switchInput}
            onChange={(event) => onIncludeAudioChange(event.target.checked)}
            type="checkbox"
          />
          <span className={styles.switchTrack} />
          <span className={styles.switchThumb} />
        </span>
      </label>

      <button
        className={styles.startButton}
        disabled={startDisabled}
        onClick={onStartExport}
        type="button"
      >
        <ExportArrowIcon />
        <span>Start Export</span>
      </button>
    </div>
  )
}

function ExportArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.startIcon}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="M10 4.5v6m0 0 2.5-2.5M10 10.5 7.5 8M4 12.75v1.25c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25v-1.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
