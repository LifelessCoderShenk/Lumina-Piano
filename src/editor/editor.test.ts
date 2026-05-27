import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = []
    addChild(child: { parent?: Container | null }) {
      child.parent = this
      this.children.push(child)
      return child
    }

    removeChild(child: { parent?: Container | null }) {
      this.children = this.children.filter((candidate) => candidate !== child)
      child.parent = null
      return child
    }
  }

  class Graphics {
    parent: Container | null = null
    clear = vi.fn(() => this)
    lineStyle = vi.fn(() => this)
    drawRoundedRect = vi.fn(() => this)
    beginFill = vi.fn(() => this)
    endFill = vi.fn(() => this)
    drawRect = vi.fn(() => this)
    moveTo = vi.fn(() => this)
    lineTo = vi.fn(() => this)
    destroy = vi.fn()
  }

  return {
    Container,
    Graphics,
  }
})

const { cameraMock, spatialMock } = vi.hoisted(() => ({
  cameraMock: {
    getViewport: vi.fn(() => ({
      maxPitch: 127,
      maxTick: 4000,
      minPitch: 0,
      minTick: 0,
      pixelsPerPitch: 10,
      pixelsPerTick: 1,
      worldZoom: 1,
    })),
    screenToWorld: vi.fn((x: number, y: number) => ({ x, y })),
    worldToScreen: vi.fn((x: number, y: number) => ({ x, y })),
  },
  spatialMock: {
    isBuilt: vi.fn(() => true),
    getNoteAtPoint: vi.fn(),
    getNotesInRegion: vi.fn(),
  },
}))

vi.mock('../camera/CameraSystem', () => ({
  cameraSystem: cameraMock,
}))

vi.mock('../spatial/SpatialIndex', () => ({
  spatialIndex: spatialMock,
}))

import * as PIXI from 'pixi.js'

import {
  MoveNotesCommand,
  ResizeNotesCommand,
  commandHistory,
} from '../commands'
import type { Note, ProjectData } from '../midi/types'
import { KEYBOARD_HEIGHT } from '../renderer/layoutConstants'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { NoteEditorController } from './NoteEditorController'
import {
  HANDLE_HEIGHT,
  MARQUEE_DASH_LENGTH,
  drawDashedRect,
  noteToScreenRect,
} from './noteEditorHelpers'

