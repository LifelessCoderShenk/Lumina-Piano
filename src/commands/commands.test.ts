import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Note, ProjectData, Track } from '../midi/types'
import { spatialIndex } from '../spatial/SpatialIndex'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import {
  Clipboard,
  CommandHistory,
  DeleteNotesCommand,
  MoveNotesCommand,
  PasteNotesCommand,
  QuantizeNotesCommand,
  ResizeNotesCommand,
  clipboard,
  CommandError,
  commandHistory,
} from './index'

describe('CommandHistory', () => {
  it('execute() runs command and pushes to undoStack', () => {
    const history = new CommandHistory()
    const command = createMockCommand('Move 1 note')

    history.execute(command)

    expect(command.execute).toHaveBeenCalledTimes(1)
    expect(history.canUndo()).toBe(true)
    expect(history.getUndoLabel()).toBe('Undo Move 1 note')
  })

  it('execute() clears redoStack and new branch replaces redo history', () => {
    const history = new CommandHistory()
    const firstCommand = createMockCommand('Move 1 note')
    const secondCommand = createMockCommand('Delete 1 note')
    const branchCommand = createMockCommand('Paste 1 note')

    history.execute(firstCommand)
    history.execute(secondCommand)
    history.undo()
    expect(history.canRedo()).toBe(true)

    history.execute(branchCommand)

    expect(history.canRedo()).toBe(false)
    expect(history.getUndoLabel()).toBe('Undo Paste 1 note')
  })

  it('undo() and redo() move commands between stacks', () => {
    const history = new CommandHistory()
    const command = createMockCommand('Resize 1 note')

    history.execute(command)
    history.undo()

    expect(command.undo).toHaveBeenCalledTimes(1)
    expect(history.canRedo()).toBe(true)
    expect(history.getRedoLabel()).toBe('Redo Resize 1 note')

    history.redo()

    expect(command.redo).toHaveBeenCalledTimes(1)
    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)
  })

  it('clear() empties both stacks', () => {
    const history = new CommandHistory()
    history.execute(createMockCommand('Move 1 note'))
    history.undo()

    history.clear()

    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
    expect(history.getUndoLabel()).toBeNull()
    expect(history.getRedoLabel()).toBeNull()
  })

  it('drops the oldest commands when maxHistorySize is exceeded', () => {
    const history = new CommandHistory(2)
    const first = createMockCommand('Move 1 note')
    const second = createMockCommand('Resize 1 note')
    const third = createMockCommand('Delete 1 note')

    history.execute(first)
    history.execute(second)
    history.execute(third)

    history.undo()
    history.undo()

    expect(third.undo).toHaveBeenCalledTimes(1)
    expect(second.undo).toHaveBeenCalledTimes(1)
    expect(first.undo).not.toHaveBeenCalled()
    expect(history.canUndo()).toBe(false)
  })
})

describe('MoveNotesCommand', () => {
  it('moves note pitch and ticks and supports undo/redo', () => {
    loadProject(createProjectData())
    const command = new MoveNotesCommand(['note-1'], 2, 120)

    command.execute()

    let note = getNote('note-1')
    expect(note.pitch).toBe(62)
    expect(note.startTick).toBe(120)
    expect(note.endTick).toBe(240)
    expect(note.visualEndTick).toBe(240)

    command.undo()
    note = getNote('note-1')
    expect(note.pitch).toBe(60)
    expect(note.startTick).toBe(0)
    expect(note.endTick).toBe(120)
    expect(note.visualEndTick).toBe(120)

    command.redo()
    note = getNote('note-1')
    expect(note.pitch).toBe(62)
    expect(note.startTick).toBe(120)
  })

  it('clamps pitch and startTick and moves multiple notes together', () => {
    loadProject(createProjectData())

    const command = new MoveNotesCommand(['note-1', 'note-2'], -80, -200)
    command.execute()

    expect(getNote('note-1').pitch).toBe(0)
    expect(getNote('note-1').startTick).toBe(0)
    expect(getNote('note-2').startTick).toBe(10)
  })

  it('throws EMPTY_COMMAND when both deltas are zero', () => {
    loadProject(createProjectData())

    expect(() => new MoveNotesCommand(['note-1'], 0, 0)).toThrowError(CommandError)
    expect(() => new MoveNotesCommand(['note-1'], 0, 0)).toThrowError(/no effect/i)
  })

  it('rebuilds the spatial index after execute and undo', () => {
    loadProject(createProjectData())
    const buildSpy = vi.spyOn(spatialIndex, 'build')

    const command = new MoveNotesCommand(['note-1'], 1, 120)
    command.execute()
    command.undo()

    expect(buildSpy).toHaveBeenCalledTimes(2)
  })
})

