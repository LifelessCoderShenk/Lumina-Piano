import { describe, expect, it } from 'vitest'

import type { TempoEvent } from '../midi/types'
import {
  buildTempoMap,
  secondsToTick,
  tickToSeconds,
  ticksToBars,
  ticksToBeats,
  TempoMapError,
} from './tempoMap'

describe('buildTempoMap', () => {
  it('builds a single segment tempo map ending at Infinity', () => {
    const tempoMap = buildTempoMap([tempoEvent(0, 500_000)], 480)

    expect(tempoMap.segments).toHaveLength(1)
    expect(tempoMap.segments[0]).toMatchObject({
      bpm: 120,
      endTick: Number.POSITIVE_INFINITY,
      microsecondsPerBeat: 500_000,
      startSeconds: 0,
      startTick: 0,
      ticksPerSecond: 960,
    })
  })

  it('builds correctly segmented multi-tempo maps', () => {
    const tempoMap = buildTempoMap(
      [tempoEvent(0, 500_000), tempoEvent(480, 1_000_000), tempoEvent(960, 400_000)],
      480,
    )

    expect(tempoMap.segments).toHaveLength(3)
    expect(tempoMap.segments[0]).toMatchObject({
      startTick: 0,
      endTick: 480,
      startSeconds: 0,
    })
    expect(tempoMap.segments[1]).toMatchObject({
      startTick: 480,
      endTick: 960,
      startSeconds: 0.5,
    })
    expect(tempoMap.segments[2]).toMatchObject({
      startTick: 960,
      endTick: Number.POSITIVE_INFINITY,
      startSeconds: 1.5,
    })
  })

  it('sorts unsorted input and keeps the last event for shared ticks', () => {
    const tempoMap = buildTempoMap(
      [
        tempoEvent(960, 400_000),
        tempoEvent(0, 500_000),
        tempoEvent(480, 1_000_000),
        tempoEvent(480, 750_000),
      ],
      480,
    )

    expect(tempoMap.segments).toHaveLength(3)
    expect(tempoMap.segments.map((segment) => segment.startTick)).toEqual([0, 480, 960])
    expect(tempoMap.segments[1].microsecondsPerBeat).toBe(750_000)
    expect(tempoMap.segments[1].bpm).toBe(80)
  })

  it('throws EMPTY_TEMPO_MAP for empty input', () => {
    expectTempoMapError(() => buildTempoMap([], 480), 'EMPTY_TEMPO_MAP')
  })

  it('throws INVALID_PPQ for non-positive PPQ', () => {
    expectTempoMapError(() => buildTempoMap([tempoEvent(0, 500_000)], 0), 'INVALID_PPQ')
    expectTempoMapError(() => buildTempoMap([tempoEvent(0, 500_000)], -120), 'INVALID_PPQ')
  })
})

describe('tickToSeconds with a single tempo', () => {
  const tempoMap = buildTempoMap([tempoEvent(0, 500_000)], 480)
  const slowTempoMap = buildTempoMap([tempoEvent(0, 1_000_000)], 480)

  it('returns 0 at tick 0', () => {
    expect(tickToSeconds(0, tempoMap)).toBe(0)
  })

  it('converts one quarter note at 120 BPM to 0.5 seconds', () => {
    expect(tickToSeconds(480, tempoMap)).toBe(0.5)
  })

  it('converts two quarter notes at 120 BPM to 1.0 seconds', () => {
    expect(tickToSeconds(960, tempoMap)).toBe(1)
  })

  it('converts one quarter note at 60 BPM to 1.0 seconds', () => {
    expect(tickToSeconds(480, slowTempoMap)).toBe(1)
  })
})

describe('tickToSeconds with multiple tempos', () => {
  const tempoMap = buildTempoMap(
    [tempoEvent(0, 500_000), tempoEvent(480, 1_000_000), tempoEvent(960, 400_000)],
    480,
  )

  it('handles cross-segment timing correctly', () => {
    expect(tickToSeconds(240, tempoMap)).toBe(0.25)
    expect(tickToSeconds(720, tempoMap)).toBe(1)
    expect(tickToSeconds(1_200, tempoMap)).toBeCloseTo(1.7, 10)
  })

  it('handles exact segment boundaries correctly', () => {
    expect(tickToSeconds(480, tempoMap)).toBe(0.5)
    expect(tickToSeconds(960, tempoMap)).toBe(1.5)
  })

  it('extrapolates beyond the last segment without clamping', () => {
    expect(tickToSeconds(10_000_000, tempoMap)).toBeCloseTo(8_334.033333333333, 9)
  })
})

