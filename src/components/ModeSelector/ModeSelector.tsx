import { useState, type KeyboardEvent } from 'react'

import styles from './ModeSelector.module.css'

type HoverState = 'none' | 'create' | 'learn'
type SelectorMode = 'create' | 'learn'

interface ModeSelectorProps {
  onSelect(mode: SelectorMode): void
}

const TEXT_COLOR_DEFAULT = '#ffffff'
const TEXT_COLOR_CREATE = '#4f8ef7'
const TEXT_COLOR_LEARN = '#4ff7a0'
const CREATE_GLOW = '0 0 40px rgba(79,142,247,0.8), 0 0 80px rgba(79,142,247,0.4)'
const LEARN_GLOW = '0 0 40px rgba(79,247,160,0.8), 0 0 80px rgba(79,247,160,0.4)'

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  const [hovered, setHovered] = useState<HoverState>('none')

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, mode: SelectorMode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(mode)
    }
  }

  return (
    <div className={styles.screen}>
      <div
        className={styles.atmosphereCreate}
        style={{ opacity: hovered === 'create' ? 1 : 0 }}
      />
      <div
        className={styles.atmosphereLearn}
        style={{ opacity: hovered === 'learn' ? 1 : 0 }}
      />

      <div
        className={styles.half}
        onMouseEnter={() => setHovered('create')}
        onMouseLeave={() => setHovered('none')}
        onClick={() => onSelect('create')}
        onFocus={() => setHovered('create')}
        onBlur={() => setHovered('none')}
        onKeyDown={(event) => handleKeyDown(event, 'create')}
        role="button"
        tabIndex={0}
      >
        <span
          className={styles.word}
          style={{
            color: hovered === 'create' ? TEXT_COLOR_CREATE : TEXT_COLOR_DEFAULT,
            textShadow: hovered === 'create' ? CREATE_GLOW : 'none',
          }}
        >
          CREATE
        </span>
      </div>

      <div className={styles.divider} />

      <div
        className={styles.half}
        onMouseEnter={() => setHovered('learn')}
        onMouseLeave={() => setHovered('none')}
        onClick={() => onSelect('learn')}
        onFocus={() => setHovered('learn')}
        onBlur={() => setHovered('none')}
        onKeyDown={(event) => handleKeyDown(event, 'learn')}
        role="button"
        tabIndex={0}
      >
        <span
          className={styles.word}
          style={{
            color: hovered === 'learn' ? TEXT_COLOR_LEARN : TEXT_COLOR_DEFAULT,
            textShadow: hovered === 'learn' ? LEARN_GLOW : 'none',
          }}
        >
          LEARN
        </span>
      </div>
    </div>
  )
}
