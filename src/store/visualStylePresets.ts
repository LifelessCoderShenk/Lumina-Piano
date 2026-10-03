import {
  createCreateNoteColorDefaults,
  createParticleSettingsDefaults,
  createVisualizerSettingsDefaults,
  handVisualizationInitial,
} from './defaults'
import { CREATE_PITCH_CLASS_PALETTES } from './createNoteColorPalettes'
import type { AppState, CreateNoteColors, HandVisualizationSettings, ParticleSettings, VisualizerSettingsSlice } from './types'

export const VISUAL_STYLE_PRESETS_STORAGE_KEY = 'lumina.visual-style-presets.v1'

type AppearanceSettings = Pick<
  VisualizerSettingsSlice,
  | 'backgroundColor' | 'backgroundStyle' | 'colorMode' | 'fallSpeed' | 'gradientBottomColorLeft' | 'gradientBottomColorLeftBlack'
  | 'gradientBottomColorRight' | 'gradientBottomColorRightBlack' | 'gradientTopColor' | 'laneOpacity'
  | 'keyboardSaber' | 'leftHandColor' | 'lightingIntensity' | 'noteGradientDirection' | 'noteLabelColor' | 'noteLabelFormat'
  | 'noteGlow' | 'noteLabelSize' | 'noteLabelsOnKeys' | 'noteLabelsOnNotes' | 'noteOpacity' | 'noteStyle' | 'noteWidth' | 'pitchClassColors'
  | 'rightHandColor' | 'scoreOverlayOpacity' | 'scoreOverlaySize' | 'splitPitch' | 'velocityHighColor' | 'velocityLowColor'
>

export interface VisualStyle {
  appearance: AppearanceSettings
  createNoteColors: CreateNoteColors
  handVisualization?: HandVisualizationSettings
  particleSettings: ParticleSettings
}

export interface VisualStylePreset {
  id: string
  name: string
  createdAt: number
  style: VisualStyle
}

const APPEARANCE_KEYS: readonly (keyof AppearanceSettings)[] = [
  'backgroundColor', 'backgroundStyle', 'colorMode', 'fallSpeed', 'gradientBottomColorLeft', 'gradientBottomColorLeftBlack',
  'gradientBottomColorRight', 'gradientBottomColorRightBlack', 'gradientTopColor', 'laneOpacity',
  'keyboardSaber', 'leftHandColor', 'lightingIntensity', 'noteGradientDirection', 'noteLabelColor', 'noteLabelFormat', 'noteLabelSize',
  'noteGlow', 'noteLabelsOnKeys', 'noteLabelsOnNotes', 'noteOpacity', 'noteStyle', 'noteWidth', 'pitchClassColors', 'rightHandColor',
  'scoreOverlayOpacity', 'scoreOverlaySize', 'splitPitch', 'velocityHighColor', 'velocityLowColor',
]

const auroraPitchClassColors = CREATE_PITCH_CLASS_PALETTES.find(({ id }) => id === 'aurora')!.colors

export const BUILT_IN_VISUAL_STYLE_PRESETS: readonly VisualStylePreset[] = [
  createBuiltInVisualStylePreset('builtin-clean-studio', 'Clean Studio', {
    appearance: {
      backgroundColor: '#05070d',
      backgroundStyle: 'studio',
      lightingIntensity: 65,
      noteGlow: 85,
      noteLabelsOnNotes: false,
    },
    createNoteColors: {
      singleColor: '#6ebcff',
    },
    particleSettings: {
      enabled: false,
    },
  }),
  createBuiltInVisualStylePreset('builtin-concert-gem', 'Concert Gem', {
    appearance: {
      backgroundColor: '#08060d',
      backgroundStyle: 'stage',
      keyboardSaber: true,
      lightingIntensity: 145,
      noteGlow: 125,
      noteLabelsOnNotes: false,
      noteStyle: 'gem',
    },
    createNoteColors: {
      mode: 'gradient',
      singleColor: '#c69cff',
    },
    particleSettings: {
      density: 65,
      glow: 170,
      lifetime: 90,
      size: 125,
      speed: 135,
      spread: 60,
      style: 'ray',
    },
  }),
  createBuiltInVisualStylePreset('builtin-aurora-glass', 'Aurora Glass', {
    appearance: {
      backgroundColor: '#040612',
      backgroundStyle: 'aurora',
      lightingIntensity: 125,
      noteGlow: 135,
      noteLabelsOnNotes: false,
      noteStyle: 'crystal',
    },
    createNoteColors: {
      mode: 'pitchClass',
      pitchClassColors: auroraPitchClassColors,
    },
    particleSettings: {
      density: 40,
      glow: 170,
      lifetime: 200,
      size: 65,
      speed: 190,
      spread: 160,
      style: 'wisp',
    },
  }),
]