describe('secondsToTick', () => {
  const tempoMap = buildTempoMap(
    [tempoEvent(0, 500_000), tempoEvent(480, 1_000_000), tempoEvent(960, 400_000)],
    480,
  )

  it('is correct within each segment', () => {
    expect(secondsToTick(0.25, tempoMap)).toBe(240)
    expect(secondsToTick(1, tempoMap)).toBe(720)
    expect(secondsToTick(1.7, tempoMap)).toBe(1_200)
  })

  it('floors fractional tick results', () => {
    expect(secondsToTick(0.501, tempoMap)).toBe(480)
  })

  it('handles exact boundaries correctly', () => {
    expect(secondsToTick(0.5, tempoMap)).toBe(480)
    expect(secondsToTick(1.5, tempoMap)).toBe(960)
  })

  it('stays stable for tick -> seconds -> tick round trips within one tick', () => {
    const randomTicks = generateRandomIntegers(50, 0, 100_000)

    for (const tick of randomTicks) {
      const seconds = tickToSeconds(tick, tempoMap)
      const roundTrippedTick = secondsToTick(seconds, tempoMap)
      expect(Math.abs(roundTrippedTick - tick)).toBeLessThanOrEqual(1)
    }
  })

  it('stays stable for seconds -> tick -> seconds round trips within 2ms', () => {
    const randomSeconds = generateRandomFloats(50, 0, 120)

    for (const seconds of randomSeconds) {
      const tick = secondsToTick(seconds, tempoMap)
      const roundTrippedSeconds = tickToSeconds(tick, tempoMap)
      expect(Math.abs(roundTrippedSeconds - seconds)).toBeLessThanOrEqual(0.002)
    }
  })
})

describe('edge cases', () => {
  const tempoMap = buildTempoMap([tempoEvent(0, 500_000)], 480)

  it('returns 0 for negative tick values', () => {
    expect(tickToSeconds(-1, tempoMap)).toBe(0)
  })

  it('returns 0 for negative seconds values', () => {
    expect(secondsToTick(-0.5, tempoMap)).toBe(0)
  })

  it('throws INVALID_INPUT for NaN and Infinity inputs', () => {
    expectTempoMapError(() => buildTempoMap([tempoEvent(Number.NaN, 500_000)], 480), 'INVALID_INPUT')
    expectTempoMapError(() => buildTempoMap([tempoEvent(0, Number.POSITIVE_INFINITY)], 480), 'INVALID_INPUT')
    expectTempoMapError(() => buildTempoMap([tempoEvent(0, 500_000)], Number.NaN), 'INVALID_INPUT')
    expectTempoMapError(() => tickToSeconds(Number.NaN, tempoMap), 'INVALID_INPUT')
    expectTempoMapError(() => secondsToTick(Number.POSITIVE_INFINITY, tempoMap), 'INVALID_INPUT')
  })

  it('supports very large tick values', () => {
    expect(tickToSeconds(10_000_000, tempoMap)).toBeCloseTo(10_416.666666666666, 9)
  })

  it('handles extreme BPM values correctly', () => {
    const fastMap = buildTempoMap([tempoEvent(0, 200_000)], 480)
    const slowMap = buildTempoMap([tempoEvent(0, 3_000_000)], 480)

    expect(tickToSeconds(480, fastMap)).toBe(0.2)
    expect(tickToSeconds(480, slowMap)).toBe(3)
  })
})

describe('ticksToBeats', () => {
  it('converts ticks to quarter-note beats using PPQ', () => {
    expect(ticksToBeats(0, 480)).toBe(0)
    expect(ticksToBeats(480, 480)).toBe(1)
    expect(ticksToBeats(960, 480)).toBe(2)
  })
})

describe('ticksToBars', () => {
  it('calculates 4/4 bar indices starting at 0', () => {
    expect(ticksToBars(0, 480, { denominator: 4, numerator: 4 })).toBe(0)
    expect(ticksToBars(1_919, 480, { denominator: 4, numerator: 4 })).toBe(0)
    expect(ticksToBars(1_920, 480, { denominator: 4, numerator: 4 })).toBe(1)
  })

  it('calculates 3/4 bar indices correctly', () => {
    expect(ticksToBars(0, 480, { denominator: 4, numerator: 3 })).toBe(0)
    expect(ticksToBars(1_439, 480, { denominator: 4, numerator: 3 })).toBe(0)
    expect(ticksToBars(1_440, 480, { denominator: 4, numerator: 3 })).toBe(1)
  })

  it('calculates 6/8 bar indices correctly', () => {
    expect(ticksToBars(0, 480, { denominator: 8, numerator: 6 })).toBe(0)
    expect(ticksToBars(1_439, 480, { denominator: 8, numerator: 6 })).toBe(0)
    expect(ticksToBars(1_440, 480, { denominator: 8, numerator: 6 })).toBe(1)
  })
})

function tempoEvent(tick: number, microsecondsPerBeat: number): TempoEvent {
  return {
    bpm: 60_000_000 / microsecondsPerBeat,
    microsecondsPerBeat,
    tick,
  }
}

function expectTempoMapError(
  callback: () => unknown,
  code: 'EMPTY_TEMPO_MAP' | 'INVALID_PPQ' | 'INVALID_INPUT',
): void {
  try {
    callback()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(TempoMapError)
    expect((error as TempoMapError).code).toBe(code)
    return
  }

  throw new Error('Expected a TempoMapError to be thrown.')
}

function generateRandomIntegers(count: number, min: number, max: number): number[] {
  const values: number[] = []
  let seed = 123_456_789

  for (let index = 0; index < count; index += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    values.push(min + (seed % (max - min + 1)))
  }

  return values
}

function generateRandomFloats(count: number, min: number, max: number): number[] {
  const values: number[] = []
  let seed = 362_436_069

  for (let index = 0; index < count; index += 1) {
    seed = (seed * 22_695_477 + 1) >>> 0
    const ratio = seed / 0xffff_ffff
    values.push(min + ratio * (max - min))
  }

  return values
}
