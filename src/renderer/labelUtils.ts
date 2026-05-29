const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function getNoteLabel(pitch: number, format: 'name' | 'nameOctave'): string {
  const normalizedPitchClass = ((pitch % 12) + 12) % 12
  const name = NOTE_NAMES[normalizedPitchClass]

  if (format === 'name') {
    return name
  }

  const octave = Math.floor(pitch / 12) - 1
  return `${name}${octave}`
}
