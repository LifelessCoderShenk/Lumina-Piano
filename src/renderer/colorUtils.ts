import type { Note } from '../midi/types'
import { TUTORIAL_CREATE_PRESET } from '../store/createNoteColorPalettes'
import type { CreateNoteColors } from '../store/types'
import type { AppState } from '../store/store'
import { isBlackKey } from './pianoMath'

const DEFAULT_COLOR = '#4f8ef7'
const DEFAULT_TOP_COLOR = '#ffffff'
const CREATE_MODE_NOTE_COLOR = 0x4f8ef7
const CREATE_MODE_GRADIENT_START_HUE = 0
const CREATE_MODE_GRADIENT_END_HUE = 0.75
const CREATE_MODE_GRADIENT_SATURATION = 0.82
const CREATE_MODE_GRADIENT_LIGHTNESS = 0.46
const CREATE_MODE_DYNAMIC_SATURATION = 0.84
const CREATE_MODE_DYNAMIC_LIGHTNESS = 0.52
const CREATE_MODE_DYNAMIC_PITCH_SPREAD = 0.12

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
  keyboardPosition = 0,
  velocity = 80,
  timelinePosition = 0,
): number {
  return resolveCreateModePitchColor(pitch, createNoteColors, keyboardPosition, velocity, timelinePosition)
}

export function resolveCreateModePitchColor(
  pitch: number,
  createNoteColors: CreateNoteColors | null | undefined,
  keyboardPosition = 0,
  velocity = 80,
  timelinePosition = 0,
): number {
  if (createNoteColors == null) {
    return CREATE_MODE_NOTE_COLOR
  }

  if (createNoteColors.mode === 'single') {
    return hexToPixi(createNoteColors.singleColor)
  }

  if (createNoteColors.mode === 'gradient') {
    return hslToPixi({
      hue: CREATE_MODE_GRADIENT_START_HUE + (
        (CREATE_MODE_GRADIENT_END_HUE - CREATE_MODE_GRADIENT_START_HUE) * clamp01(keyboardPosition)
      ),
      lightness: CREATE_MODE_GRADIENT_LIGHTNESS,
      saturation: CREATE_MODE_GRADIENT_SATURATION,
    })
  }

  if (createNoteColors.mode === 'velocity') {
    return lerpColor(
      hexToPixi(createNoteColors.velocityLowColor ?? '#4b2f83'),
      hexToPixi(createNoteColors.velocityHighColor ?? '#62e8ff'),
      velocity / 127,
    )
  }

  if (createNoteColors.mode === 'dynamic') {
    return hslToPixi({
      hue: timelinePosition + (clamp01(keyboardPosition) * CREATE_MODE_DYNAMIC_PITCH_SPREAD),
      lightness: CREATE_MODE_DYNAMIC_LIGHTNESS,
      saturation: CREATE_MODE_DYNAMIC_SATURATION,
    })
  }

  if (createNoteColors.mode === 'random') {
    return hslToPixi({
      hue: resolveDeterministicNoteHue(pitch, timelinePosition),
      lightness: 0.52,
      saturation: 0.82,
    })
  }

  if (createNoteColors.mode === 'tutorial') {
    return hexToPixi(
      pitch < TUTORIAL_CREATE_PRESET.splitPitch
        ? TUTORIAL_CREATE_PRESET.lowerRegisterColor
        : TUTORIAL_CREATE_PRESET.upperRegisterColor,
    )
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

function resolveDeterministicNoteHue(pitch: number, timelinePosition: number): number {
  const positionSeed = Math.round((Number.isFinite(timelinePosition) ? timelinePosition : 0) * 1_000_003)
  let seed = Math.imul(Math.round(pitch), 668_265_263) ^ Math.imul(positionSeed, 374_761_393)
  seed = Math.imul(seed ^ (seed >>> 13), 1_274_126_177)
  return ((seed ^ (seed >>> 16)) >>> 0) / 4_294_967_296
}

function hslToPixi({ hue, lightness, saturation }: { hue: number; lightness: number; saturation: number }): number {
  const normalizedHue = ((hue % 1) + 1) % 1
  const normalizedSaturation = clamp01(saturation)
  const normalizedLightness = clamp01(lightness)

  if (normalizedSaturation === 0) {
    const channel = Math.round(normalizedLightness * 0xff)
    return (channel << 16) | (channel << 8) | channel
  }

  const q = normalizedLightness < 0.5
    ? normalizedLightness * (1 + normalizedSaturation)
    : normalizedLightness + normalizedSaturation - (normalizedLightness * normalizedSaturation)
  const p = (2 * normalizedLightness) - q
  const hueToChannel = (channelHue: number) => {
    const wrappedHue = ((channelHue % 1) + 1) % 1
    if (wrappedHue < 1 / 6) {
      return p + ((q - p) * 6 * wrappedHue)
    }
    if (wrappedHue < 1 / 2) {
      return q
    }
    if (wrappedHue < 2 / 3) {
      return p + ((q - p) * ((2 / 3) - wrappedHue) * 6)
    }
    return p
  }

  return (
    (Math.round(hueToChannel(normalizedHue + (1 / 3)) * 0xff) << 16)
    | (Math.round(hueToChannel(normalizedHue) * 0xff) << 8)
    | Math.round(hueToChannel(normalizedHue - (1 / 3)) * 0xff)
  )
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