describe('NoteEditorController', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.getState().loadProject(createProjectData(), createTempoMap())
    spatialMock.isBuilt.mockReset()
    spatialMock.isBuilt.mockReturnValue(true)
    spatialMock.getNoteAtPoint.mockReset()
    spatialMock.getNotesInRegion.mockReset()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    resetStore()
    cleanup()
    vi.restoreAllMocks()
  })

  it('click on note body selects the note and begins note drag', () => {
    const controller = initController()
    const indexedNote = createIndexedNote('note-1')
    const rect = noteToScreenRect(indexedNote.note, 0)!

    controller.onMouseDown(rect.x + (rect.w / 2), rect.y + (rect.h / 2), 0)

    expect([...useAppStore.getState().selectedNoteIds]).toEqual(['note-1'])
    expect((controller as unknown as { dragState: { mode: string } | null }).dragState?.mode).toBe('note')
  })

  it('click on empty area clears selection and begins marquee', () => {
    const controller = initController()
    useAppStore.getState().selectNotes(['note-1'])
    spatialMock.getNoteAtPoint.mockReturnValue(null)

    controller.onMouseDown(400, 300, 0)

    expect([...useAppStore.getState().selectedNoteIds]).toEqual([])
    expect((controller as unknown as { marqueeState: object | null }).marqueeState).not.toBeNull()
  })

  it('click near note top edge begins top handle drag', () => {
    const controller = initController()
    const indexedNote = createIndexedNote('note-1')
    const rect = noteToScreenRect(indexedNote.note, 0)!

    controller.onMouseDown(rect.x + (rect.w / 2), rect.y + 1, 0)

    expect((controller as unknown as { dragState: { mode: string } | null }).dragState?.mode).toBe('handle_top')
  })

  it('click near note bottom edge begins bottom handle drag', () => {
    const controller = initController()
    const indexedNote = createIndexedNote('note-1')
    const rect = noteToScreenRect(indexedNote.note, 0)!

    controller.onMouseDown(rect.x + (rect.w / 2), rect.y + rect.h - 1, 0)

    expect((controller as unknown as { dragState: { mode: string } | null }).dragState?.mode).toBe('handle_bottom')
  })

  it('ctrl+click adds to selection without clearing existing notes', () => {
    const controller = initController()
    useAppStore.getState().selectNotes(['note-1'])
    const rect = noteToScreenRect(getNote('note-2'), 0)!

    controller.onMouseDown(rect.x + 5, rect.y + 5, 0, { ctrlKey: true })

    expect([...useAppStore.getState().selectedNoteIds]).toEqual(['note-1', 'note-2'])
  })

  it('right-click on a note selects it and opens the context menu', () => {
    const controller = initController()
    const handler = vi.fn()
    controller.setContextMenuHandler(handler)
    const rect = noteToScreenRect(getNote('note-3'), 0)!

    controller.onMouseDown(rect.x + (rect.w / 2), rect.y + (rect.h / 2), 2)

    expect([...useAppStore.getState().selectedNoteIds]).toEqual(['note-3'])
    expect(handler).toHaveBeenCalledWith({
      noteIds: ['note-3'],
      x: rect.x + (rect.w / 2),
      y: rect.y + (rect.h / 2),
    })
  })

  it('mouse move during note drag computes pitch and tick deltas', () => {
    const controller = initController()
    const rect = noteToScreenRect(getNote('note-1'), 0)!

    controller.onMouseDown(rect.x + 5, rect.y + 10, 0)
    controller.onMouseMove(rect.x + 8, rect.y + 28)

    const dragState = (controller as unknown as { dragState: { accumulatedDeltaPitch: number; accumulatedDeltaTicks: number } | null }).dragState
    expect(dragState?.accumulatedDeltaPitch).toBe(3)
    expect(dragState?.accumulatedDeltaTicks).toBe(18)
  })

  it('mouse up after note drag executes MoveNotesCommand with computed delta', () => {
    const controller = initController()
    const executeSpy = vi.spyOn(commandHistory, 'execute').mockImplementation(() => {})
    const rect = noteToScreenRect(getNote('note-1'), 0)!

    controller.onMouseDown(rect.x + 4, rect.y + 10, 0)
    controller.onMouseUp(rect.x + 6, rect.y + 20)

    expect(executeSpy).toHaveBeenCalledTimes(1)
    const command = executeSpy.mock.calls[0][0]
    expect(command).toBeInstanceOf(MoveNotesCommand)
  })

  it('mouse up without drag does not execute a command', () => {
    const controller = initController()
    const executeSpy = vi.spyOn(commandHistory, 'execute').mockImplementation(() => {})
    const rect = noteToScreenRect(getNote('note-1'), 0)!

    controller.onMouseDown(rect.x + 4, rect.y + 10, 0)
    controller.onMouseUp(rect.x + 4, rect.y + 10)

    expect(executeSpy).not.toHaveBeenCalled()
  })

  it('mouse up after handle drag executes ResizeNotesCommand', () => {
    const controller = initController()
    const executeSpy = vi.spyOn(commandHistory, 'execute').mockImplementation(() => {})
    const rect = noteToScreenRect(getNote('note-1'), 0)!

    controller.onMouseDown(rect.x + (rect.w / 2), rect.y + rect.h - 1, 0)
    controller.onMouseUp(rect.x + (rect.w / 2), rect.y + rect.h + 24)

    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(executeSpy.mock.calls[0][0]).toBeInstanceOf(ResizeNotesCommand)
  })

  it('mouse move during marquee updates marquee state', () => {
    const controller = initController()
    spatialMock.getNoteAtPoint.mockReturnValue(null)

    controller.onMouseDown(100, 120, 0)
    controller.onMouseMove(180, 240)

    const marqueeState = (controller as unknown as { marqueeState: { currentWorldX: number; currentWorldY: number } | null }).marqueeState
    expect(marqueeState?.currentWorldX).toBe(180)
    expect(marqueeState?.currentWorldY).toBe(240)
  })

  it('mouse up after marquee selects notes in region', () => {
    const controller = initController()
    spatialMock.getNoteAtPoint.mockReturnValue(null)
    const note1Rect = noteToScreenRect(getNote('note-1'), 0)!
    const note2Rect = noteToScreenRect(getNote('note-2'), 0)!
    const minX = Math.min(note1Rect.x, note2Rect.x) - 4
    const minY = Math.min(note1Rect.y, note2Rect.y) - 4
    const maxX = Math.max(note1Rect.x + note1Rect.w, note2Rect.x + note2Rect.w) + 4
    const maxY = Math.max(note1Rect.y + note1Rect.h, note2Rect.y + note2Rect.h) + 4

    controller.onMouseDown(minX, minY, 0)
    controller.onMouseUp(maxX, maxY)

    expect([...useAppStore.getState().selectedNoteIds]).toEqual(['note-1', 'note-2'])
  })

  it('ctrl+marquee adds notes to existing selection', () => {
    const controller = initController()
    useAppStore.getState().selectNotes(['note-3'])
    spatialMock.getNoteAtPoint.mockReturnValue(null)
    const note1Rect = noteToScreenRect(getNote('note-1'), 0)!

    controller.onMouseDown(note1Rect.x - 2, note1Rect.y - 2, 0, { ctrlKey: true })
    controller.onMouseUp(note1Rect.x + note1Rect.w + 2, note1Rect.y + note1Rect.h + 2, { ctrlKey: true })

    expect([...useAppStore.getState().selectedNoteIds]).toEqual(['note-3', 'note-1'])
  })

  it('drawSelectionOverlay clears graphics and draws outline plus handles for each note', () => {
    const controller = initController()
    useAppStore.getState().selectNotes(['note-1', 'note-2', 'note-3'])
    const graphics = (controller as unknown as { overlayGraphics: PIXI.Graphics }).overlayGraphics
    vi.mocked(graphics.clear).mockClear()
    vi.mocked(graphics.drawRoundedRect).mockClear()

    controller.drawSelectionOverlay(0)

    expect(graphics.clear).toHaveBeenCalledTimes(1)
    expect(graphics.drawRoundedRect).toHaveBeenCalledTimes(9)
  })

  it('drawSelectionOverlay draws the marquee rectangle when active', () => {
    const controller = initController()
    spatialMock.getNoteAtPoint.mockReturnValue(null)

    controller.onMouseDown(100, 100, 0)
    controller.onMouseMove(140, 160)
    controller.drawSelectionOverlay(0)

    const graphics = (controller as unknown as { overlayGraphics: PIXI.Graphics }).overlayGraphics
    expect(graphics.drawRect).toHaveBeenCalled()
    expect(graphics.lineTo).toHaveBeenCalled()
  })
})

