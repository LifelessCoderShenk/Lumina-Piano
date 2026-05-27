import { ProgressBar } from './ExportProgress'
import styles from './ExportComplete.module.css'

interface ExportCompleteProps {
  completedFilePath: string | null
  onClose(): void
  onOpenFile(): void
}

export function ExportComplete({
  completedFilePath,
  onClose,
  onOpenFile,
}: ExportCompleteProps) {
  const fileName = getFileName(completedFilePath ?? 'export.mp4')

  return (
    <div className={styles.content}>
      <div className={styles.iconBadge}>
        <CheckIcon />
      </div>

      <div className={styles.textBlock}>
        <h3 className={styles.title}>Export complete</h3>
        <p className={styles.fileName}>{fileName}</p>
      </div>

      <div className={styles.progressBlock}>
        <ProgressBar isComplete progress={1} />
        <div className={styles.progressMeta}>
          <span>100%</span>
          <span>Complete</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.closeButton}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
        <button
          className={styles.openButton}
          onClick={onOpenFile}
          type="button"
        >
          <FolderIcon />
          <span>Open File</span>
        </button>
      </div>
    </div>
  )
}

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const segments = normalized.split('/')
  return segments[segments.length - 1] || path
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.checkIcon}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="m5.5 10.25 2.75 2.75 6.25-6.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.folderIcon}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="M3.5 6.25a1.25 1.25 0 0 1 1.25-1.25h3l1.25 1.75h6a1.25 1.25 0 0 1 1.25 1.25V13.5a1.25 1.25 0 0 1-1.25 1.25H4.75A1.25 1.25 0 0 1 3.5 13.5V6.25Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
