import {
  CREATE_PITCH_CLASS_PALETTES,
  type CreatePitchClassPalette,
} from '../../store/createNoteColorPalettes'
import { useAppStore } from '../../store/store'

type SamplePieceColorDefault = {
  mode: 'pitchClass'
  paletteId: CreatePitchClassPalette['id']
}

const SAMPLE_PIECE_COLOR_DEFAULTS: Readonly<Record<string, SamplePieceColorDefault>> = {
  'pirates of the caribbean.mid': {
    mode: 'pitchClass',
    paletteId: 'sunset',
  },
}

export function applySamplePieceColorDefault(fileName: string): void {
  const colorDefault = SAMPLE_PIECE_COLOR_DEFAULTS[fileName.toLowerCase()]
  if (colorDefault == null) {
    return
  }

  const palette = CREATE_PITCH_CLASS_PALETTES.find(({ id }) => id === colorDefault.paletteId)
  if (palette == null) {
    return
  }

  const store = useAppStore.getState()
  store.setCreateNoteColorMode(colorDefault.mode)
  store.setCreatePitchClassColors(palette.colors)
}
