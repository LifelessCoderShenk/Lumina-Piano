import { describe, expect, it } from 'vitest'

import { EXPORT_PIXEL_BUDGET, resolveExportDimensions } from './exportDimensions'

describe('resolveExportDimensions', () => {
  it.each([
    ['720p', 'fit', 1280, 720],
    ['1080p', 'fit', 1920, 1080],
    ['4K', 'fit', 3840, 2160],
    ['720p', '16:9', 1280, 720],
    ['1080p', '16:9', 1920, 1080],
    ['4K', '16:9', 3840, 2160],
    ['720p', '9:16', 720, 1280],
    ['1080p', '9:16', 1080, 1920],
    ['4K', '9:16', 2160, 3840],
    ['720p', '1:1', 1280, 1280],
    ['1080p', '1:1', 1920, 1920],
    ['4K', '1:1', 2880, 2880],
    ['720p', '4:3', 1280, 960],
    ['1080p', '4:3', 1920, 1440],
    ['4K', '4:3', 3320, 2490],
  ] as const)('resolves %s at %s to %i×%i', (resolution, aspectRatio, width, height) => {
    expect(resolveExportDimensions(resolution, aspectRatio)).toEqual({ height, width })
  })

  it('keeps every resolved dimension even and within the 4K 16:9 pixel budget', () => {
    for (const resolution of ['720p', '1080p', '4K'] as const) {
      for (const aspectRatio of ['fit', '16:9', '9:16', '1:1', '4:3'] as const) {
        const { height, width } = resolveExportDimensions(resolution, aspectRatio)
        expect(height % 2).toBe(0)
        expect(width % 2).toBe(0)
        expect(width * height).toBeLessThanOrEqual(EXPORT_PIXEL_BUDGET)
      }
    }
  })
})
