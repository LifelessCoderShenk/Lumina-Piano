import React, { useEffect, useRef, useState } from 'react'

import styles from './EffectsPanel.module.css'
import { BackgroundSection } from './sections/BackgroundSection'
import { ColorModeSection } from './sections/ColorModeSection'
import { EffectsSection } from './sections/EffectsSection'
import { NoteLabelsSection } from './sections/NoteLabelsSection'
import { NoteStyleSection } from './sections/NoteStyleSection'

export interface EffectsPanelProps {
  onClose(): void
}

const MIN_WIDTH = 240
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 320

export function EffectsPanel({ onClose }: EffectsPanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const isResizing = useRef(false)
  const moveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null)
  const upHandlerRef = useRef<((event: MouseEvent) => void) | null>(null)

  useEffect(() => {
    return () => {
      detachListeners(moveHandlerRef, upHandlerRef, isResizing)
    }
  }, [])

  const onResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    detachListeners(moveHandlerRef, upHandlerRef, isResizing)

    isResizing.current = true
    const startX = event.clientX
    const startWidth = width

    const onMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) {
        return
      }

      const nextWidth = clamp(startWidth + moveEvent.clientX - startX, MIN_WIDTH, MAX_WIDTH)
      setWidth(nextWidth)
    }

    const onUp = () => {
      detachListeners(moveHandlerRef, upHandlerRef, isResizing)
    }

    moveHandlerRef.current = onMove
    upHandlerRef.current = onUp

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className={styles.panel} style={{ width }}>
      <div className={styles.header}>
        <div className={styles.title}>Effects</div>
        <button className={styles.closeButton} aria-label="Close effects panel" onClick={onClose}>
          ×
        </button>
      </div>
      <div className={styles.content}>
        <ColorModeSection />
        <NoteStyleSection />
        <NoteLabelsSection />
        <EffectsSection />
        <BackgroundSection />
      </div>
      <div
        className={styles.resizeHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize effects panel"
        onMouseDown={onResizeStart}
      />
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function detachListeners(
  moveHandlerRef: React.MutableRefObject<((event: MouseEvent) => void) | null>,
  upHandlerRef: React.MutableRefObject<((event: MouseEvent) => void) | null>,
  isResizing: React.MutableRefObject<boolean>,
): void {
  if (moveHandlerRef.current != null) {
    document.removeEventListener('mousemove', moveHandlerRef.current)
    moveHandlerRef.current = null
  }

  if (upHandlerRef.current != null) {
    document.removeEventListener('mouseup', upHandlerRef.current)
    upHandlerRef.current = null
  }

  isResizing.current = false
}
