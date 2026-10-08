import { Star, Trash2, Undo2 } from 'lucide-react'

import type { TranscriptionSession } from '../../transcription/types'
import { AppIcon } from '../AppIcon/AppIcon'
import styles from './TranscriptorMode.module.css'

interface Props {
  takes: readonly TranscriptionSession[]
  activeId: string
  disabled: boolean
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: { name?: string; favorite?: boolean }) => void
  onDelete: (id: string) => void
  undoDelete: (() => void) | null
}

export function TakesPanel({ takes, activeId, disabled, onSelect, onUpdate, onDelete, undoDelete }: Props) {
  if (!takes.length && !undoDelete) return null

  return <div className={styles.takesPanel} aria-label="Recorded takes">
    <div className={styles.takeList} role="list">
      {[...takes].reverse().map((take) => {
        const active = take.id === activeId
        const name = take.name ?? 'Untitled take'
        const duration = formatDuration(take.durationMs)
        const type = takeType(take)
        const parent = take.parentId ? takes.find((candidate) => candidate.id === take.parentId) : undefined
        const relationship = parent && type !== 'Original' ? `${type} from ${parent.name ?? 'earlier take'}` : type
        return <div className={`${styles.takeRow} ${active ? styles.activeTake : ''}`} key={take.id} role="listitem">
          <button type="button" className={styles.takeSelect} aria-label={`Select ${name}, ${relationship}, ${duration}${take.favorite ? ', favorite' : ''}`} aria-pressed={active} disabled={disabled} onClick={() => onSelect(take.id)}>
            <span className={styles.takeSummary}>
              <span className={styles.takeName}>{name}</span>
              <span className={styles.takeType} title={relationship}>{type}</span>
              {take.favorite && <AppIcon className={styles.takeFavoriteMark} icon={Star} size={16} />}
            </span>
            <span className={styles.takeMeta}>{duration}<span aria-hidden="true"> · </span>{formatRecordedAt(take.savedAt)}</span>
          </button>
          {active && <div className={styles.takeActions} aria-label={`${name} actions`}>
            <input key={`${take.id}:${name}`} aria-label={`Rename ${name}`} defaultValue={name} maxLength={80} disabled={disabled} onBlur={(event) => onUpdate(take.id, { name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
            <button type="button" title={take.favorite ? 'Remove favorite' : 'Favorite take'} aria-label={take.favorite ? `Remove ${name} from favorites` : `Favorite ${name}`} disabled={disabled} aria-pressed={take.favorite ?? false} onClick={() => onUpdate(take.id, { favorite: !take.favorite })}><AppIcon icon={Star} size={16} /></button>
            <button type="button" title="Delete take" aria-label={`Delete ${name}`} disabled={disabled} onClick={() => onDelete(take.id)}><AppIcon icon={Trash2} size={16} /></button>
          </div>}
        </div>
      })}
    </div>
    {undoDelete && <button type="button" className={styles.undoTakeButton} disabled={disabled} onClick={undoDelete}><AppIcon icon={Undo2} size={16} /> Undo delete</button>}
  </div>
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function formatRecordedAt(savedAt: number): string {
  const date = new Date(savedAt)
  if (!Number.isFinite(date.getTime())) return 'Recently recorded'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function takeType(take: TranscriptionSession): 'Original' | 'Continued' | 'Replacement' {
  if (take.operation?.kind === 'continue') return 'Continued'
  if (take.operation?.kind === 'replace') return 'Replacement'
  return 'Original'
}
