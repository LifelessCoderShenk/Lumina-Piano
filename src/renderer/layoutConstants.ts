export const KEYBOARD_HEIGHT = 270
export const HIT_LINE_HEIGHT = 8
/** The original Create keyboard was designed against a 720px viewport. */
export const DEFAULT_KEYBOARD_HEIGHT_RATIO = KEYBOARD_HEIGHT / 720

export const KEYBOARD_BACKING_COLOR = 0x090a0c

export const WHITE_KEY_COLOR = 0xf5f3ed
export const WHITE_KEY_SHADOW_COLOR = 0xb8b6b0
export const WHITE_KEY_SEPARATOR_COLOR = 0x8e8d89
export const WHITE_KEY_SEPARATOR_WIDTH = 1

export const BLACK_KEY_COLOR = 0x121417
export const BLACK_KEY_SHADOW_COLOR = 0x000102
export const BLACK_KEY_HIGHLIGHT_COLOR = 0x4f545c

export const WHITE_KEY_ACTIVE_ALPHA = 0.45
export const BLACK_KEY_ACTIVE_ALPHA = 0.75

export const KEY_GLOW_HEIGHT = 80
export const KEY_GLOW_ALPHA_START = 0.35
export const KEY_GLOW_ALPHA_END = 0
export const KEY_GLOW_STEPS = 8
export const KEY_GLOW_WIDTH_STEP = 4
export const KEY_GLOW_X_STEP = 2

export const WHITE_KEY_BOTTOM_SHADOW_HEIGHT = 10
export const BLACK_KEY_BOTTOM_SHADOW_HEIGHT = 12
export const NOTE_MIN_HEIGHT = 6

export interface KeyboardLayoutMetrics {
  keyboardHeight: number
  keyboardY: number
}

export interface RenderLayoutContext {
  keyboardHeightRatio: number
  /** Offline export preserves the live frame proportion instead of the live-height cap. */
  preserveKeyboardHeightRatio?: boolean
  /**
   * When supplied, the note field is traversed in this many seconds. Camera
   * and Record use this to keep their three-second lead-in intact as their
   * visualizer is expanded during alignment.
   */
  noteFieldTravelSeconds?: number
}

export const DEFAULT_RENDER_LAYOUT_CONTEXT: RenderLayoutContext = {
  keyboardHeightRatio: DEFAULT_KEYBOARD_HEIGHT_RATIO,
}

export function normalizeRenderLayoutContext(
  context: Partial<RenderLayoutContext> | undefined,
): RenderLayoutContext {
  const keyboardHeightRatio = context?.keyboardHeightRatio
  return {
    keyboardHeightRatio: Number.isFinite(keyboardHeightRatio)
      ? Math.min(0.8, Math.max(0.1, keyboardHeightRatio as number))
      : DEFAULT_KEYBOARD_HEIGHT_RATIO,
    preserveKeyboardHeightRatio: context?.preserveKeyboardHeightRatio === true,
    noteFieldTravelSeconds: Number.isFinite(context?.noteFieldTravelSeconds)
      ? Math.min(20, Math.max(0.25, context?.noteFieldTravelSeconds as number))
      : undefined,
  }
}

export function getKeyboardLayoutMetrics(
  canvasHeight: number,
  layoutContext: Partial<RenderLayoutContext> = DEFAULT_RENDER_LAYOUT_CONTEXT,
): KeyboardLayoutMetrics {
  const safeCanvasHeight = Number.isFinite(canvasHeight) ? Math.max(0, Math.round(canvasHeight)) : 0
  const { keyboardHeightRatio, preserveKeyboardHeightRatio } = normalizeRenderLayoutContext(layoutContext)
  const ratioHeight = Math.round(safeCanvasHeight * keyboardHeightRatio)
  // Normal interactive canvases retain the original compact keyboard height.
  // Export supplies an explicit layout snapshot and preserves its proportion.
  const keyboardHeight = Math.min(
    preserveKeyboardHeightRatio ? ratioHeight : Math.min(KEYBOARD_HEIGHT, ratioHeight),
    safeCanvasHeight,
  )
  const keyboardY = Math.max(0, safeCanvasHeight - keyboardHeight)

  return {
    keyboardHeight,
    keyboardY,
  }
}
