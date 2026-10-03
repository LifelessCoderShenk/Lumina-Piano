import React from 'react'
import { Maximize2, Minus, X } from 'lucide-react'
import { AppIcon } from '../AppIcon/AppIcon'
import styles from './TitleBar.module.css'

export function TitleBar() {
  return (
    <div className={styles.titleBar}>
      <div className={styles.dragRegion} />

      <div className={styles.wordmark}>
        <span className={styles.lumina}>LUMINA</span>
        <span className={styles.piano}>Lumina Piano</span>
      </div>

      <div className={styles.windowControls}>
        <button aria-label="Minimize window" onClick={() => window.electronAPI?.window.minimize()}><AppIcon icon={Minus} size={16} /></button>
        <button aria-label="Maximize window" onClick={() => window.electronAPI?.window.maximize()}><AppIcon icon={Maximize2} size={16} /></button>
        <button aria-label="Close window" onClick={() => window.electronAPI?.window.close()}><AppIcon icon={X} size={16} /></button>
      </div>
    </div>
  )
}
