import type { Note } from '../midi/types'
import { secondsToTick, tickToSeconds } from '../tempo/tempoMap'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { KEYBOARD_HEIGHT } from './layoutConstants'
import {
  getBlackKeyWidth,
  getWhiteKeyWidth,
  isBlackKey,
  pitchToKeyX,
} from './pianoMath'

const WHITE_NOTE_WIDTH_RATIO = 0.72
const BLACK_NOTE_WIDTH_RATIO = 0.88

export const DEFAULT_PIXELS_PER_SECOND = 200
export const NOTE_MIN_HEIGHT = 6
export const RECENT_NOTE_BUFFER_SECONDS = 0.25
export const FUTURE_NOTE_BUFFER_SECONDS = 0.5
export const MIN_CONSECUTIVE_NOTE_GAP_PX = 3
export const MAX_REPEAT_NOTE_GAP_TICKS = 120
export const REPEAT_NOTE_GAP_RATIO = 0.1

export interface NoteScreenRect {
  x: number
  y: number
  w: number
  h: number
}

export interface VisibleTickWindow {
  minTick: number
  maxTick: number
}

interface NoteScreenRectOptions {
  canvasWidth: number
  canvasHeight: number
  currentSeconds: number
  currentTick: number
  tempoMap: PrecomputedTempoMap
  worldZoom: number
}

export function getEffectivePixelsPerSecond(worldZoom: number): number {
  return DEFAULT_PIXELS_PER_SECOND * Math.max(worldZoom, 0.1)
}

export function getVisibleTickWindow(
  currentTick: number,
  currentSeconds: number,
  tempoMap: PrecomputedTempoMap,
  noteFieldHeight: number,
  worldZoom: number,
): VisibleTickWindow {
  const pixelsPerSecond = getEffectivePixelsPerSecond(worldZoom)
  const minSeconds = Math.max(0, currentSeconds - RECENT_NOTE_BUFFER_SECONDS)
  const maxSeconds = currentSeconds + (noteFieldHeight / pixelsPerSecond) + FUTURE_NOTE_BUFFER_SECONDS

  return {
    maxTick: Math.max(currentTick, secondsToTick(maxSeconds, tempoMap)),
    minTick: Math.max(0, secondsToTick(minSeconds, tempoMap)),
  }
}

export function getNoteScreenRect(
  note: Note,
  options: NoteScreenRectOptions,
  nextNote: Note | null = null,
): NoteScreenRect | null {
  const baseRect = getBaseNoteScreenRect(note, options, nextNote)
  if (baseRect == null) {
    return null
  }

  if (nextNote == null) {
    return baseRect
  }

  const nextRect = getBaseNoteScreenRect(nextNote, options)
  if (nextRect == null) {
    return baseRect
  }

  const currentBottom = baseRect.y + baseRect.h
  const nextBottom = nextRect.y + nextRect.h
  const maxAllowedHeight = currentBottom - nextBottom - MIN_CONSECUTIVE_NOTE_GAP_PX

  if (maxAllowedHeight <= 0) {
    return null
  }

  const adjustedHeight = Math.min(baseRect.h, maxAllowedHeight)

  return {
    ...baseRect,
    h: adjustedHeight,
    y: currentBottom - adjustedHeight,
  }
}

function getBaseNoteScreenRect(
  note: Note,
  options: NoteScreenRectOptions,
  nextNote: Note | null = null,
): NoteScreenRect | null {
  const naturalDurationTicks = note.endTick - note.startTick
  const effectiveVisualEndTick = getEffectiveVisualEndTick(note, nextNote)
  if (
    !Number.isFinite(note.startTick) ||
    !Number.isFinite(naturalDurationTicks) ||
    !Number.isFinite(effectiveVisualEndTick) ||
    naturalDurationTicks <= 0
  ) {
    return null
  }

  const {
    canvasWidth,
    canvasHeight,
    currentSeconds,
    currentTick,
    tempoMap,
    worldZoom,
  } = options
  const keyboardY = canvasHeight - KEYBOARD_HEIGHT
  const pixelsPerSecond = getEffectivePixelsPerSecond(worldZoom)
  const startSeconds = tickToSeconds(note.startTick, tempoMap)
  const endSeconds = tickToSeconds(effectiveVisualEndTick, tempoMap)
  const durationSeconds = Math.max(0, endSeconds - startSeconds)

  let yBottom = 0
  let noteHeight = NOTE_MIN_HEIGHT

  if (currentTick <= note.startTick) {
    const secondsUntilPlay = startSeconds - currentSeconds
    yBottom = keyboardY - (secondsUntilPlay * pixelsPerSecond)
    noteHeight = Math.max(durationSeconds * pixelsPerSecond, NOTE_MIN_HEIGHT)
  } else if (currentTick <= effectiveVisualEndTick) {
    const remainingDurationSeconds = Math.max(0, endSeconds - currentSeconds)
    yBottom = keyboardY
    noteHeight = Math.max(remainingDurationSeconds * pixelsPerSecond, NOTE_MIN_HEIGHT)
  } else {
    return null
  }

  const keyX = pitchToKeyX(note.pitch, canvasWidth)
  const keyWidth = isBlackKey(note.pitch)
    ? getBlackKeyWidth(canvasWidth)
    : getWhiteKeyWidth(canvasWidth)
  const noteWidthRatio = isBlackKey(note.pitch)
    ? BLACK_NOTE_WIDTH_RATIO
    : WHITE_NOTE_WIDTH_RATIO
  const noteWidth = Math.max(4, keyWidth * noteWidthRatio)
  const noteX = keyX + ((keyWidth - noteWidth) / 2)
  const yTop = yBottom - noteHeight

  if (yBottom <= 0 || yTop >= keyboardY) {
    return null
  }

  return {
    h: noteHeight,
    w: noteWidth,
    x: noteX,
    y: yTop,
  }
}

function getEffectiveVisualEndTick(note: Note, nextNote: Note | null): number {
  if (
    nextNote == null ||
    nextNote.pitch !== note.pitch ||
    !Number.isFinite(nextNote.startTick)
  ) {
    return note.visualEndTick
  }

  const gapTicks = nextNote.startTick - note.startTick
  const minGapTicks = Math.min(gapTicks * REPEAT_NOTE_GAP_RATIO, MAX_REPEAT_NOTE_GAP_TICKS)

  return Math.min(note.visualEndTick, nextNote.startTick - minGapTicks)
}
