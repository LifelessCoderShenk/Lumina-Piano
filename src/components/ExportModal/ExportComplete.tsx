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
        <AppIcon className={styles.checkIcon} icon={CircleCheck} size={24} />
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
          <AppIcon className={styles.folderIcon} icon={FolderOpen} size={16} />
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

import { CircleCheck, FolderOpen } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
