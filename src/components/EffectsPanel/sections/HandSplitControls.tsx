import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './HandSplitControls.module.css'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function HandSplitControls() {
  const { leftHandColor, rightHandColor, splitPitch } = useVisualizerSettings()
  const setLeftHandColor = useAppStore((state) => state.setLeftHandColor)
  const setRightHandColor = useAppStore((state) => state.setRightHandColor)
  const setSplitPitch = useAppStore((state) => state.setSplitPitch)

  return (
    <div className={styles.controls}>
      <div className={styles.splitPoint}>
        <div className={styles.headerRow}>
          <label className={styles.label}>Split Point</label>
          <span className={styles.value}>{midiPitchToName(splitPitch)}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={21}
          max={108}
          value={splitPitch}
          onChange={(event) => setSplitPitch(Number(event.target.value))}
        />
      </div>

      <div className={styles.handColors}>
        <ColorField label="Left Hand" color={leftHandColor} onChange={setLeftHandColor} />
        <ColorField label="Right Hand" color={rightHandColor} onChange={setRightHandColor} />
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
    <label className={styles.colorField}>
      <span className={styles.label}>{label}</span>
      <input className={styles.colorInput} type="color" value={color} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function midiPitchToName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1
  return `${NOTE_NAMES[pitch % 12]}${octave}`
}
