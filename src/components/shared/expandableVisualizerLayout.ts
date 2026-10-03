import type { CSSProperties } from 'react'

import type { CameraOverlaySettings } from '../../store/types'

/**
 * Keeps the visualizer's keyboard at the Y position chosen in Camera/Record
 * alignment without moving the whole, fixed-height canvas down into a black
 * gap. Positive Y becomes additional note-field height above the keyboard.
 */
export function getExpandableVisualizerStyle(
  baseHeight: string,
  overlay: Pick<CameraOverlaySettings, 'offsetX' | 'offsetY' | 'scale'>,
): CSSProperties {
  const scale = Math.max(0.05, Number.isFinite(overlay.scale) ? overlay.scale : 1)
  const offsetY = Number.isFinite(overlay.offsetY) ? overlay.offsetY : 0
  const positiveExpansion = Math.max(0, offsetY) / scale
  const upwardTranslation = Math.min(0, offsetY)

  return {
    height: positiveExpansion > 0
      ? `calc(${baseHeight} + ${positiveExpansion}px)`
      : baseHeight,
    transform: `translate3d(${overlay.offsetX}px, ${upwardTranslation}px, 0) scale(${scale})`,
    transformOrigin: 'top left',
  }
}
