import { describe, expect, it } from 'vitest'

import {
  PIANO_MAX_PITCH,
  PIANO_MIN_PITCH,
  getBlackKeyWidth,
  getKeyAtScreenX,
  getWhiteKeyIndex,
  getWhiteKeyWidth,
  isBlackKey,
  pitchToKeyX,
} from './pianoMath'

const CANVAS_WIDTH = 1920

describe('isBlackKey', () => {
  it('classifies named pitches correctly', () => {
    expect(isBlackKey(60)).toBe(false)
    expect(isBlackKey(61)).toBe(true)
    expect(isBlackKey(62)).toBe(false)
    expect(isBlackKey(63)).toBe(true)
    expect(isBlackKey(64)).toBe(false)
    expect(isBlackKey(65)).toBe(false)
    expect(isBlackKey(66)).toBe(true)
  })

  it('classifies the full keyboard correctly', () => {
    const blackPitchClasses = new Set([1, 3, 6, 8, 10])

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      expect(isBlackKey(pitch)).toBe(blackPitchClasses.has(((pitch % 12) + 12) % 12))
    }
  })
})

describe('getWhiteKeyIndex', () => {
  it('returns the expected indices for key reference pitches', () => {
    expect(getWhiteKeyIndex(21)).toBe(0)
    expect(getWhiteKeyIndex(23)).toBe(1)
    expect(getWhiteKeyIndex(24)).toBe(2)
    expect(getWhiteKeyIndex(108)).toBe(51)
  })

  it('assigns sequential indices to white keys', () => {
    let expectedIndex = 0

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) {
        expect(getWhiteKeyIndex(pitch)).toBe(expectedIndex)
        expectedIndex += 1
      }
    }

    expect(expectedIndex).toBe(52)
  })

  it('returns the white key to the left for black keys', () => {
    expect(getWhiteKeyIndex(22)).toBe(0)
    expect(getWhiteKeyIndex(25)).toBe(2)
    expect(getWhiteKeyIndex(27)).toBe(3)
    expect(getWhiteKeyIndex(30)).toBe(5)
  })
})

describe('pitchToKeyX', () => {
  it('maps the full white key range to the canvas width', () => {
    const whiteKeyWidth = getWhiteKeyWidth(CANVAS_WIDTH)

    expect(pitchToKeyX(21, CANVAS_WIDTH)).toBe(0)
    expect(pitchToKeyX(108, CANVAS_WIDTH)).toBeCloseTo(CANVAS_WIDTH - whiteKeyWidth, 10)
  })

  it('centers black keys between neighboring white keys', () => {
    const blackKeyWidth = getBlackKeyWidth(CANVAS_WIDTH)
    const leftWhiteX = pitchToKeyX(24, CANVAS_WIDTH)
    const rightWhiteX = pitchToKeyX(26, CANVAS_WIDTH)
    const blackX = pitchToKeyX(25, CANVAS_WIDTH)

    expect(blackX).toBeGreaterThan(leftWhiteX)
    expect(blackX + blackKeyWidth).toBeLessThan(rightWhiteX + getWhiteKeyWidth(CANVAS_WIDTH))
    expect((blackX + (blackKeyWidth / 2))).toBeCloseTo(rightWhiteX, 10)
  })

  it('keeps white keys non-overlapping and sequential', () => {
    const whiteKeyWidth = getWhiteKeyWidth(CANVAS_WIDTH)
    const whitePitches: number[] = []

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) {
        whitePitches.push(pitch)
      }
    }

    for (let index = 0; index < whitePitches.length - 1; index += 1) {
      const currentX = pitchToKeyX(whitePitches[index], CANVAS_WIDTH)
      const nextX = pitchToKeyX(whitePitches[index + 1], CANVAS_WIDTH)

      expect(nextX).toBeGreaterThan(currentX)
      expect(currentX + whiteKeyWidth).toBeCloseTo(nextX, 10)
    }
  })
})

describe('getKeyAtScreenX', () => {
  it('handles screen edges and out-of-range values', () => {
    expect(getKeyAtScreenX(0, CANVAS_WIDTH)).toBe(21)
    expect(getKeyAtScreenX(CANVAS_WIDTH - 1, CANVAS_WIDTH)).toBe(108)
    expect(getKeyAtScreenX(-1, CANVAS_WIDTH)).toBeNull()
    expect(getKeyAtScreenX(CANVAS_WIDTH + 1, CANVAS_WIDTH)).toBeNull()
  })

  it('returns the correct white key from its center point', () => {
    const whiteKeyWidth = getWhiteKeyWidth(CANVAS_WIDTH)
    const middleOfC1 = pitchToKeyX(24, CANVAS_WIDTH) + (whiteKeyWidth / 2)

    expect(getKeyAtScreenX(middleOfC1, CANVAS_WIDTH)).toBe(24)
  })

  it('prioritizes black keys over overlapping white keys', () => {
    const blackKeyWidth = getBlackKeyWidth(CANVAS_WIDTH)
    const middleOfASharp0 = pitchToKeyX(22, CANVAS_WIDTH) + (blackKeyWidth / 2)

    expect(getKeyAtScreenX(middleOfASharp0, CANVAS_WIDTH)).toBe(22)
  })
})
