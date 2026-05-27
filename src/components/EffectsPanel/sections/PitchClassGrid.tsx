import React from 'react'
import { useAppStore, useVisualizerSettings } from '../../../store/store'
import styles from './PitchClassGrid.module.css'

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const PAIRS = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
] as const

export function PitchClassGrid() {
  const { pitchClassColors } = useVisualizerSettings()
  const setPitchClassColor = useAppStore((state) => state.setPitchClassColor)

  return (
    <div className={styles.grid}>
      {PAIRS.map(([left, right]) => (
        <React.Fragment key={left}>
          <PitchCell
            label={PITCH_NAMES[left]}
            color={pitchClassColors[left]}
            onChange={(color) => setPitchClassColor(left, color)}
          />
          <PitchCell
            label={PITCH_NAMES[right]}
            color={pitchClassColors[right]}
            onChange={(color) => setPitchClassColor(right, color)}
          />
        </React.Fragment>
      ))}
    </div>
  )
}

function PitchCell({
  label,
  color,
  onChange,
}: {
  label: string
  color: string
  onChange(color: string): void
}) {
  return (
    <label className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <input className={styles.colorInput} type="color" value={color} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
