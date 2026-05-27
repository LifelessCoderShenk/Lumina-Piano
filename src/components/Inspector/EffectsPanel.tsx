import React from 'react'
import { useUIState, useAppStore } from '../../store/store'
import styles from './Inspector.module.css'

function EffectToggle({ label, enabled, onChange }: { label: string, enabled: boolean, onChange: (v: boolean) => void }) {
  return (
    <div className={styles.effectToggle}>
      <span>{label}</span>
      <label className={styles.switch}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />
        <span className={styles.slider}></span>
      </label>
    </div>
  )
}

export function EffectsPanel() {
  const { showBloom, showParticles } = useUIState()

  return (
    <div className={styles.effects}>
      <EffectToggle
        label="Bloom"
        enabled={showBloom}
        onChange={v => useAppStore.getState().setShowBloom(v)}
      />
      <EffectToggle
        label="Particles"
        enabled={showParticles}
        onChange={v => useAppStore.getState().setShowParticles(v)}
      />
    </div>
  )
}
