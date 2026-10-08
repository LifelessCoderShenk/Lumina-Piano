import { describe, expect, it } from 'vitest'

import {
  DEFAULT_KEYBOARD_HEIGHT_RATIO,
  getKeyboardLayoutMetrics,
  normalizeRenderLayoutContext,
} from './layoutConstants'

describe('Create render layout context', () => {
  it.each([
    [720, 270],
    [1080, 270],
    [2160, 270],
  ])('keeps the live keyboard at its compact height at %ip', (height, keyboardHeight) => {
    const metrics = getKeyboardLayoutMetrics(height)

    expect(metrics.keyboardHeight).toBe(keyboardHeight)
  })

  it('uses a snapped live layout context for any export resolution', () => {
    const context = normalizeRenderLayoutContext({
      keyboardHeightRatio: 0.42,
      preserveKeyboardHeightRatio: true,
    })

    expect(getKeyboardLayoutMetrics(720, context).keyboardHeight).toBe(302)
    expect(getKeyboardLayoutMetrics(1080, context).keyboardHeight).toBe(454)
    expect(getKeyboardLayoutMetrics(2160, context).keyboardHeight).toBe(907)
  })

  it('normalizes the Camera/Record note-field travel duration', () => {
    expect(normalizeRenderLayoutContext({ noteFieldTravelSeconds: 3 }).noteFieldTravelSeconds).toBe(3)
    expect(normalizeRenderLayoutContext({ noteFieldTravelSeconds: 0 }).noteFieldTravelSeconds).toBe(0.25)
    expect(normalizeRenderLayoutContext({ noteFieldTravelSeconds: 99 }).noteFieldTravelSeconds).toBe(20)
  })
})
