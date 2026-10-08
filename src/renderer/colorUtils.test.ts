import { describe, expect, it } from 'vitest'

import type { CreateNoteColors } from '../store/types'
import { TUTORIAL_CREATE_PRESET } from '../store/createNoteColorPalettes'
import { resolveCreateModeNoteColor } from './colorUtils'

const gradientColors: CreateNoteColors = {
  mode: 'gradient',
  pitchClassColors: {},
  singleColor: '#000000',
}

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

describe('Create Mode gradient color', () => {
  it('maps low, middle, and high keyboard positions from red through green to violet', () => {
    const low = channels(resolveCreateModeNoteColor(21, gradientColors, 0))
    const middle = channels(resolveCreateModeNoteColor(64, gradientColors, 0.5))
    const high = channels(resolveCreateModeNoteColor(108, gradientColors, 1))

    expect(low[0]).toBeGreaterThan(low[1])
    expect(low[0]).toBeGreaterThan(low[2])
    expect(middle[1]).toBeGreaterThan(middle[0])
    expect(middle[1]).toBeGreaterThan(middle[2])
    expect(high[2]).toBeGreaterThan(high[0])
    expect(high[0]).toBeGreaterThan(high[1])
  })

  it('uses muted blue below C4 and green from C4 onward for Tutorial mode', () => {
    const tutorialColors: CreateNoteColors = {
      mode: 'tutorial',
      pitchClassColors: {},
      singleColor: '#000000',
    }

    expect(resolveCreateModeNoteColor(59, tutorialColors)).toBe(
      Number.parseInt(TUTORIAL_CREATE_PRESET.lowerRegisterColor.slice(1), 16),
    )
    expect(resolveCreateModeNoteColor(60, tutorialColors)).toBe(
      Number.parseInt(TUTORIAL_CREATE_PRESET.upperRegisterColor.slice(1), 16),
    )
  })

  it('maps performance velocity from the soft color to the strong color', () => {
    const velocityColors: CreateNoteColors = {
      mode: 'velocity',
      pitchClassColors: {},
      singleColor: '#000000',
      velocityLowColor: '#102030',
      velocityHighColor: '#f0e0d0',
    }

    expect(resolveCreateModeNoteColor(60, velocityColors, 0.5, 0)).toBe(0x102030)
    expect(resolveCreateModeNoteColor(60, velocityColors, 0.5, 127)).toBe(0xf0e0d0)
    expect(resolveCreateModeNoteColor(60, velocityColors, 0.5, 64)).not.toBe(0x102030)
    expect(resolveCreateModeNoteColor(60, velocityColors, 0.5, 64)).not.toBe(0xf0e0d0)
  })

  it('cycles Flow colors deterministically with musical time while separating pitches', () => {
    const dynamicColors: CreateNoteColors = {
      mode: 'dynamic',
      pitchClassColors: {},
      singleColor: '#000000',
    }

    const opening = resolveCreateModeNoteColor(60, dynamicColors, 0.5, 80, 0)
    const later = resolveCreateModeNoteColor(60, dynamicColors, 0.5, 80, 0.5)
    const higherPitch = resolveCreateModeNoteColor(84, dynamicColors, 0.8, 80, 0)

    expect(later).not.toBe(opening)
    expect(higherPitch).not.toBe(opening)
    expect(resolveCreateModeNoteColor(60, dynamicColors, 0.5, 80, 1)).toBe(opening)
  })

  it('assigns stable Random colors per note seed', () => {
    const randomColors: CreateNoteColors = {
      mode: 'random',
      pitchClassColors: {},
      singleColor: '#000000',
    }

    const first = resolveCreateModeNoteColor(60, randomColors, 0.5, 80, 0.125)
    expect(resolveCreateModeNoteColor(60, randomColors, 0.5, 80, 0.125)).toBe(first)
    expect(resolveCreateModeNoteColor(61, randomColors, 0.5, 80, 0.125)).not.toBe(first)
    expect(resolveCreateModeNoteColor(60, randomColors, 0.5, 80, 0.25)).not.toBe(first)
  })
})
