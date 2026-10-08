import type { CameraOverlaySettings } from '../../store/types'

export interface ResolvedCameraCrop {
  bottom: number
  left: number
  right: number
  top: number
}

export interface CameraSafeFrame {
  heightPercent: number
  leftPercent: number
  topPercent: number
  widthPercent: number
}

export interface CameraSourceRect {
  height: number
  left: number
  top: number
  width: number
}

export interface CameraOrientationGeometry {
  /** The crop rectangle in intrinsic, un-oriented source-video pixels. */
  sourceCrop: CameraSourceRect
  /** Dimensions after the requested quarter-turn, before cover fitting. */
  orientedSource: { height: number; width: number }
  /** The visible crop rectangle expressed in the oriented preview's CSS space. */
  previewCrop: CameraSafeFrame
  /** Canvas transform applied after the source crop is selected. */
  exportTransform: {
    flipX: -1 | 1
    flipY: -1 | 1
    rotationDegrees: CameraOverlaySettings['rotation']
  }
}

export interface CameraPreviewFrameRect {
  height: number
  left: number
  top: number
  width: number
}

/**
 * A stable-size preview surface plus the compositor-only transform that places
 * its selected crop in the viewport. Keeping width/height stable while a crop
 * control changes is important for hardware-decoded video: changing a video's
 * layout dimensions forces Chromium to reallocate/recompose its video layer.
 */
export interface CameraPreviewFrameTransform {
  height: number
  transform: string
  width: number
}

type CropEdge = keyof ResolvedCameraCrop

const VISUAL_TO_SOURCE_EDGE_BY_ROTATION: Record<CameraOverlaySettings['rotation'], Record<CropEdge, CropEdge>> = {
  0: { bottom: 'bottom', left: 'left', right: 'right', top: 'top' },
  90: { bottom: 'right', left: 'bottom', right: 'top', top: 'left' },
  180: { bottom: 'top', left: 'right', right: 'left', top: 'bottom' },
  270: { bottom: 'left', left: 'top', right: 'bottom', top: 'right' },
}

/**
 * Converts crop values named after visible edges into the untransformed camera
 * source's edges. CSS applies the flips before its rotation, so the same order
 * is used when walking a visible edge back to its source edge.
 */
export function resolveCameraCropForOrientation(
  overlay: Pick<CameraOverlaySettings, 'cropBottom' | 'cropLeft' | 'cropRight' | 'cropTop' | 'flipHorizontal' | 'flipVertical' | 'rotation'>,
): ResolvedCameraCrop {
  const visualCrop: ResolvedCameraCrop = {
    bottom: Math.max(0, overlay.cropBottom),
    left: Math.max(0, overlay.cropLeft),
    right: Math.max(0, overlay.cropRight),
    top: Math.max(0, overlay.cropTop),
  }
  const resolvedCrop: ResolvedCameraCrop = { bottom: 0, left: 0, right: 0, top: 0 }
  const visualToSourceEdge = VISUAL_TO_SOURCE_EDGE_BY_ROTATION[overlay.rotation]

  for (const visualEdge of Object.keys(visualCrop) as CropEdge[]) {
    let sourceEdge = visualToSourceEdge[visualEdge]
    if (overlay.flipHorizontal) {
      sourceEdge = swapHorizontalEdge(sourceEdge)
    }
    if (overlay.flipVertical) {
      sourceEdge = swapVerticalEdge(sourceEdge)
    }
    resolvedCrop[sourceEdge] = visualCrop[visualEdge]
  }

  return resolvedCrop
}

/**
 * Returns the largest valid value for a crop control named after a visible
 * edge. Values remain in intrinsic source-video pixels and always leave at
 * least one source pixel visible on that axis.
 */
