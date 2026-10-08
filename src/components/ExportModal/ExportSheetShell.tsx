import { type ReactNode, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import styles from './ExportModal.module.css'

interface ExportSheetShellProps {
  children: ReactNode
  isOpen: boolean
  onClose(): void
  title: string
  variant?: 'modal' | 'sheet'
  canDismiss?: boolean
}

/** Shared chrome for Create's modal and Camera Mode's canvas-contained sheet. */
export function ExportSheetShell({
  canDismiss = true,
  children,
  isOpen,
  onClose,
  title,
  variant = 'modal',
}: ExportSheetShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen || variant !== 'modal') {
      return
    }

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    getFocusableElements(dialogRef.current)[0]?.focus()
    return () => previousActiveElementRef.current?.focus()
  }, [isOpen, variant])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canDismiss) {
        event.preventDefault()
        onClose()
        return
      }

      if (variant !== 'modal' || event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(dialogRef.current)
      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [canDismiss, isOpen, onClose, variant])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className={[styles.overlay, variant === 'sheet' ? styles.sheetOverlay : ''].filter(Boolean).join(' ')}
      onMouseDown={(event) => {
        if (canDismiss && event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal={variant === 'modal' ? 'true' : undefined}
        className={[styles.dialog, !canDismiss ? styles.dialogLocked : ''].filter(Boolean).join(' ')}
        ref={dialogRef}
        role="dialog"
      >
        <div className={styles.header}>
          <h2 className={styles.title} id={titleId}>{title}</h2>
          <button
            aria-label="Close export dialog"
            className={styles.closeButton}
            disabled={!canDismiss}
            onClick={onClose}
            type="button"
          >
            <AppIcon icon={X} size={20} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}

function getFocusableElements(container: HTMLDivElement | null): HTMLElement[] {
  if (container == null) {
    return []
  }

  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
}