describe('ResizeNotesCommand', () => {
  it('changes startTick and endTick while enforcing minimum duration', () => {
    loadProject(createProjectData())
    const command = new ResizeNotesCommand(['note-1'], 20, 80)

    command.execute()

    let note = getNote('note-1')
    expect(note.startTick).toBe(20)
    expect(note.endTick).toBe(200)
    expect(note.visualEndTick).toBe(200)

    command.undo()
    note = getNote('note-1')
    expect(note.startTick).toBe(0)
    expect(note.endTick).toBe(120)
  })

  it('enforces minimum duration of one tick', () => {
    loadProject(createProjectData())
    const command = new ResizeNotesCommand(['note-1'], 200, -200)

    command.execute()

    const note = getNote('note-1')
    expect(note.endTick).toBeGreaterThan(note.startTick)
    expect(note.endTick - note.startTick).toBe(1)
  })
})

describe('DeleteNotesCommand', () => {
  it('removes notes from correct tracks and restores them on undo', () => {
    loadProject(createProjectData())
    const command = new DeleteNotesCommand(['note-1', 'note-3'])

    command.execute()

    expect(findNote('note-1')).toBeUndefined()
    expect(findNote('note-3')).toBeUndefined()
    expect([...useAppStore.getState().selectedNoteIds]).toEqual([])

    command.undo()

    expect(getNote('note-1').trackId).toBe('track-1')
    expect(getNote('note-3').trackId).toBe('track-2')
    expect([...useAppStore.getState().selectedNoteIds]).toEqual(['note-1', 'note-3'])
  })

  it('rebuilds spatial index after delete and undo', () => {
    loadProject(createProjectData())
    const buildSpy = vi.spyOn(spatialIndex, 'build')

    const command = new DeleteNotesCommand(['note-1'])
    command.execute()
    command.undo()

    expect(buildSpy).toHaveBeenCalledTimes(2)
  })
})

describe('PasteNotesCommand', () => {
  it('inserts notes at targetTick with new UUIDs and undo removes them', () => {
    loadProject(createProjectData())
    const command = new PasteNotesCommand([
      {
        endTick: 120,
        pitch: 72,
        startTick: 0,
        trackId: 'track-1',
        velocity: 110,
        visualEndTick: 120,
      },
      {
        endTick: 180,
        pitch: 75,
        startTick: 60,
        trackId: 'track-2',
        velocity: 90,
        visualEndTick: 180,
      },
    ], 480)

    command.execute()

    const selectedIds = [...useAppStore.getState().selectedNoteIds]
    expect(selectedIds).toHaveLength(2)
    expect(selectedIds.every((noteId) => !['note-1', 'note-2', 'note-3'].includes(noteId))).toBe(true)

    const pastedNotes = selectedIds.map((noteId) => getNote(noteId))
    expect(pastedNotes[0].startTick).toBe(480)
    expect(pastedNotes[1].startTick).toBe(540)

    command.undo()

    expect([...useAppStore.getState().selectedNoteIds]).toEqual([])
    selectedIds.forEach((noteId) => {
      expect(findNote(noteId)).toBeUndefined()
    })
  })
})

