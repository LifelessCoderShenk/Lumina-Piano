import { describe, expect, it } from 'vitest'

import { calculateFramePsnr, getExportQualitySampleFrameIndexes } from './exportQuality'

describe('export quality diagnostics', () => {
  it('selects the beginning, middle, and end of an export for raw-frame comparison', () => {
    expect(getExportQualitySampleFrameIndexes(1)).toEqual([0])
    expect(getExportQualitySampleFrameIndexes(10)).toEqual([0, 4, 9])
  })

  it('reports lossless and lossy frame comparisons without conflating different frame sizes', () => {
    expect(calculateFramePsnr(new Uint8Array([0, 64, 128]), new Uint8Array([0, 64, 128]))).toBe(Infinity)
    expect(calculateFramePsnr(new Uint8Array([0]), new Uint8Array([255]))).toBeCloseTo(0)
    expect(calculateFramePsnr(new Uint8Array([0]), new Uint8Array([0, 0]))).toBeNull()
  })
})
