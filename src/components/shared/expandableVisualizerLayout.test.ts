import { describe, expect, it } from 'vitest'

import { getExpandableVisualizerStyle } from './expandableVisualizerLayout'

describe('getExpandableVisualizerStyle', () => {
  it('turns positive Y alignment into extra note-field height above the keyboard', () => {
    const style = getExpandableVisualizerStyle('60%', {
      offsetX: 24,
      offsetY: 90,
      scale: 1.5,
    })

    expect(style.height).toBe('calc(60% + 60px)')
    expect(style.transform).toBe('translate3d(24px, 0px, 0) scale(1.5)')
  })

  it('retains the existing upward translation behavior for negative Y alignment', () => {
    const style = getExpandableVisualizerStyle('60%', {
      offsetX: -12,
      offsetY: -36,
      scale: 1.2,
    })

    expect(style.height).toBe('60%')
    expect(style.transform).toBe('translate3d(-12px, -36px, 0) scale(1.2)')
  })
})
