import { describe, expect, it } from 'vitest'

import { PARTICLE_PRESETS, findParticlePreset } from './particlePresets'

describe('particle presets', () => {
  it('keeps every preset within the particle control ranges', () => {
    for (const { settings } of PARTICLE_PRESETS) {
      expect(settings.enabled).toBe(true)
      expect(['spark', 'wisp', 'ray']).toContain(settings.style)
      expect(settings.density).toBeGreaterThanOrEqual(25)
      expect(settings.density).toBeLessThanOrEqual(200)
      expect(settings.size).toBeGreaterThanOrEqual(50)
      expect(settings.size).toBeLessThanOrEqual(200)
      expect(settings.speed).toBeGreaterThanOrEqual(50)
      expect(settings.speed).toBeLessThanOrEqual(200)
      expect(settings.spread).toBeGreaterThanOrEqual(0)
      expect(settings.spread).toBeLessThanOrEqual(200)
      expect(settings.lifetime).toBeGreaterThanOrEqual(50)
      expect(settings.lifetime).toBeLessThanOrEqual(200)
      expect(settings.glow).toBeGreaterThanOrEqual(50)
      expect(settings.glow).toBeLessThanOrEqual(200)
    }
  })

  it('recognizes exact presets and reports edited settings as Custom', () => {
    const preset = PARTICLE_PRESETS.find(({ id }) => id === 'aurora')!

    expect(findParticlePreset(preset.settings)?.id).toBe('aurora')
    expect(findParticlePreset({ ...preset.settings, speed: preset.settings.speed + 1 })).toBeNull()
  })

  it('keeps presets meaningfully separated so each has a distinct motion profile', () => {
    const controls = ['density', 'size', 'speed', 'spread', 'lifetime', 'glow'] as const

    for (let leftIndex = 0; leftIndex < PARTICLE_PRESETS.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < PARTICLE_PRESETS.length; rightIndex += 1) {
        const left = PARTICLE_PRESETS[leftIndex]
        const right = PARTICLE_PRESETS[rightIndex]
        const clearlyDifferentControls = controls.filter(
          (control) => Math.abs(left.settings[control] - right.settings[control]) >= 20,
        )

        expect(
          clearlyDifferentControls.length,
          `${left.label} and ${right.label} should differ on at least three visible controls`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('includes Wisp as a full preset rather than a partial visual override', () => {
    const wisp = PARTICLE_PRESETS.find(({ id }) => id === 'wisp')!

    expect(wisp.settings).toEqual({
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
    })
    expect(findParticlePreset(wisp.settings)?.id).toBe('wisp')
  })
})
