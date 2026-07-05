import React from 'react'

import { type VisualizerSettings, useAppStore, visualizerSettingsInitial } from '../../store/store'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose(): void
}

const panelStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const bodyTextStyle = {
  color: 'var(--color-text-body)',
} as const

const headerTextStyle = {
  color: 'var(--color-text-header)',
} as const

const ASPECT_RATIO_OPTIONS: VisualizerSettings['aspectRatio'][] = ['fit', '16:9', '1:1', '4:3']
const RESOLUTION_OPTIONS: VisualizerSettings['resolution'][] = ['720p', '1080p', '1440p', '4K']
const FRAMERATE_OPTIONS: VisualizerSettings['framerate'][] = [24, 30, 60]

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useAppStore((state) => state.visualizerSettings)
  const setVisualizerSettings = useAppStore((state) => state.setVisualizerSettings)

  return (
    <section className={styles.panel} data-testid="settings-panel" style={panelStyle}>
      <div className={styles.headerRow}>
        <h2 className={styles.heading} style={headerTextStyle}>Visualizer Settings</h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          style={bodyTextStyle}
        >
          Close
        </button>
      </div>

      <SettingsSection
        title="ASPECT RATIO"
        options={ASPECT_RATIO_OPTIONS}
        value={settings.aspectRatio}
        onSelect={(aspectRatio) => {
          setVisualizerSettings({ aspectRatio })
        }}
      />

      <SettingsSection
        title="RESOLUTION"
        options={RESOLUTION_OPTIONS}
        value={settings.resolution}
        onSelect={(resolution) => {
          setVisualizerSettings({ resolution })
        }}
      />

      <SettingsSection
        title="FRAMERATE"
        options={FRAMERATE_OPTIONS}
        value={settings.framerate}
        onSelect={(framerate) => {
          setVisualizerSettings({ framerate })
        }}
      />

      <p className={styles.footerNote} style={bodyTextStyle}>
        Defaults: {visualizerSettingsInitial.aspectRatio}, {visualizerSettingsInitial.resolution}, {visualizerSettingsInitial.framerate} FPS
      </p>
    </section>
  )
}

interface SettingsSectionProps<T extends string | number> {
  title: string
  options: T[]
  value: T
  onSelect(value: T): void
}

function SettingsSection<T extends string | number>({
  title,
  options,
  value,
  onSelect,
}: SettingsSectionProps<T>) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle} style={headerTextStyle}>{title}</h3>
      <div className={styles.segmentedControl}>
        {options.map((option) => {
          const selected = option === value

          return (
            <button
              key={String(option)}
              type="button"
              className={`${styles.segmentButton} ${selected ? styles.segmentButtonActive : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(option)}
              style={{
                backgroundColor: selected ? 'var(--color-icon)' : 'transparent',
                color: 'var(--color-text-body)',
              }}
            >
              {option === 'fit' ? 'Fit' : option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
