import { isLearnV3Active } from '../store/learnV3Activity'

export const KEYBOARD_HEIGHT = 270
export const HIT_LINE_HEIGHT = 8
export const CREATE_MODE_FULLSCREEN_KEYBOARD_SCALE = 1.5

export const KEYBOARD_BACKING_COLOR = 0x1a1a1a

export const WHITE_KEY_COLOR = 0xf2efe8
export const WHITE_KEY_SHADOW_COLOR = 0xcccccc
export const WHITE_KEY_SEPARATOR_COLOR = 0xcccccc
export const WHITE_KEY_SEPARATOR_WIDTH = 1

export const BLACK_KEY_COLOR = 0x111111
export const BLACK_KEY_SHADOW_COLOR = 0x000000
export const BLACK_KEY_HIGHLIGHT_COLOR = 0x333333

export const WHITE_KEY_ACTIVE_ALPHA = 0.45
export const BLACK_KEY_ACTIVE_ALPHA = 0.75

export const KEY_GLOW_HEIGHT = 80
export const KEY_GLOW_ALPHA_START = 0.35
export const KEY_GLOW_ALPHA_END = 0
export const KEY_GLOW_STEPS = 8
export const KEY_GLOW_WIDTH_STEP = 4
export const KEY_GLOW_X_STEP = 2

export const WHITE_KEY_BOTTOM_SHADOW_HEIGHT = 4
export const BLACK_KEY_BOTTOM_SHADOW_HEIGHT = 6
export const NOTE_MIN_HEIGHT = 6

export interface KeyboardLayoutMetrics {
  keyboardHeight: number
  keyboardY: number
}

export function getKeyboardScaleMultiplier(): number {
  if (typeof document === 'undefined' || document.fullscreenElement == null) {
    return 1
  }

  return isLearnV3Active() ? 1 : CREATE_MODE_FULLSCREEN_KEYBOARD_SCALE
}

export function getKeyboardLayoutMetrics(canvasHeight: number): KeyboardLayoutMetrics {
  const safeCanvasHeight = Number.isFinite(canvasHeight) ? Math.max(0, Math.round(canvasHeight)) : 0
  const keyboardHeight = Math.min(KEYBOARD_HEIGHT * getKeyboardScaleMultiplier(), safeCanvasHeight)
  const keyboardY = Math.max(0, safeCanvasHeight - keyboardHeight)

  return {
    keyboardHeight,
    keyboardY,
  }
}
