import * as PIXI from 'pixi.js'

import { cameraSystem } from '../camera/CameraSystem'
import type { Note, ProjectData, Track } from '../midi/types'
import { getAppState } from '../store/store'
import { getNoteScreenRect } from '../renderer/noteMotion'
import { tickToSeconds } from '../tempo/tempoMap'

export const HANDLE_WIDTH = 16
export const HANDLE_HEIGHT = 6
export const HANDLE_COLOR = 0xffffff
export const HANDLE_ALPHA = 0.9
export const HANDLE_CORNER_RADIUS = 2

export const SELECTED_NOTE_OUTLINE_COLOR = 0xffffff
export const SELECTED_NOTE_OUTLINE_WIDTH = 2
export const SELECTED_NOTE_FILL_BRIGHTNESS = 1.2
export const HOVERED_NOTE_FILL_BRIGHTNESS = 1.1

export const MARQUEE_BORDER_COLOR = 0xffffff
export const MARQUEE_BORDER_ALPHA = 0.6
export const MARQUEE_FILL_COLOR = 0xffffff
export const MARQUEE_FILL_ALPHA = 0.05
export const MARQUEE_DASH_LENGTH = 6
export const MARQUEE_GAP_LENGTH = 4

const NOTE_CORNER_RADIUS = 4

export interface NoteScreenRect {
  x: number
  y: number
  w: number
  h: number
}

export interface LocatedNote {
  note: Note
  track: Track
  trackId: string
  trackIndex: number
}

export interface MarqueeStateLike {
  startWorldX: number
  startWorldY: number
  currentWorldX: number
  currentWorldY: number
}

export function noteToScreenRect(
  note: Note,
  currentTick: number,
): NoteScreenRect | null {
  const state = getAppState()
  const tempoMap = state.precomputedTempoMap
  const nextNote = findNextNoteOnDisplayTrack(note)

  if (tempoMap == null) {
    return null
  }

  return getNoteScreenRect(note, {
    canvasHeight: state.viewportHeight,
    canvasWidth: state.viewportWidth,
    currentSeconds: tickToSeconds(currentTick, tempoMap),
    currentTick,
    tempoMap,
    worldZoom: state.worldZoom,
  }, nextNote)
}

export function findNoteAtScreenPoint(
  screenX: number,
  screenY: number,
  currentTick: number,
  projectData: ProjectData | null = getAppState().projectData,
): LocatedNote | null {
  if (projectData == null) {
    return null
  }

  let bestMatch: LocatedNote | null = null

  for (let trackIndex = 0; trackIndex < projectData.tracks.length; trackIndex += 1) {
    const track = projectData.tracks[trackIndex]

    for (const note of track.notes) {
      const rect = noteToScreenRect(note, currentTick)
      if (rect == null || !pointInRect(screenX, screenY, rect)) {
        continue
      }

      if (bestMatch == null || note.startTick >= bestMatch.note.startTick) {
        bestMatch = {
          note,
          track,
          trackId: track.id,
          trackIndex,
        }
      }
    }
  }

  return bestMatch
}

export function getNotesInScreenRect(
  screenRect: NoteScreenRect,
  currentTick: number,
  projectData: ProjectData | null = getAppState().projectData,
): LocatedNote[] {
  if (projectData == null) {
    return []
  }

  const notesInRect: LocatedNote[] = []

  for (let trackIndex = 0; trackIndex < projectData.tracks.length; trackIndex += 1) {
    const track = projectData.tracks[trackIndex]

    for (const note of track.notes) {
      const noteRect = noteToScreenRect(note, currentTick)
      if (noteRect == null || !rectsOverlap(screenRect, noteRect)) {
        continue
      }

      notesInRect.push({
        note,
        track,
        trackId: track.id,
        trackIndex,
      })
    }
  }

  return notesInRect
}

export function findNoteById(
  noteId: string,
  projectData: ProjectData | null = getAppState().projectData,
): LocatedNote | null {
  if (projectData == null) {
    return null
  }

  for (let trackIndex = 0; trackIndex < projectData.tracks.length; trackIndex += 1) {
    const track = projectData.tracks[trackIndex]
    const note = track.notes.find((candidate) => candidate.id === noteId)
    if (note != null) {
      return {
        note,
        track,
        trackId: track.id,
        trackIndex,
      }
    }
  }

  return null
}

