import React from 'react'
import { Camera, Files, Palette, Sparkles } from 'lucide-react'
import { AppIcon } from '../AppIcon/AppIcon'
import { useAppStore, type CreateTab } from '../../store/store'
import styles from './SecondBar.module.css'

const secondBarStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const tabButtonStyle = {
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text-body)',
} as const

const tabIconStyle = {
  color: 'var(--color-icon)',
} as const

export function SecondBar() {
  const appMode = useAppStore((state) => state.appMode)
  const activeTab = useAppStore((state) => state.activeSecondBarTab)
  const setActiveSecondBarTab = useAppStore((state) => state.setActiveSecondBarTab)
  const showCameraTab = appMode === 'createCamera' || appMode === 'createRecord'

  return (
    <section className={styles.secondBar} data-testid="second-bar" style={secondBarStyle}>
      <div className={styles.tabRow}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'pieces' ? styles.activeTab : ''}`}
          aria-pressed={activeTab === 'pieces'}
          onClick={() => setActiveSecondBarTab('pieces')}
          style={tabButtonStyle}
        >
          <AppIcon className={styles.tabIcon} data-testid="pieces-tab-icon" icon={Files} size={18} style={tabIconStyle} />
          <span
            className={`${styles.label} ${activeTab === 'pieces' ? styles.activeLabel : ''}`}
            style={{ color: activeTab === 'pieces' ? 'var(--color-text-header)' : 'var(--color-text-body)' }}
          >
            Pieces
          </span>
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'particles' ? styles.activeTab : ''}`}
          aria-pressed={activeTab === 'particles'}
          onClick={() => setActiveSecondBarTab('particles')}
          style={tabButtonStyle}
        >
          <AppIcon className={styles.tabIcon} data-testid="particles-tab-icon" icon={Sparkles} size={18} style={tabIconStyle} />
          <span
            className={`${styles.label} ${activeTab === 'particles' ? styles.activeLabel : ''}`}
            style={{ color: activeTab === 'particles' ? 'var(--color-text-header)' : 'var(--color-text-body)' }}
          >
            Particles
          </span>
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'color' ? styles.activeTab : ''}`}
          aria-pressed={activeTab === 'color'}
          onClick={() => setActiveSecondBarTab('color')}
          style={tabButtonStyle}
        >
          <AppIcon className={styles.tabIcon} icon={Palette} size={18} style={tabIconStyle} />
          <span
            className={`${styles.label} ${activeTab === 'color' ? styles.activeLabel : ''}`}
            style={{ color: activeTab === 'color' ? 'var(--color-text-header)' : 'var(--color-text-body)' }}
          >
            Color Picker
          </span>
        </button>
        {showCameraTab ? (
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'camera' ? styles.activeTab : ''}`}
            aria-pressed={activeTab === 'camera'}
            onClick={() => setActiveSecondBarTab('camera')}
            style={tabButtonStyle}
          >
            <AppIcon className={styles.tabIcon} data-testid="camera-tab-icon" icon={Camera} size={18} style={tabIconStyle} />
            <span
              className={`${styles.label} ${activeTab === 'camera' ? styles.activeLabel : ''}`}
              style={{ color: activeTab === 'camera' ? 'var(--color-text-header)' : 'var(--color-text-body)' }}
            >
              Camera
            </span>
          </button>
        ) : null}
      </div>
    </section>
  )
}
