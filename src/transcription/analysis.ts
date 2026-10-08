import { KEY_SIGNATURES } from './settings'
import type { CapturedNote, KeySignature, Quantization, TranscriptionSettings } from './types'

export function gridTicks(grid: Quantization = 'sixteenth'): number {
  return ({ eighth: 240, 'eighth-triplet': 160, sixteenth: 120, 'sixteenth-triplet': 80, none: 120 })[grid]
}
export function estimateTempo(notes: readonly CapturedNote[]): number | null {
  const onsets = [...new Set(notes.map((note) => note.startMs))].sort((a, b) => a - b)
    .filter((time, i, times) => i === 0 || time - times[i - 1] > 60)
  if (onsets.length < 5) return null
  const intervals = onsets.slice(1).map((time, i) => time - onsets[i]).filter((gap) => gap >= 100 && gap <= 2000)
  if (intervals.length < 4) return null
  let best = 120; let bestScore = -Infinity
  for (let bpm = 40; bpm <= 240; bpm++) {
    const beat = 60000 / bpm
    const score = intervals.reduce((sum, gap) => {
      const error = Math.min(...[0.25, 1 / 3, 0.5, 2 / 3, 1, 1.5, 2, 3, 4].map((multiple) => Math.abs(gap / beat - multiple)))
      return sum + Math.exp(-error * error / 0.004)
    }, 0) / intervals.length - Math.abs(Math.log2(bpm / 120)) * 0.04
    if (score > bestScore) { bestScore = score; best = bpm }
  }
  return bestScore > 0.6 ? best : null
}

const SIGNATURES: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6 }
const NATURALS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

export function detectKeySignature(notes: readonly CapturedNote[]): KeySignature {
  if (notes.length < 3) return 'C'
  const histogram = Array<number>(12).fill(0)
  notes.forEach((note) => { histogram[note.pitch % 12] += Math.sqrt(Math.min(2000, Math.max(1, note.endMs - note.startMs))) * note.velocity / 127 })
  let best: KeySignature = 'C'; let bestScore = -Infinity
  for (const key of KEY_SIGNATURES) {
    const root = key.replace('m', '').toLowerCase()
    const tonic = (NATURALS[root[0]] + (root[1] === '#' ? 1 : root[1] === 'b' ? -1 : 0) + 12) % 12
    const profile = key.endsWith('m') ? MINOR_PROFILE : MAJOR_PROFILE
    const mean = profile.reduce((a, b) => a + b) / 12
    const norm = Math.sqrt(profile.reduce((sum, n) => sum + (n - mean) ** 2, 0))
    const score = histogram.reduce((sum, n, pc) => sum + n * (profile[(pc - tonic + 12) % 12] - mean) / norm, 0)
    if (score > bestScore) { bestScore = score; best = key }
  }
  return best
}

/** Spell diatonic tones in the chosen key, including E-sharp and C-flat. */
export function spellPitch(pitch: number, key: KeySignature = 'C'): string {
  const count = SIGNATURES[key] ?? 0
  const order = count < 0 ? ['b', 'e', 'a', 'd', 'g', 'c', 'f'] : ['f', 'c', 'g', 'd', 'a', 'e', 'b']
  const altered = new Set(order.slice(0, Math.abs(count)))
  for (const [letter, natural] of Object.entries(NATURALS)) {
    const offset = altered.has(letter) ? Math.sign(count) : 0
    if ((natural + offset + 12) % 12 === pitch % 12) return `${letter}${offset > 0 ? '#' : offset < 0 ? 'b' : ''}/${Math.floor((pitch - natural - offset) / 12) - 1}`
  }
  const names = count < 0 ? ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'] : ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
  return `${names[pitch % 12]}/${Math.floor(pitch / 12) - 1}`
}

export function requantizeNotes(notes: readonly CapturedNote[], settings: TranscriptionSettings): CapturedNote[] {
  if (settings.quantization === 'none') return notes.map((note) => ({ ...note }))
  const grid = gridTicks(settings.quantization) * 60000 / (settings.bpm * 480)
  return notes.map((note) => {
    const startMs = Math.max(0, Math.round(note.startMs / grid) * grid)
    return { ...note, startMs, endMs: startMs + Math.max(grid, Math.round((note.endMs - note.startMs) / grid) * grid), keyEndMs: undefined }
  })
}

export function suspiciousNotes(notes: readonly CapturedNote[]): Map<string, string> {
  const result = new Map<string, string>()
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs)
  sorted.forEach((note, i) => {
    if (note.endMs - note.startMs < 35) result.set(note.id, 'Very short note — check for an accidental hit.')
    else if (note.velocity < 30 && i > 0 && Math.abs(note.pitch - sorted[i - 1].pitch) > 19) result.set(note.id, 'Quiet isolated pitch — check whether this was intended.')
  })
  return result
}