export function getCameraCropEdgeMaximum(
  overlay: Pick<CameraOverlaySettings, 'cropBottom' | 'cropLeft' | 'cropRight' | 'cropTop' | 'flipHorizontal' | 'flipVertical' | 'rotation'>,
  visualEdge: CropEdge,
  videoWidth: number,
  videoHeight: number,
): number {
  if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
    return 0
  }

  const sourceEdge = resolveVisualCropEdgeToSourceEdge(overlay, visualEdge)
  const resolved = resolveCameraCropForOrientation(overlay)
  const oppositeEdge = sourceEdge === 'left'
    ? 'right'
    : sourceEdge === 'right'
      ? 'left'
      : sourceEdge === 'top'
        ? 'bottom'
        : 'top'
  const sourceSize = sourceEdge === 'left' || sourceEdge === 'right' ? videoWidth : videoHeight
  return Math.max(0, Math.floor(sourceSize - 1 - resolved[oppositeEdge]))
}

export function clampCameraCropValue(
  overlay: Pick<CameraOverlaySettings, 'cropBottom' | 'cropLeft' | 'cropRight' | 'cropTop' | 'flipHorizontal' | 'flipVertical' | 'rotation'>,
  visualEdge: CropEdge,
  value: number,
  videoWidth?: number,
  videoHeight?: number,
): number {
  const nonNegativeValue = Math.max(0, Number.isFinite(value) ? value : 0)
  // This prevents the metadata race from producing an unbounded CSS/video
  // surface while still allowing normal camera dimensions once known.
  if (videoWidth == null || videoHeight == null) {
    return Math.min(nonNegativeValue, 4096)
  }

  return Math.min(nonNegativeValue, getCameraCropEdgeMaximum(overlay, visualEdge, videoWidth, videoHeight))
}

export function getFeedOrientationTransform(overlay: Pick<CameraOverlaySettings, 'flipHorizontal' | 'flipVertical' | 'rotation'>): string {
  return `rotate(${overlay.rotation}deg) scaleX(${overlay.flipHorizontal ? -1 : 1}) scaleY(${overlay.flipVertical ? -1 : 1})`
}

/**
 * Resolves every representation of a camera crop from one canonical unit:
 * intrinsic pixels in the recorded camera source. The store still names crop
 * controls after the visible edges; this helper maps those edges back to the
 * un-oriented source before any renderer draws it.
 */
export function resolveCameraOrientationGeometry(
  overlay: Pick<CameraOverlaySettings, 'cropBottom' | 'cropLeft' | 'cropRight' | 'cropTop' | 'flipHorizontal' | 'flipVertical' | 'rotation'>,
  videoWidth: number,
  videoHeight: number,
): CameraOrientationGeometry | null {
  if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
    return null
  }

  const resolved = resolveCameraCropForOrientation(overlay)
  const left = clampCrop(resolved.left, videoWidth - 1)
  const top = clampCrop(resolved.top, videoHeight - 1)
  const right = clampCrop(resolved.right, videoWidth - left - 1)
  const bottom = clampCrop(resolved.bottom, videoHeight - top - 1)
  const sourceCrop: CameraSourceRect = {
    height: Math.max(1, videoHeight - top - bottom),
    left,
    top,
    width: Math.max(1, videoWidth - left - right),
  }
  const isQuarterTurn = overlay.rotation === 90 || overlay.rotation === 270
  const orientedSource = {
    height: isQuarterTurn ? videoWidth : videoHeight,
    width: isQuarterTurn ? videoHeight : videoWidth,
  }
  const selectedWidth = isQuarterTurn ? sourceCrop.height : sourceCrop.width
  const selectedHeight = isQuarterTurn ? sourceCrop.width : sourceCrop.height
  const visualLeft = clampCrop(overlay.cropLeft, orientedSource.width - 1)
  const visualTop = clampCrop(overlay.cropTop, orientedSource.height - 1)

  return {
    sourceCrop,
    orientedSource,
    previewCrop: {
      heightPercent: (selectedHeight / orientedSource.height) * 100,
      leftPercent: (visualLeft / orientedSource.width) * 100,
      topPercent: (visualTop / orientedSource.height) * 100,
      widthPercent: (selectedWidth / orientedSource.width) * 100,
    },
    exportTransform: {
      flipX: overlay.flipHorizontal ? -1 : 1,
      flipY: overlay.flipVertical ? -1 : 1,
      rotationDegrees: overlay.rotation,
    },
  }
}