describe('noteToScreenRect', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.getState().loadProject(createProjectData(), createTempoMap())
  })

  afterEach(() => {
    resetStore()
    cleanup()
    vi.restoreAllMocks()
  })

  it('returns note X based on pitchToKeyX and bottom aligned to the hit line at current tick', () => {
    const note = getNote('note-2')
    const rect = noteToScreenRect(note, note.startTick)!

    expect(rect.x).toBeGreaterThan(0)
    expect(rect.y + rect.h).toBe(useAppStore.getState().viewportHeight - KEYBOARD_HEIGHT)
  })
})

describe('drawDashedRect', () => {
  it('draws dashed line segments and fill', () => {
    const graphics = new PIXI.Graphics()

    drawDashedRect(graphics, 10, 20, 60, 40)

    expect(graphics.drawRect).toHaveBeenCalledWith(10, 20, 60, 40)
    expect(graphics.lineTo).toHaveBeenCalled()
    expect(MARQUEE_DASH_LENGTH).toBeGreaterThan(0)
  })
})

function initController(): NoteEditorController {
  const controller = new NoteEditorController()
  controller.init(new PIXI.Container())
  return controller
}

function createTempoMap(): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 120,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 500_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: 960,
      },
    ],
  }
}

function createProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 2400,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 120, 60),
          createNote('note-2', 240, 360, 64),
        ],
      },
      {
        channel: 1,
        id: 'track-2',
        name: 'Track 2',
        notes: [createNote('note-3', 480, 660, 67)],
      },
    ],
  }
}

function createNote(id: string, startTick: number, endTick: number, pitch: number): Note {
  return {
    endTick,
    id,
    pitch,
    startTick,
    velocity: 100,
    visualEndTick: endTick,
  }
}

function getNote(noteId: string): Note {
  const projectData = useAppStore.getState().projectData
  if (projectData == null) {
    throw new Error('Expected project data to be loaded.')
  }

  for (const track of projectData.tracks) {
    const note = track.notes.find((candidate) => candidate.id === noteId)
    if (note != null) {
      return note
    }
  }

  throw new Error(`Expected note ${noteId} to exist.`)
}

function createIndexedNote(noteId: string) {
  const projectData = useAppStore.getState().projectData
  if (projectData == null) {
    throw new Error('Expected project data to be loaded.')
  }

  for (let trackIndex = 0; trackIndex < projectData.tracks.length; trackIndex += 1) {
    const track = projectData.tracks[trackIndex]
    const note = track.notes.find((candidate) => candidate.id === noteId)
    if (note != null) {
      return {
        note,
        trackId: track.id,
        trackIndex,
      }
    }
  }

  throw new Error(`Expected indexed note ${noteId} to exist.`)
}
