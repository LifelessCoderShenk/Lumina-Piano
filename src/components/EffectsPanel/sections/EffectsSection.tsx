import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './EffectsSection.module.css'

export function EffectsSection() {
  const settings = useVisualizerSettings()
  const store = useAppStore()

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>Effects</div>

      <EffectRow
        label="Bloom"
        enabled={settings.bloomEnabled}
        value={`${settings.bloomStrength}%`}
        onToggle={store.setBloomEnabled}
      >
        <SliderRow label="STR" value={settings.bloomStrength} onChange={store.setBloomStrength} />
        <SliderRow label="RAD" value={settings.bloomRadius} onChange={store.setBloomRadius} />
      </EffectRow>

      <EffectRow
        label="Particles"
        enabled={settings.particlesEnabled}
        value={`${settings.particleCount}`}
        onToggle={store.setParticlesEnabled}
      >
        <SliderRow label="CNT" max={20} value={settings.particleCount} onChange={store.setParticleCount} />
        <SliderRow label="SIZ" value={settings.particleSize} onChange={store.setParticleSize} />
      </EffectRow>

      <EffectRow
        label="Key Glow"
        enabled={settings.keyGlowEnabled}
        value={`${settings.keyGlowIntensity}%`}
        onToggle={store.setKeyGlowEnabled}
      >
        <SliderRow label="INT" value={settings.keyGlowIntensity} onChange={store.setKeyGlowIntensity} />
      </EffectRow>
    </section>
  )
}

function EffectRow({
  label,
  enabled,
  value,
  onToggle,
  children,
}: {
  label: string
  enabled: boolean
  value: string
  onToggle(enabled: boolean): void
  children: React.ReactNode
}) {
  return (
    <div className={styles.effectRow}>
      <div className={styles.effectHeader}>
        <span className={styles.effectLabel}>{label}</span>
        <span className={styles.effectValue}>{value}</span>
        <label className={styles.toggle}>
          <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </div>
      {enabled ? <div className={styles.sliderGroup}>{children}</div> : null}
    </div>
  )
}

function SliderRow({
  label,
  value,
  onChange,
  max = 100,
}: {
  label: string
  value: number
  onChange(value: number): void
  max?: number
}) {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <input
        className={styles.slider}
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className={styles.sliderValue}>{value}</span>
    </div>
  )
}
