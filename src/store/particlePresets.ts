import type { ParticleSettings } from './types'

export type ParticlePresetName = 'prism' | 'aurora' | 'sunset' | 'ocean' | 'neon' | 'wisp' | 'rays'

export interface ParticlePreset {
  id: ParticlePresetName
  label: string
  settings: ParticleSettings
}

export const PARTICLE_PRESETS: readonly ParticlePreset[] = [
  {
    id: 'prism',
    label: 'Prism',
    settings: {
      colorMode: 'note',
      customColor: '#7ec8ff',
      density: 100,
      enabled: true,
      style: 'spark',
      glow: 100,
      lifetime: 100,
      size: 100,
      speed: 100,
      spread: 100,
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    settings: {
      colorMode: 'note',
      customColor: '#7ec8ff',
      density: 50,
      enabled: true,
      style: 'spark',
      glow: 135,
      lifetime: 200,
      size: 155,
      speed: 55,
      spread: 190,
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    settings: {
      colorMode: 'note',
      customColor: '#ff8b62',
      density: 135,
      enabled: true,
      style: 'spark',
      glow: 155,
      lifetime: 120,
      size: 125,
      speed: 115,
      spread: 130,
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    settings: {
      colorMode: 'note',
      customColor: '#5ce5ff',
      density: 80,
      enabled: true,
      style: 'spark',
      glow: 90,
      lifetime: 190,
      size: 80,
      speed: 75,
      spread: 200,
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    settings: {
      colorMode: 'note',
      customColor: '#ff4fd8',
      density: 200,
      enabled: true,
      style: 'spark',
      glow: 200,
      lifetime: 50,
      size: 65,
      speed: 200,
      spread: 35,
    },
  },
  {
    id: 'wisp',
    label: 'Wisp',
    settings: {
      colorMode: 'note',
      customColor: '#8ee7ff',
      density: 40,
      enabled: true,
      style: 'wisp',
      glow: 170,
      lifetime: 200,
      size: 65,
      speed: 190,
      spread: 160,
    },
  },
  {
    id: 'rays',
    label: 'Rays',
    settings: {
      colorMode: 'note',
      customColor: '#cfa1ff',
      density: 65,
      enabled: true,
      style: 'ray',
      glow: 190,
      lifetime: 80,
      size: 150,
      speed: 145,
      spread: 55,
    },
  },
]

export function getParticlePreset(name: ParticlePresetName): ParticlePreset {
  const preset = PARTICLE_PRESETS.find((candidate) => candidate.id === name)
  if (preset == null) {
    throw new Error(`Unknown particle preset: ${name}`)
  }

  return preset
}

export function findParticlePreset(settings: ParticleSettings): ParticlePreset | null {
  return PARTICLE_PRESETS.find((preset) => particleSettingsMatch(preset.settings, settings)) ?? null
}

function particleSettingsMatch(left: ParticleSettings, right: ParticleSettings): boolean {
  return (
    left.enabled === right.enabled &&
    left.style === right.style &&
    left.colorMode === right.colorMode &&
    left.customColor.toLowerCase() === right.customColor.toLowerCase() &&
    left.density === right.density &&
    left.size === right.size &&
    left.speed === right.speed &&
    left.spread === right.spread &&
    left.lifetime === right.lifetime &&
    left.glow === right.glow
  )
}