/**
 * Positions the full, un-oriented source in a clipped preview viewport so the
 * selected source crop receives the same cover fit as export. The orientation
 * wrapper is applied around this rectangle afterwards.
 */
export function resolveCameraPreviewFrameRect(
  geometry: CameraOrientationGeometry,
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CameraPreviewFrameRect | null {
  if (
    !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) ||
    !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) ||
    sourceWidth <= 0 || sourceHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0
  ) {
    return null
  }

  const isQuarterTurn = geometry.exportTransform.rotationDegrees === 90 || geometry.exportTransform.rotationDegrees === 270
  const selectedWidth = isQuarterTurn ? geometry.sourceCrop.height : geometry.sourceCrop.width
  const selectedHeight = isQuarterTurn ? geometry.sourceCrop.width : geometry.sourceCrop.height
  const coverScale = Math.max(viewportWidth / selectedWidth, viewportHeight / selectedHeight)

  return {
    height: sourceHeight * coverScale,
    left: (viewportWidth / 2) - ((geometry.sourceCrop.left + (geometry.sourceCrop.width / 2)) * coverScale),
    top: (viewportHeight / 2) - ((geometry.sourceCrop.top + (geometry.sourceCrop.height / 2)) * coverScale),
    width: sourceWidth * coverScale,
  }
}

/**
 * Produces the same cover-fit result as resolveCameraPreviewFrameRect(), but
 * makes crop changes compositor-only. The backing video surface is sized once
 * for the full source; crop edits only change translate/scale.
 */
export function resolveCameraPreviewFrameTransform(
  geometry: CameraOrientationGeometry,
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CameraPreviewFrameTransform | null {
  const rect = resolveCameraPreviewFrameRect(
    geometry,
    sourceWidth,
    sourceHeight,
    viewportWidth,
    viewportHeight,
  )
  if (rect == null) {
    return null
  }

  const baseScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
  if (!Number.isFinite(baseScale) || baseScale <= 0) {
    return null
  }

  return {
    height: sourceHeight * baseScale,
    transform: `translate3d(${rect.left}px, ${rect.top}px, 0) scale(${rect.width / (sourceWidth * baseScale)})`,
    width: sourceWidth * baseScale,
  }
}

/**
 * Resolves the visible crop rectangle against intrinsic camera dimensions for
 * the full-frame setup preview. Crop values remain named after visual edges;
 * the resolved source crop keeps this preview in lockstep with the export path.
 */
export function resolveCameraSetupSafeFrame(
  overlay: Pick<CameraOverlaySettings, 'cropBottom' | 'cropLeft' | 'cropRight' | 'cropTop' | 'flipHorizontal' | 'flipVertical' | 'rotation'>,
  videoWidth: number,
  videoHeight: number,
): CameraSafeFrame | null {
  if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
    return null
  }

  return resolveCameraOrientationGeometry(overlay, videoWidth, videoHeight)?.previewCrop ?? null
}

function clampCrop(value: number, maximum: number): number {
  return Math.min(Math.max(0, value), Math.max(0, maximum))
}

function resolveVisualCropEdgeToSourceEdge(
  overlay: Pick<CameraOverlaySettings, 'flipHorizontal' | 'flipVertical' | 'rotation'>,
  visualEdge: CropEdge,
): CropEdge {
  let sourceEdge = VISUAL_TO_SOURCE_EDGE_BY_ROTATION[overlay.rotation][visualEdge]
  if (overlay.flipHorizontal) {
    sourceEdge = swapHorizontalEdge(sourceEdge)
  }
  if (overlay.flipVertical) {
    sourceEdge = swapVerticalEdge(sourceEdge)
  }
  return sourceEdge
}

function swapHorizontalEdge(edge: CropEdge): CropEdge {
  if (edge === 'left') {
    return 'right'
  }
  if (edge === 'right') {
    return 'left'
  }
  return edge
}

function swapVerticalEdge(edge: CropEdge): CropEdge {
  if (edge === 'top') {
    return 'bottom'
  }
  if (edge === 'bottom') {
    return 'top'
  }
  return edge
}
