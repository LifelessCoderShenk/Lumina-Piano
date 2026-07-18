import type { Note } from '../midi/types'
import type { CreateNoteColors } from '../store/types'
import type { AppState } from '../store/store'
import { isBlackKey } from './pianoMath'

const DEFAULT_COLOR = '#4f8ef7'
const DEFAULT_TOP_COLOR = '#ffffff'
const CREATE_MODE_NOTE_COLOR = 0x2e65a2

export interface NoteGradientColors {
  topColor: string
  bottomColor: string
}

export function resolveNoteColor(
  note: Note,
  trackId: string,
  state: AppState,
): number {
  if (state.colorMode === 'split' && state.noteStyle === 'gradient') {
    return hexToPixi(resolveSplitGradientBottomColor(note.pitch, state))
  }

  switch (state.colorMode) {
    case 'track':
      return hexToPixi(state.trackColors[trackId] ?? DEFAULT_COLOR)

    case 'pitch': {
      const pitchClass = ((note.pitch % 12) + 12) % 12
      return hexToPixi(state.pitchClassColors[pitchClass] ?? DEFAULT_COLOR)
    }

    case 'split':
      return hexToPixi(note.pitch < state.splitPitch ? state.leftHandColor : state.rightHandColor)

    case 'velocity':
      return lerpColor(
        hexToPixi(state.velocityLowColor),
        hexToPixi(state.velocityHighColor),
        note.velocity / 127,
      )
  }
}

export function resolveNoteGradientColors(
  note: Note,
  trackId: string,
  state: AppState,
): NoteGradientColors {
  if (state.colorMode === 'split' && state.noteStyle === 'gradient') {
    return {
      bottomColor: resolveSplitGradientBottomColor(note.pitch, state),
      topColor: state.gradientTopColor,
    }
  }

  return {
    bottomColor: pixiToHex(resolveNoteColor(note, trackId, state)),
    topColor: state.gradientTopColor ?? DEFAULT_TOP_COLOR,
  }
}

export function lerpColor(a: number, b: number, t: number): number {
  const mix = clamp01(t)
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const red = Math.round(ar + ((br - ar) * mix))
  const green = Math.round(ag + ((bg - ag) * mix))
  const blue = Math.round(ab + ((bb - ab) * mix))

  return (red << 16) | (green << 8) | blue
}

export function hexToPixi(hex: string): number {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex

  if (normalized.length === 3) {
    const r = hexNibble(normalized.charCodeAt(0))
    const g = hexNibble(normalized.charCodeAt(1))
    const b = hexNibble(normalized.charCodeAt(2))
    return ((r * 17) << 16) | ((g * 17) << 8) | (b * 17)
  }

  if (normalized.length !== 6) {
    return 0x4f8ef7
  }

  const red = (hexNibble(normalized.charCodeAt(0)) << 4) | hexNibble(normalized.charCodeAt(1))
  const green = (hexNibble(normalized.charCodeAt(2)) << 4) | hexNibble(normalized.charCodeAt(3))
  const blue = (hexNibble(normalized.charCodeAt(4)) << 4) | hexNibble(normalized.charCodeAt(5))

  return (red << 16) | (green << 8) | blue
}

export function pixiToHex(color: number): string {
  const normalized = Math.max(0, Math.min(0xffffff, Math.round(color)))
  return `#${normalized.toString(16).padStart(6, '0')}`
}

export function brightenColor(color: number, brightness: number): number {
  const red = Math.min(255, Math.round(((color >> 16) & 0xff) * brightness))
  const green = Math.min(255, Math.round(((color >> 8) & 0xff) * brightness))
  const blue = Math.min(255, Math.round((color & 0xff) * brightness))

  return (red << 16) | (green << 8) | blue
}

export function interpolateColor(startColor: number, endColor: number, progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const startRed = (startColor >> 16) & 0xff
  const startGreen = (startColor >> 8) & 0xff
  const startBlue = startColor & 0xff
  const endRed = (endColor >> 16) & 0xff
  const endGreen = (endColor >> 8) & 0xff
  const endBlue = endColor & 0xff

  const red = Math.round(startRed + ((endRed - startRed) * clampedProgress))
  const green = Math.round(startGreen + ((endGreen - startGreen) * clampedProgress))
  const blue = Math.round(startBlue + ((endBlue - startBlue) * clampedProgress))

  return (red << 16) | (green << 8) | blue
}

export function resolveCreateModeNoteColor(
  pitch: number,
  createNoteColors: CreateNoteColors | null | undefined = null,
): number {
  return resolveCreateModePitchColor(pitch, createNoteColors)
}

export function resolveCreateModePitchColor(
  pitch: number,
  createNoteColors: CreateNoteColors | null | undefined,
): number {
  if (createNoteColors == null) {
    return CREATE_MODE_NOTE_COLOR
  }

  if (createNoteColors.mode === 'single') {
    return hexToPixi(createNoteColors.singleColor)
  }

  const pitchClass = normalizePitchClass(pitch)
  return resolveCreateModePitchClassColor(pitchClass, createNoteColors)
}

export function resolveCreateModePitchClassColor(
  pitchClass: number,
  createNoteColors: CreateNoteColors | null | undefined,
): number {
  if (createNoteColors == null) {
    return CREATE_MODE_NOTE_COLOR
  }

  const normalizedPitchClass = normalizePitchClass(pitchClass)
  const resolvedColor =
    createNoteColors.pitchClassColors[normalizedPitchClass] ??
    createNoteColors.singleColor

  return hexToPixi(resolvedColor)
}

function resolveSplitGradientBottomColor(pitch: number, state: AppState): string {
  const isRightHand = pitch >= state.splitPitch
  const isBlack = isBlackKey(pitch)

  if (isRightHand) {
    return isBlack ? state.gradientBottomColorRightBlack : state.gradientBottomColorRight
  }

  return isBlack ? state.gradientBottomColorLeftBlack : state.gradientBottomColorLeft
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

function normalizePitchClass(pitch: number): number {
  return ((Math.round(pitch) % 12) + 12) % 12
}

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) {
    return code - 48
  }

  if (code >= 65 && code <= 70) {
    return code - 55
  }

  if (code >= 97 && code <= 102) {
    return code - 87
  }

  return 0
}