export function getMarqueeWorldBounds(marquee: MarqueeStateLike): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  return {
    maxX: Math.max(marquee.startWorldX, marquee.currentWorldX),
    maxY: Math.max(marquee.startWorldY, marquee.currentWorldY),
    minX: Math.min(marquee.startWorldX, marquee.currentWorldX),
    minY: Math.min(marquee.startWorldY, marquee.currentWorldY),
  }
}

export function getMarqueeScreenRect(marquee: MarqueeStateLike): NoteScreenRect {
  const start = cameraSystem.worldToScreen(marquee.startWorldX, marquee.startWorldY)
  const current = cameraSystem.worldToScreen(marquee.currentWorldX, marquee.currentWorldY)

  const minX = Math.min(start.x, current.x)
  const minY = Math.min(start.y, current.y)
  const maxX = Math.max(start.x, current.x)
  const maxY = Math.max(start.y, current.y)

  return {
    h: maxY - minY,
    w: maxX - minX,
    x: minX,
    y: minY,
  }
}

export function drawDashedRect(
  graphics: PIXI.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  graphics.beginFill(MARQUEE_FILL_COLOR, MARQUEE_FILL_ALPHA)
  graphics.drawRect(x, y, width, height)
  graphics.endFill()

  graphics.lineStyle(1, MARQUEE_BORDER_COLOR, MARQUEE_BORDER_ALPHA)
  drawDashedLine(graphics, x, y, x + width, y)
  drawDashedLine(graphics, x + width, y, x + width, y + height)
  drawDashedLine(graphics, x + width, y + height, x, y + height)
  drawDashedLine(graphics, x, y + height, x, y)
}

export function drawSelectionOutline(graphics: PIXI.Graphics, rect: NoteScreenRect): void {
  graphics.lineStyle(SELECTED_NOTE_OUTLINE_WIDTH, SELECTED_NOTE_OUTLINE_COLOR, 1)
  graphics.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, NOTE_CORNER_RADIUS)

  const handleX = rect.x + (rect.w / 2) - (HANDLE_WIDTH / 2)

  graphics.beginFill(HANDLE_COLOR, HANDLE_ALPHA)
  graphics.drawRoundedRect(
    handleX,
    rect.y - (HANDLE_HEIGHT / 2),
    HANDLE_WIDTH,
    HANDLE_HEIGHT,
    HANDLE_CORNER_RADIUS,
  )
  graphics.drawRoundedRect(
    handleX,
    rect.y + rect.h - (HANDLE_HEIGHT / 2),
    HANDLE_WIDTH,
    HANDLE_HEIGHT,
    HANDLE_CORNER_RADIUS,
  )
  graphics.endFill()
}

function findNextNoteOnDisplayTrack(targetNote: Note): Note | null {
  const projectData = getAppState().projectData
  if (projectData == null) {
    return null
  }

  for (const track of projectData.tracks) {
    const noteIndex = track.notes.findIndex((note) => note.id === targetNote.id)
    if (noteIndex < 0) {
      continue
    }

    for (let index = noteIndex + 1; index < track.notes.length; index += 1) {
      const candidate = track.notes[index]
      if (candidate.pitch === targetNote.pitch) {
        return candidate
      }
    }

    return null
  }

  return null
}

function drawDashedLine(
  graphics: PIXI.Graphics,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  const deltaX = endX - startX
  const deltaY = endY - startY
  const length = Math.hypot(deltaX, deltaY)

  if (length === 0) {
    return
  }

  const stepX = deltaX / length
  const stepY = deltaY / length
  const segmentLength = MARQUEE_DASH_LENGTH + MARQUEE_GAP_LENGTH

  for (let distance = 0; distance < length; distance += segmentLength) {
    const dashStart = distance
    const dashEnd = Math.min(distance + MARQUEE_DASH_LENGTH, length)

    graphics.moveTo(startX + (stepX * dashStart), startY + (stepY * dashStart))
    graphics.lineTo(startX + (stepX * dashEnd), startY + (stepY * dashEnd))
  }
}

function pointInRect(x: number, y: number, rect: NoteScreenRect): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.w &&
    y >= rect.y &&
    y <= rect.y + rect.h
  )
}

function rectsOverlap(left: NoteScreenRect, right: NoteScreenRect): boolean {
  return !(
    left.x + left.w < right.x ||
    left.x > right.x + right.w ||
    left.y + left.h < right.y ||
    left.y > right.y + right.h
  )
}
