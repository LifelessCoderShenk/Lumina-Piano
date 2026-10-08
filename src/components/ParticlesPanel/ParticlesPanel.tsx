import React from 'react'

import {
  PARTICLE_PRESETS,
  findParticlePreset,
} from '../../store/particlePresets'
import type { ParticleSettings } from '../../store/types'
import { useAppStore } from '../../store/store'
import styles from './ParticlesPanel.module.css'

const PARTICLE_CONTROLS: Array<{
  key: Exclude<keyof ParticleSettings, 'enabled' | 'style'>
  label: string
  min: number
  max: number
}> = [
  { key: 'density', label: 'Burst Density', min: 25, max: 200 },
  { key: 'size', label: 'Particle Size', min: 50, max: 200 },
  { key: 'speed', label: 'Speed', min: 50, max: 200 },
  { key: 'spread', label: 'Spread', min: 0, max: 200 },
  { key: 'lifetime', label: 'Lifetime', min: 50, max: 200 },
  { key: 'glow', label: 'Glow', min: 50, max: 200 },
]

export function ParticlesPanel() {
  const particleSettings = useAppStore((state) => state.particleSettings)
  const resetParticleSettings = useAppStore((state) => state.resetParticleSettings)
  const setParticlePreset = useAppStore((state) => state.setParticlePreset)
  const setParticleSettings = useAppStore((state) => state.setParticleSettings)
  const activePreset = findParticlePreset(particleSettings)

  return (
    <section className={styles.panel} data-testid="particles-panel">
      <div className={styles.header}>PARTICLES</div>

      <div className={styles.content}>
        <label className={styles.enabledControl}>
          <span>Enable particles</span>
          <input
            aria-label="Enable particles"
            type="checkbox"
            checked={particleSettings.enabled}
            onChange={(event) => setParticleSettings({ enabled: event.target.checked })}
          />
        </label>

        <div className={styles.styleControl} role="group" aria-label="Particle shape">
          {(['spark', 'wisp', 'ray'] as const).map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={particleSettings.style === style}
              className={particleSettings.style === style ? styles.styleButtonActive : styles.styleButton}
              onClick={() => setParticleSettings({ style })}
            >
              {style === 'spark' ? 'Spark' : style === 'wisp' ? 'Wisp' : 'Ray'}
            </button>
          ))}
        </div>

        <div className={`${styles.styleControl} ${styles.colorModeControl}`} role="group" aria-label="Particle color">
          <button
            type="button"
            aria-pressed={particleSettings.colorMode === 'note'}
            className={particleSettings.colorMode === 'note' ? styles.styleButtonActive : styles.styleButton}
            onClick={() => setParticleSettings({ colorMode: 'note' })}
          >
            Follow notes
          </button>
          <button
            type="button"
            aria-pressed={particleSettings.colorMode === 'custom'}
            className={particleSettings.colorMode === 'custom' ? styles.styleButtonActive : styles.styleButton}
            onClick={() => setParticleSettings({ colorMode: 'custom' })}
          >
            Custom
          </button>
        </div>
        {particleSettings.colorMode === 'custom' ? (
          <label className={styles.colorControl}>
            <span>Particle color</span>
            <input
              aria-label="Custom particle color"
              type="color"
              value={particleSettings.customColor}
              onChange={(event) => setParticleSettings({ customColor: event.target.value })}
            />
          </label>
        ) : null}

        <div className={styles.presetRow}>
          <label className={styles.presetControl}>
            <span>Preset</span>
            <select
              aria-label="Particle preset"
              onChange={(event) => {
                const preset = PARTICLE_PRESETS.find(({ id }) => id === event.target.value)
                if (preset != null) {
                  setParticlePreset(preset.id)
                }
              }}
              value={activePreset?.id ?? 'custom'}
            >
              {activePreset == null ? <option value="custom">Custom</option> : null}
              {PARTICLE_PRESETS.map(({ id, label }) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <button className={styles.resetButton} onClick={resetParticleSettings} type="button">
            Reset to Default
          </button>
        </div>

        <div className={styles.controls}>
          {PARTICLE_CONTROLS.map(({ key, label, min, max }) => (
            <label key={key} className={styles.rangeControl}>
              <span className={styles.rangeLabel}>
                <span>{label}</span>
                <output>{particleSettings[key]}%</output>
              </span>
              <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                value={particleSettings[key]}
                onChange={(event) => setParticleSettings({ [key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}
