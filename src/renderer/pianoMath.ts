import { getKeyboardLayoutMetrics, type RenderLayoutContext } from './layoutConstants'

export const PIANO_MIN_PITCH = 21
export const PIANO_MAX_PITCH = 108
export const PIANO_WHITE_KEY_COUNT = 52
export const BLACK_KEY_WIDTH_RATIO = 0.58
const BLACK_KEY_HEIGHT_RATIO = 0.6
const BLACK_KEY_BOTTOM_INSET = 2

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])
const KEYBOARD_PITCHES = createKeyboardPitchRange()
const WHITE_KEY_INDEX_BY_PITCH = createWhiteKeyIndexMap()
const WHITE_PITCHES = KEYBOARD_PITCHES.filter((pitch) => !isBlackKey(pitch))
const BLACK_PITCHES = KEYBOARD_PITCHES.filter((pitch) => isBlackKey(pitch))

export function isBlackKey(pitch: number): boolean {
  return BLACK_KEY_PITCH_CLASSES.has(normalizePitchClass(pitch))
}

export function getWhiteKeyIndex(pitch: number): number {
  const clampedPitch = clampPitch(pitch)
  return WHITE_KEY_INDEX_BY_PITCH.get(clampedPitch) ?? 0
}

export function pitchToKeyX(pitch: number, canvasWidth = 1920): number {
  const clampedPitch = clampPitch(pitch)
  const whiteKeyWidth = getWhiteKeyWidth(canvasWidth)

  if (!isBlackKey(clampedPitch)) {
    return getWhiteKeyIndex(clampedPitch) * whiteKeyWidth
  }

  const blackKeyWidth = getBlackKeyWidth(canvasWidth)
  return ((getWhiteKeyIndex(clampedPitch) + 1) * whiteKeyWidth) - (blackKeyWidth / 2)
}

export function getKeyAtScreenX(screenX: number, canvasWidth = 1920): number | null {
  if (!Number.isFinite(screenX) || !Number.isFinite(canvasWidth) || canvasWidth <= 0) {
    return null
  }

  if (screenX < 0 || screenX >= canvasWidth) {
    return null
  }

  return getBlackKeyAtX(screenX, canvasWidth) ?? getWhiteKeyAtX(screenX, canvasWidth)
}

/**
 * Returns the piano key at a canvas-space point. Black keys only take priority
 * within their visible upper portion; below that, their white key is exposed.
 */
export function getKeyAtCanvasPoint(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  layoutContext?: RenderLayoutContext,
): number | null {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(canvasHeight) ||
    canvasWidth <= 0 ||
    canvasHeight <= 0 ||
    x < 0 ||
    x >= canvasWidth
  ) {
    return null
  }

  // Keep the hit area in lockstep with the keyboard's renderer geometry.
  const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(canvasHeight, layoutContext)
  if (y < keyboardY || y >= canvasHeight) {
    return null
  }

  const blackKeyBottom = keyboardY + Math.max(1, Math.round(keyboardHeight * BLACK_KEY_HEIGHT_RATIO) - BLACK_KEY_BOTTOM_INSET)
  if (y < blackKeyBottom) {
    return getBlackKeyAtX(x, canvasWidth) ?? getWhiteKeyAtX(x, canvasWidth)
  }

  return getWhiteKeyAtX(x, canvasWidth)
}

export function getWhiteKeyWidth(canvasWidth: number): number {
  return canvasWidth / PIANO_WHITE_KEY_COUNT
}

export function getBlackKeyWidth(canvasWidth: number): number {
  return getWhiteKeyWidth(canvasWidth) * BLACK_KEY_WIDTH_RATIO
}

export function getWhiteKeyBounds(
  pitch: number,
  canvasWidth: number,
): { x: number; width: number } {
  const whiteKeyIndex = getWhiteKeyIndex(pitch)
  const x = getWhiteKeyStartByIndex(whiteKeyIndex, canvasWidth)
  const nextX = getWhiteKeyStartByIndex(whiteKeyIndex + 1, canvasWidth)

  return {
    width: Math.max(1, nextX - x),
    x,
  }
}

function createKeyboardPitchRange(): number[] {
  const pitches: number[] = []

  for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
    pitches.push(pitch)
  }

  return pitches
}

function createWhiteKeyIndexMap(): Map<number, number> {
  const indices = new Map<number, number>()
  let currentWhiteIndex = -1

  for (const pitch of KEYBOARD_PITCHES) {
    if (!isBlackKey(pitch)) {
      currentWhiteIndex += 1
    }

    indices.set(pitch, Math.max(0, currentWhiteIndex))
  }

  return indices
}

function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) {
    return PIANO_MIN_PITCH
  }

  return Math.min(PIANO_MAX_PITCH, Math.max(PIANO_MIN_PITCH, Math.round(pitch)))
}

function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12
}

function getWhiteKeyStartByIndex(index: number, canvasWidth: number): number {
  const normalizedCanvasWidth = normalizeCanvasWidth(canvasWidth)
  const clampedIndex = Math.min(PIANO_WHITE_KEY_COUNT, Math.max(0, index))

  return Math.floor((clampedIndex * normalizedCanvasWidth) / PIANO_WHITE_KEY_COUNT)
}

function normalizeCanvasWidth(canvasWidth: number): number {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0) {
    return 1920
  }

  return Math.max(1, Math.round(canvasWidth))
}

function getBlackKeyAtX(x: number, canvasWidth: number): number | null {
  const blackKeyWidth = getBlackKeyWidth(canvasWidth)
  for (const pitch of BLACK_PITCHES) {
    const keyX = pitchToKeyX(pitch, canvasWidth)
    if (x >= keyX && x < keyX + blackKeyWidth) {
      return pitch
    }
  }

  return null
}

function getWhiteKeyAtX(x: number, canvasWidth: number): number | null {
  for (const pitch of WHITE_PITCHES) {
    const { width, x: keyX } = getWhiteKeyBounds(pitch, canvasWidth)
    if (x >= keyX && x < keyX + width) {
      return pitch
    }
  }

  return null
}
