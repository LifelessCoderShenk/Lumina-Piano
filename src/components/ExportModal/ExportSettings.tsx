import styles from './ExportSettings.module.css'

interface ExportSettingsProps {
  outputPath: string
  includeAudio: boolean
  onOutputPathChange(path: string): void
  onBrowse(): void
  onIncludeAudioChange(value: boolean): void
  onStartExport(): void
  startDisabled: boolean
}

export function ExportSettings({
  includeAudio,
  onBrowse,
  onIncludeAudioChange,
  onOutputPathChange,
  onStartExport,
  outputPath,
  startDisabled,
}: ExportSettingsProps) {
  return (
    <div className={styles.content}>
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
        <AppIcon className={styles.startIcon} icon={Download} size={18} />
        <span>Start Export</span>
      </button>
    </div>
  )
}

import { Download } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
