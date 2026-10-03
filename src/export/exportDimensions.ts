import type { VisualizerSettings } from '../store/types'

import type { ExportResolution } from './types'

const RESOLUTION_LONG_EDGES: Record<VisualizerSettings['resolution'], number> = {
  '720p': 1280,
  '1080p': 1920,
  '4K': 3840,
}

const EXPORT_PIXEL_BUDGET = 3840 * 2160

type AspectRatioDefinition = {
  width: number
  height: number
}

const ASPECT_RATIO_DEFINITIONS: Record<VisualizerSettings['aspectRatio'], AspectRatioDefinition> = {
  fit: { width: 16, height: 9 },
  '16:9': { width: 16, height: 9 },
  '9:16': { width: 9, height: 16 },
  '1:1': { width: 1, height: 1 },
  '4:3': { width: 4, height: 3 },
}

export function resolveExportDimensions(
  resolution: VisualizerSettings['resolution'],
  aspectRatio: VisualizerSettings['aspectRatio'],
): ExportResolution {
  const ratio = ASPECT_RATIO_DEFINITIONS[aspectRatio]
  const requestedScale = RESOLUTION_LONG_EDGES[resolution] / Math.max(ratio.width, ratio.height)
  const pixelBudgetScale = Math.sqrt(EXPORT_PIXEL_BUDGET / (ratio.width * ratio.height))
  let scale = Math.min(requestedScale, Math.floor(pixelBudgetScale))

  while ((ratio.width * scale) % 2 !== 0 || (ratio.height * scale) % 2 !== 0) {
    scale -= 1
  }

  return {
    height: ratio.height * scale,
    width: ratio.width * scale,
  }
}

export { EXPORT_PIXEL_BUDGET }