describe('QuantizeNotesCommand', () => {
  it('snaps note start ticks and preserves duration', () => {
    loadProject(createProjectData())
    const command = new QuantizeNotesCommand(['note-2'], 120)

    command.execute()

    let note = getNote('note-2')
    expect(note.startTick).toBe(240)
    expect(note.endTick - note.startTick).toBe(120)

    command.undo()
    note = getNote('note-2')
    expect(note.startTick).toBe(210)
    expect(note.endTick).toBe(330)
  })

  it('is valid even when a note is already on the grid', () => {
    loadProject(createProjectData())
    const command = new QuantizeNotesCommand(['note-1'], 120)

    command.execute()

    const note = getNote('note-1')
    expect(note.startTick).toBe(0)
    expect(note.endTick).toBe(120)
  })
})

describe('Clipboard', () => {
  it('stores notes with track ids and reports content presence', () => {
    loadProject(createProjectData())
    const testClipboard = new Clipboard()

    expect(testClipboard.hasContent()).toBe(false)

    testClipboard.copy(['note-1', 'note-3'])

    expect(testClipboard.hasContent()).toBe(true)
    const pasteCommand = testClipboard.paste(960)
    expect(pasteCommand).toBeInstanceOf(PasteNotesCommand)
  })

  it('returns null when empty and clear() empties content', () => {
    const testClipboard = new Clipboard()

    expect(testClipboard.paste(0)).toBeNull()

    loadProject(createProjectData())
    testClipboard.copy(['note-1'])
    testClipboard.clear()

    expect(testClipboard.hasContent()).toBe(false)
    expect(testClipboard.paste(0)).toBeNull()
  })

  it('replaces previous content on multiple copy() calls', () => {
    loadProject(createProjectData())
    const testClipboard = new Clipboard()

    testClipboard.copy(['note-1'])
    const firstPaste = testClipboard.paste(0)
    testClipboard.copy(['note-3'])
    const secondPaste = testClipboard.paste(0)

    expect(firstPaste).toBeInstanceOf(PasteNotesCommand)
    expect(secondPaste).toBeInstanceOf(PasteNotesCommand)
  })
})

describe('Error cases', () => {
  it('throws NO_PROJECT when no project is loaded', () => {
    expect(() => new MoveNotesCommand(['missing'], 1, 0)).toThrowError(CommandError)
    expect(() => new MoveNotesCommand(['missing'], 1, 0)).toThrowError(/No project/i)
  })

  it('throws EMPTY_COMMAND when noteIds are empty', () => {
    loadProject(createProjectData())
    expect(() => new DeleteNotesCommand([])).toThrowError(CommandError)
  })

  it('throws INVALID_NOTE_IDS when a note id is missing', () => {
    loadProject(createProjectData())
    expect(() => new ResizeNotesCommand(['missing-note'], 0, 10)).toThrowError(CommandError)
  })
})

beforeEach(() => {
  resetStore()
  commandHistory.clear()
  clipboard.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  resetStore()
  commandHistory.clear()
  clipboard.clear()
})

function createMockCommand(description: string) {
  return {
    description,
    execute: vi.fn(),
    redo: vi.fn(),
    undo: vi.fn(),
  }
}

function loadProject(projectData: ProjectData): void {
  useAppStore.getState().loadProject(projectData, createTempoMap())
}

function createProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 120, 60),
          createNote('note-2', 210, 330, 64),
        ],
      },
      {
        channel: 1,
        id: 'track-2',
        name: 'Track 2',
        notes: [
          createNote('note-3', 360, 540, 67),
        ],
      },
    ],
  }
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

function findNote(noteId: string) {
  const projectData = useAppStore.getState().projectData
  if (projectData == null) {
    return undefined
  }

  for (const track of projectData.tracks) {
    const note = track.notes.find((candidate) => candidate.id === noteId)
    if (note != null) {
      return {
        ...note,
        trackId: track.id,
      }
    }
  }

  return undefined
}

function getNote(noteId: string) {
  const note = findNote(noteId)
  if (note == null) {
    throw new Error(`Expected note ${noteId} to exist.`)
  }

  return note
}
