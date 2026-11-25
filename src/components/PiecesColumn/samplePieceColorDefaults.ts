import { CREATE_PITCH_CLASS_PALETTES } from '../../store/createNoteColorPalettes'
import {
  createCreateNoteColorDefaults,
  createParticleSettingsDefaults,
  createVisualizerSettingsDefaults,
  handVisualizationInitial,
} from '../../store/defaults'
import { useAppStore } from '../../store/store'

const DEMO_FILES = new Set([
  'etude-in-c-minor-opus-10-nr-12.mid',
  'pirates of the caribbean.mid',
])

/** Load a complete demo appearance, never a partial patch over the user's preset. */
export function applySamplePieceVisualDefaults(fileName: string): void {
  const name = fileName.toLowerCase()
  if (!DEMO_FILES.has(name)) return

  const colors = createCreateNoteColorDefaults()
  if (name === 'pirates of the caribbean.mid') {
    const sunset = CREATE_PITCH_CLASS_PALETTES.find(({ id }) => id === 'sunset')!
    colors.mode = 'pitchClass'
    colors.pitchClassColors = { ...sunset.colors }
  }

  useAppStore.getState().batchUpdate((state) => {
    Object.assign(state, createVisualizerSettingsDefaults())
    state.createNoteColors = colors
    state.particleSettings = createParticleSettingsDefaults()
    state.handVisualization = structuredClone(handVisualizationInitial)
  })
}
