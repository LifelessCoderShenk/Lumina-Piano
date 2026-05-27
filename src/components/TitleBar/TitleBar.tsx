import React from 'react'
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
        <button onClick={() => window.electronAPI?.window.minimize()}>─</button>
        <button onClick={() => window.electronAPI?.window.maximize()}>□</button>
        <button onClick={() => window.electronAPI?.window.close()}>✕</button>
      </div>
    </div>
  )
}
