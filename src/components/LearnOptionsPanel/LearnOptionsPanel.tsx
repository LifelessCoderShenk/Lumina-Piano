import React, { useState } from 'react'

import {
  type LearnVisuals,
  learnVisualsInitial,
  useAppStore,
} from '../../store/store'
import styles from './LearnOptionsPanel.module.css'

const PRESETS: Record<'Classic' | 'Dark' | 'High Contrast', LearnVisuals> = {
  Classic: {
    fingerNumbersEnabled: true,
    glowEnabled: false,
    leftHandColor: '#4ade80',
    noteColor: 'perHand',
    noteLabelsEnabled: true,
    noteOpacity: 1.0,
    rightHandColor: '#60a5fa',
  },
  Dark: {
    fingerNumbersEnabled: false,
    glowEnabled: false,
    leftHandColor: '#166534',
    noteColor: 'perHand',
    noteLabelsEnabled: false,
    noteOpacity: 0.7,
    rightHandColor: '#1e3a5f',
  },
  'High Contrast': {
    fingerNumbersEnabled: true,
    glowEnabled: true,
    leftHandColor: '#ffffff',
    noteColor: 'white',
    noteLabelsEnabled: true,
    noteOpacity: 1.0,
    rightHandColor: '#ffffff',
  },
}

export function LearnOptionsPanel() {
  const learnVisuals = useAppStore((state) => state.learnVisuals)
  const setLearnVisuals = useAppStore((state) => state.setLearnVisuals)
  const setLearnVisualsPreset = useAppStore((state) => state.setLearnVisualsPreset)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSavePreset = async () => {
    setErrorMessage(null)

    try {
      const savePath = await window.electronAPI.showSaveDialog({
        defaultPath: 'learn-visuals.json',
        filters: [{ extensions: ['json'], name: 'JSON Files' }],
      })
      if (savePath == null) {
        return
      }

      const payload = new TextEncoder().encode(JSON.stringify(learnVisuals, null, 2))
      await window.electronFS.writeFile(savePath, payload)
    } catch (error) {
      console.error('Failed to save learn visuals preset:', error)
      setErrorMessage('Failed to save preset.')
    }
  }

  const handleLoadPreset = async () => {
    setErrorMessage(null)

    try {
      const content = await window.electronAPI.openJsonFile()
      if (content == null) {
        return
      }

      const parsed = JSON.parse(content) as LearnVisuals
      setLearnVisualsPreset(parsed)
    } catch (error) {
      console.error('Failed to load learn visuals preset:', error)
      setErrorMessage('Failed to load preset.')
    }
  }

  const renderColorPickers = () => {
    if (learnVisuals.noteColor === 'perHand') {
      return (
        <div className={styles.colorPickerRow}>
          <label className={styles.colorField}>
            <span className={styles.colorLabel}>L</span>
            <input
              type="color"
              aria-label="Left hand color"
              value={learnVisuals.leftHandColor}
              onChange={(event) => {
                setLearnVisuals({ leftHandColor: event.target.value })
              }}
            />
          </label>
          <label className={styles.colorField}>
            <span className={styles.colorLabel}>R</span>
            <input
              type="color"
              aria-label="Right hand color"
              value={learnVisuals.rightHandColor}
              onChange={(event) => {
                setLearnVisuals({ rightHandColor: event.target.value })
              }}
            />
          </label>
        </div>
      )
    }

    if (learnVisuals.noteColor === 'custom') {
      return (
        <label className={styles.colorField}>
          <span className={styles.colorLabel}>Color</span>
          <input
            type="color"
            aria-label="Custom note color"
            value={learnVisuals.leftHandColor}
            onChange={(event) => {
              setLearnVisuals({ leftHandColor: event.target.value })
            }}
          />
        </label>
      )
    }

    return null
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>LEARN OPTIONS</div>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>NOTE STYLE</div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabel}>Color Mode</div>
            <div className={styles.segmentedControl} role="group" aria-label="Color mode">
              {(['white', 'perHand', 'custom'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${styles.segmentButton} ${learnVisuals.noteColor === mode ? styles.segmentButtonActive : ''}`}
                  aria-pressed={learnVisuals.noteColor === mode}
                  onClick={() => {
                    setLearnVisuals({ noteColor: mode })
                  }}
                >
                  {mode === 'white' ? 'White' : mode === 'perHand' ? 'Per Hand' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {renderColorPickers()}

          <div className={styles.fieldGroup}>
            <div className={styles.fieldHeader}>
              <span className={styles.fieldLabel}>OPACITY</span>
              <span className={styles.valueLabel}>{learnVisuals.noteOpacity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={learnVisuals.noteOpacity}
              aria-label="Note opacity"
              onChange={(event) => {
                setLearnVisuals({ noteOpacity: Number(event.target.value) })
              }}
            />
          </div>

          <div className={styles.toggleList}>
            <ToggleButton
              label="Glow"
              pressed={learnVisuals.glowEnabled}
              onClick={() => {
                setLearnVisuals({ glowEnabled: !learnVisuals.glowEnabled })
              }}
            />
            <ToggleButton
              label="Note Labels"
              pressed={learnVisuals.noteLabelsEnabled}
              onClick={() => {
                setLearnVisuals({ noteLabelsEnabled: !learnVisuals.noteLabelsEnabled })
              }}
            />
            <ToggleButton
              label="Finger Numbers"
              pressed={learnVisuals.fingerNumbersEnabled}
              onClick={() => {
                setLearnVisuals({ fingerNumbersEnabled: !learnVisuals.fingerNumbersEnabled })
              }}
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>PRESETS</div>

          <div className={styles.presetRow}>
            {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((presetName) => (
              <button
                key={presetName}
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setLearnVisualsPreset(PRESETS[presetName])
                }}
              >
                {presetName}
              </button>
            ))}
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                void handleSavePreset()
              }}
            >
              SAVE PRESET
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                void handleLoadPreset()
              }}
            >
              LOAD PRESET
            </button>
          </div>
        </section>

        {errorMessage != null ? (
          <div className={styles.errorMessage} role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

type ToggleButtonProps = {
  label: string
  onClick(): void
  pressed: boolean
}

function ToggleButton({ label, onClick, pressed }: ToggleButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.toggleButton} ${pressed ? styles.toggleButtonActive : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span>{label}</span>
      <span>{pressed ? 'ON' : 'OFF'}</span>
    </button>
  )
}

export { PRESETS, learnVisualsInitial }
