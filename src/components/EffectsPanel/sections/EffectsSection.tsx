import React, { useEffect, useRef, useState } from 'react'

import { useAppStore, useVisualizerSettings } from '../../../store/store'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './EffectsSection.module.css'

export function EffectsSection() {
  const settings = useVisualizerSettings()
  const store = useAppStore()

  return (
    <CollapsibleSection
      className={styles.section}
      contentClassName={styles.sectionContent}
      title="Effects"
      titleClassName={styles.sectionHeader}
    >
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
        <ToggleRow label="Trails" enabled={settings.particleTrails} onToggle={store.setParticleTrails} />
      </EffectRow>

      <EffectRow
        label="Key Glow"
        enabled={settings.keyGlowEnabled}
        value={`${settings.keyGlowIntensity}%`}
        onToggle={store.setKeyGlowEnabled}
      >
        <SliderRow label="INT" value={settings.keyGlowIntensity} onChange={store.setKeyGlowIntensity} />
      </EffectRow>

      <CollapsibleToggleRow
        label="Inner Glow"
        enabled={settings.effectsEnabled.innerGlow}
        onToggle={store.setInnerGlowEnabled}
      />

      <CollapsibleToggleRow
        label="Layered Glow"
        enabled={settings.effectsEnabled.layeredGlow}
        onToggle={store.setLayeredGlowEnabled}
      />
    </CollapsibleSection>
  )
}

function CollapsibleToggleRow({
  label,
  enabled,
  onToggle,
}: {
  label: string
  enabled: boolean
  onToggle(enabled: boolean): void
}) {
  const [expanded, setExpanded] = useState(true)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current != null) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [expanded, enabled])

  return (
    <div className={styles.effectRow}>
      <button className={styles.collapsibleHeader} type="button" onClick={() => setExpanded((value) => !value)}>
        <span className={styles.chevron}>{expanded ? '\u2228' : '\u203A'}</span>
        <span className={styles.effectLabel}>{label}</span>
      </button>
      <div className={styles.collapsibleBody} style={{ maxHeight: expanded ? `${contentHeight}px` : '0px' }}>
        <div ref={contentRef} className={styles.toggleBody}>
          <ToggleRow label={label} enabled={enabled} onToggle={onToggle} />
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  enabled,
  onToggle,
}: {
  label: string
  enabled: boolean
  onToggle(enabled: boolean): void
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <label className={styles.toggle}>
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
        <span className={styles.toggleTrack} />
        <span className={styles.toggleThumb} />
      </label>
    </div>
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
  const [expanded, setExpanded] = useState(true)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current != null) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [children, enabled, expanded])

  return (
    <div className={styles.effectRow}>
      <button className={styles.collapsibleHeader} type="button" onClick={() => setExpanded((current) => !current)}>
        <span className={styles.chevron}>{expanded ? '\u2228' : '\u203A'}</span>
        <span className={styles.effectLabel}>{label}</span>
        <span className={styles.effectValue}>{value}</span>
        <label
          className={styles.toggle}
          onClick={(event) => event.stopPropagation()}
        >
          <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </button>
      <div className={styles.collapsibleBody} style={{ maxHeight: expanded ? `${contentHeight}px` : '0px' }}>
        <div ref={contentRef} className={styles.sliderGroup}>
          {enabled ? children : null}
        </div>
      </div>
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
