import styles from './TranscriptorMode.module.css'

export function beatDurationMs(bpm: number, meter: string): number {
  return 60000 / bpm * 4 / Number(meter.split('/')[1])
}

export function musicalPosition(timeMs: number, bpm: number, meter: string) {
  const beatsPerBar = Number(meter.split('/')[0])
  const beats = Math.max(0, timeMs) / beatDurationMs(bpm, meter)
  const barIndex = Math.floor((beats + 1e-9) / beatsPerBar)
  return { bar: barIndex + 1, beat: Math.max(1, beats - barIndex * beatsPerBar + 1) }
}

interface Props {
  label: string
  accessibleLabel: string
  timeMs: number
  bpm: number
  meter: string
  step: number
  onChange: (timeMs: number) => void
}

export function MusicalPositionFields({ label, accessibleLabel, timeMs, bpm, meter, step, onChange }: Props) {
  const position = musicalPosition(timeMs, bpm, meter)
  const beatsPerBar = Number(meter.split('/')[0])
  return <span className={styles.positionFields}>
    {(['bar', 'beat'] as const).map((field) => <label key={`${field}:${timeMs}:${bpm}:${meter}`}>
      {field === 'bar' ? `${label} bar` : 'Beat'}
      <input aria-label={`${accessibleLabel} ${field}`} type="number" min="1" max={field === 'beat' ? beatsPerBar + 1 : undefined} step={field === 'bar' ? 1 : step} defaultValue={Number(position[field].toFixed(6))} onBlur={(event) => {
        if (event.currentTarget.value === event.currentTarget.defaultValue) return
        const value = Number(event.currentTarget.value)
        if (!Number.isFinite(value) || event.currentTarget.value === '') return
        const bar = field === 'bar' ? Math.max(1, Math.round(value)) : position.bar
        const beat = field === 'beat' ? Math.min(beatsPerBar + 1, Math.max(1, value)) : position.beat
        onChange(((bar - 1) * beatsPerBar + beat - 1) * beatDurationMs(bpm, meter))
      }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    </label>)}
  </span>
}
