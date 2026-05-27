import React, { useEffect, useRef } from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './VelocityControls.module.css'

export function VelocityControls() {
  const { velocityHighColor, velocityLowColor } = useVisualizerSettings()
  const setVelocityColors = useAppStore((state) => state.setVelocityColors)
  const gradientRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (gradientRef.current == null) {
      return
    }

    gradientRef.current.style.setProperty('--velocity-low', velocityLowColor)
    gradientRef.current.style.setProperty('--velocity-high', velocityHighColor)
  }, [velocityHighColor, velocityLowColor])

  return (
    <div className={styles.wrapper}>
      <div ref={gradientRef} className={styles.gradientBar} />
      <div className={styles.swatches}>
        <ColorField
          label="Soft"
          color={velocityLowColor}
          onChange={(color) => setVelocityColors(color, velocityHighColor)}
        />
        <ColorField
          label="Loud"
          color={velocityHighColor}
          onChange={(color) => setVelocityColors(velocityLowColor, color)}
        />
      </div>
    </div>
  )
}

function ColorField({
  label,
  color,
  onChange,
}: {
  label: string
  color: string
  onChange(color: string): void
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.colorInput} type="color" value={color} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
