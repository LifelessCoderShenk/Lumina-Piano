import { describe, expect, it } from 'vitest'
import { getKeyAtCanvasPoint, pitchToKeyX, getBlackKeyWidth } from './pianoMath'
import { getNoteScreenRect } from './noteMotion'
import { buildTempoMap } from '../tempo/tempoMap'

import {
  HAND_KEYBOARD_ASPECT_RATIO,
  getKeyboardLayoutMetrics,
  normalizeRenderLayoutContext,
} from './layoutConstants'

describe('Create render layout context', () => {
  it.each([[1920, 1080], [1080, 1920], [3840, 2160]])('keeps hand contact geometry proportional at %i × %i', (width, height) => {
    const context = normalizeRenderLayoutContext({
      keyboardAspectRatio: HAND_KEYBOARD_ASPECT_RATIO,
      keyboardBottomInsetRatio: 0.12,
    })
    const metrics = getKeyboardLayoutMetrics(height, context, width)
    expect(metrics.keyboardHeight).toBe(Math.round(width / HAND_KEYBOARD_ASPECT_RATIO))
    expect(metrics.keyboardY + metrics.keyboardHeight).toBe(height - Math.round(height * .12))
    // A black-key contact at 90 mm lies on the key's upper 60%, not the white key below.
    const blackContactY = metrics.keyboardY + metrics.keyboardHeight - .09 * width / 1.222
    expect(blackContactY).toBeLessThan(metrics.keyboardY + metrics.keyboardHeight * .6)
    const blackX = pitchToKeyX(61, width) + getBlackKeyWidth(width) / 2
    expect(getKeyAtCanvasPoint(blackX, blackContactY, width, height, context)).toBe(61)
    expect(getKeyAtCanvasPoint(blackX, height - 1, width, height, context)).toBeNull()
    const rect = getNoteScreenRect({ id: 'contact', pitch: 61, velocity: 100, startTick: 480, endTick: 960, visualEndTick: 960 }, {
      canvasWidth: width, canvasHeight: height, currentTick: 480, currentSeconds: .5, worldZoom: 1,
      tempoMap: buildTempoMap([{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }], 480), layoutContext: context,
    })!
    expect(rect.y + rect.h).toBeCloseTo(metrics.keyboardY)
  })
  it('reserves wrist space without stretching keys and preserves it during export', () => {
    const context = {keyboardHeightRatio:0.22,keyboardBottomInsetRatio:0.12,preserveKeyboardHeightRatio:true}
    const normal = getKeyboardLayoutMetrics(1080,{...context,keyboardBottomInsetRatio:0})
    const hands = getKeyboardLayoutMetrics(1080,context)
    expect(hands.keyboardHeight).toBe(normal.keyboardHeight)
    expect(normal.keyboardY-hands.keyboardY).toBe(130)
    expect(getKeyboardLayoutMetrics(2160,context).keyboardY).toBe(1426)
  })
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
