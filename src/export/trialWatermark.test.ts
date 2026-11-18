import { expect, it, vi } from 'vitest'
import { drawTrialWatermark } from './trialWatermark'

it.each([[1280, 720], [3840, 2160]])('draws a legible in-frame watermark at %sx%s and restores canvas state', (width, height) => {
  const context = {
    save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), strokeText: vi.fn(), fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  drawTrialWatermark(context, width, height)
  const [label, x, y] = vi.mocked(context.fillText).mock.calls[0]
  expect(label).toBe('Lumina Piano · Trial')
  expect(x).toBeGreaterThan(0)
  expect(x).toBeLessThan(width)
  expect(y).toBeGreaterThan(0)
  expect(y).toBeLessThan(height)
  expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0)
  expect(context.restore).toHaveBeenCalledOnce()
})
