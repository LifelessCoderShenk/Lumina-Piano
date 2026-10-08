/*
INPUT: ScoreSheet's pure duration-decomposition helper.
OUTPUT: Exact sixteenth-grid notation duration coverage.
PURPOSE: Prevents the score renderer from silently shortening durations that cannot be represented by one VexFlow note value.
*/

import { describe, expect, it } from 'vitest'

import { decomposeTicksForNotation } from './ScoreSheet'

describe('ScoreSheet duration decomposition', () => {
  it('preserves five sixteenth notes rather than rounding them down to a quarter', () => {
    expect(decomposeTicksForNotation(600)).toEqual(['q', '16'])
  })

  it('uses a dotted value when it exactly represents the quantized duration', () => {
    expect(decomposeTicksForNotation(720)).toEqual(['qd'])
  })
})
