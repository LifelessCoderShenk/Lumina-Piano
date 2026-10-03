import { describe, expect, it } from 'vitest'

import { buildTempoMap } from '../tempo/tempoMap'
import { getNoteScreenRect } from './noteMotion'

describe('note motion width scaling', () => {
  it('centers narrower and wider notes without changing their timing geometry', () => {
    const tempoMap = buildTempoMap([
      { bpm: 120, microsecondsPerBeat: 500_000, tick: 0 },
    ], 480)
    const note = {
      endTick: 960,
      id: 'middle-c',
      pitch: 60,
      startTick: 480,
      velocity: 100,
      visualEndTick: 960,
    }
    const options = {
      canvasHeight: 720,
      canvasWidth: 1_280,
      currentSeconds: 0,
      currentTick: 0,
      tempoMap,
      worldZoom: 1,
    }

    const narrow = getNoteScreenRect(note, { ...options, noteWidthScale: 0.6 })!
    const wide = getNoteScreenRect(note, { ...options, noteWidthScale: 1.2 })!

    expect(wide.w).toBeCloseTo(narrow.w * 2)
    expect(wide.x + (wide.w / 2)).toBeCloseTo(narrow.x + (narrow.w / 2))
    expect(wide.y).toBeCloseTo(narrow.y)
    expect(wide.h).toBeCloseTo(narrow.h)
  })
})
