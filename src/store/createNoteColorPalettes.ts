export interface CreatePitchClassPalette {
  id: 'prism' | 'aurora' | 'sunset' | 'ocean' | 'neon'
  label: string
  colors: Record<number, string>
}

export const DEFAULT_VISUALIZER_BACKGROUND_COLOR = '#000000'

/** A fixed learning-view treatment for the Tutorial color mode. */
export const TUTORIAL_CREATE_PRESET = {
  backgroundColor: '#303030',
  lowerRegisterColor: '#77a3ca',
  splitPitch: 60,
  upperRegisterColor: '#9ee65a',
} as const

export const CREATE_PITCH_CLASS_PALETTES: readonly CreatePitchClassPalette[] = [
  {
    id: 'prism',
    label: 'Prism',
    colors: {
      0: '#f74f4f',
      1: '#f7674f',
      2: '#f7a44f',
      3: '#f7d44f',
      4: '#a4f74f',
      5: '#4ff77a',
      6: '#4ff7a0',
      7: '#4ff7f0',
      8: '#4fa4f7',
      9: '#4f8ef7',
      10: '#7a4ff7',
      11: '#f74ff0',
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    colors: {
      0: '#4ff7df',
      1: '#4ff7c1',
      2: '#4ff7a0',
      3: '#4ff7bf',
      4: '#4fe6f7',
      5: '#4fa4f7',
      6: '#4f75f7',
      7: '#6b4ff7',
      8: '#8e4ff7',
      9: '#b14ff7',
      10: '#cf4ff7',
      11: '#9d4ff7',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    colors: {
      0: '#f74fb1',
      1: '#f74f8e',
      2: '#f74f70',
      3: '#f7674f',
      4: '#f7834f',
      5: '#f7a44f',
      6: '#f7c74f',
      7: '#f7d44f',
      8: '#f79a4f',
      9: '#f76e4f',
      10: '#f74f63',
      11: '#f74f8a',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    colors: {
      0: '#4f63f7',
      1: '#4f75f7',
      2: '#4f8ef7',
      3: '#4fa4f7',
      4: '#4fc4f7',
      5: '#4fe0f7',
      6: '#4ff7f0',
      7: '#4ff7d5',
      8: '#4ff7c1',
      9: '#4fa4f7',
      10: '#5c6ff7',
      11: '#744ff7',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    colors: {
      0: '#ff2ea6',
      1: '#ff2e78',
      2: '#ff3d2e',
      3: '#ff772e',
      4: '#ffd12e',
      5: '#83ff2e',
      6: '#2effbc',
      7: '#2ee4ff',
      8: '#2e8dff',
      9: '#5a2eff',
      10: '#b12eff',
      11: '#f42eff',
    },
  },
]

export const DEFAULT_CREATE_PITCH_CLASS_COLORS = CREATE_PITCH_CLASS_PALETTES[0].colors

export function findCreatePitchClassPalette(
  colors: Record<number, string>,
): CreatePitchClassPalette | null {
  return CREATE_PITCH_CLASS_PALETTES.find((palette) => (
    Array.from({ length: 12 }, (_, pitchClass) => pitchClass).every(
      (pitchClass) => palette.colors[pitchClass].toLowerCase() === colors[pitchClass]?.toLowerCase(),
    )
  )) ?? null
}