export function captureVisualStyle(state: AppState): VisualStyle {
  const appearance = {} as AppearanceSettings
  for (const key of APPEARANCE_KEYS) {
    (appearance as Record<string, unknown>)[key] = structuredClone(state[key])
  }
  return {
    appearance,
    createNoteColors: structuredClone(state.createNoteColors),
    handVisualization: structuredClone(state.handVisualization),
    particleSettings: structuredClone(state.particleSettings),
  }
}

export function applyVisualStyle(state: AppState, style: VisualStyle): void {
  Object.assign(state, structuredClone(style.appearance))
  state.backgroundStyle = style.appearance.backgroundStyle ?? 'flat'
  state.fallSpeed = style.appearance.fallSpeed ?? 100
  state.keyboardSaber = style.appearance.keyboardSaber ?? false
  state.lightingIntensity = style.appearance.lightingIntensity ?? 100
  state.noteGlow = style.appearance.noteGlow ?? 100
  state.noteOpacity = style.appearance.noteOpacity ?? 100
  state.noteWidth = style.appearance.noteWidth ?? 100
  state.scoreOverlayOpacity = style.appearance.scoreOverlayOpacity ?? 100
  state.scoreOverlaySize = style.appearance.scoreOverlaySize ?? 'standard'
  state.createNoteColors = structuredClone(style.createNoteColors)
  state.handVisualization = structuredClone(style.handVisualization ?? handVisualizationInitial)
  state.particleSettings = {
    ...structuredClone(style.particleSettings),
    colorMode: style.particleSettings.colorMode ?? 'note',
    customColor: style.particleSettings.customColor ?? '#7ec8ff',
    style: style.particleSettings.style ?? 'spark',
  }
}

export function loadVisualStylePresets(storage: Pick<Storage, 'getItem'> = window.localStorage): VisualStylePreset[] {
  try {
    const text = storage.getItem(VISUAL_STYLE_PRESETS_STORAGE_KEY)
    if (text == null) return []
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? value.filter(isVisualStylePreset) : []
  } catch {
    return []
  }
}

export function storeVisualStylePresets(
  presets: readonly VisualStylePreset[],
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  storage.setItem(VISUAL_STYLE_PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

export function createVisualStylePreset(name: string, state: AppState): VisualStylePreset {
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (cleanName.length === 0) throw new Error('Enter a style name.')
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `style-${Date.now()}`,
    name: cleanName,
    createdAt: Date.now(),
    style: captureVisualStyle(state),
  }
}

export function visualStyleMatches(left: VisualStyle, right: VisualStyle): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createBuiltInVisualStylePreset(
  id: string,
  name: string,
  patch: {
    appearance?: Partial<AppearanceSettings>
    createNoteColors?: Partial<CreateNoteColors>
    particleSettings?: Partial<ParticleSettings>
  },
): VisualStylePreset {
  const completeAppearance = { ...createVisualizerSettingsDefaults(), ...patch.appearance }
  const appearance = {} as AppearanceSettings
  for (const key of APPEARANCE_KEYS) {
    (appearance as Record<string, unknown>)[key] = structuredClone(completeAppearance[key])
  }

  return {
    createdAt: 0,
    id,
    name,
    style: {
      appearance,
      createNoteColors: {
        ...createCreateNoteColorDefaults(),
        ...structuredClone(patch.createNoteColors ?? {}),
      },
      handVisualization: structuredClone(handVisualizationInitial),
      particleSettings: {
        ...createParticleSettingsDefaults(),
        ...patch.particleSettings,
      },
    },
  }
}

function isVisualStylePreset(value: unknown): value is VisualStylePreset {
  if (value == null || typeof value !== 'object') return false
  const preset = value as Partial<VisualStylePreset>
  return typeof preset.id === 'string' && typeof preset.name === 'string'
    && Number.isFinite(preset.createdAt) && preset.style != null
    && typeof preset.style === 'object' && preset.style.appearance != null
    && preset.style.createNoteColors != null && preset.style.particleSettings != null
}
