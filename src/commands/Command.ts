import type { Note, ProjectData, Track } from '../midi/types'
import { getAppState, useAppStore } from '../store/store'
import { CommandError } from './errors'

export interface Command {
  readonly description: string
  execute(): void
  undo(): void
  redo(): void
}

export interface PastedNote {
  trackId: string
  pitch: number
  startTick: number
  endTick: number
  visualEndTick: number
  velocity: number
}

export interface NoteTarget {
  trackId: string
  trackIndex: number
  track: Track
  note: Note
}

export class CommandHistory {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private readonly maxHistorySize: number

  constructor(maxHistorySize = 100) {
    this.maxHistorySize = Math.max(1, Math.floor(maxHistorySize))
  }

  execute(command: Command): void {
    command.execute()
    this.undoStack.push(command)
    this.redoStack = []

    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift()
    }
  }

  undo(): void {
    const command = this.undoStack.pop()
    if (command == null) {
      return
    }

    command.undo()
    this.redoStack.push(command)
  }

  redo(): void {
    const command = this.redoStack.pop()
    if (command == null) {
      return
    }

    command.redo()
    this.undoStack.push(command)

    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift()
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  getUndoLabel(): string | null {
    const command = this.undoStack[this.undoStack.length - 1]
    return command == null ? null : `Undo ${command.description}`
  }

  getRedoLabel(): string | null {
    const command = this.redoStack[this.redoStack.length - 1]
    return command == null ? null : `Redo ${command.description}`
  }
}

export function requireProjectData(): ProjectData {
  const projectData = getAppState().projectData
  if (projectData == null) {
    throw new CommandError('No project is loaded.', 'NO_PROJECT')
  }

  return projectData
}

export function resolveNoteTargets(noteIds: string[]): {
  noteIds: string[]
  targetsById: Map<string, NoteTarget>
} {
  const projectData = requireProjectData()

  if (!Array.isArray(noteIds) || noteIds.length === 0) {
    throw new CommandError('Command requires at least one note id.', 'EMPTY_COMMAND', noteIds)
  }

  const uniqueNoteIds = [...new Set(noteIds)]
  const targetsById = new Map<string, NoteTarget>()

  projectData.tracks.forEach((track, trackIndex) => {
    for (const note of track.notes) {
      if (uniqueNoteIds.includes(note.id)) {
        targetsById.set(note.id, {
          note,
          track,
          trackId: track.id,
          trackIndex,
        })
      }
    }
  })

  if (targetsById.size !== uniqueNoteIds.length) {
    const missingNoteIds = uniqueNoteIds.filter((noteId) => !targetsById.has(noteId))
    throw new CommandError('One or more note ids were not found.', 'INVALID_NOTE_IDS', {
      missingNoteIds,
      noteIds,
    })
  }

  return {
    noteIds: uniqueNoteIds,
    targetsById,
  }
}

export function commitProjectData(
  projectData: ProjectData,
  selectedNoteIds?: string[],
): void {
  const selectedIds = selectedNoteIds == null ? undefined : [...selectedNoteIds]

  useAppStore.getState().batchUpdate((state) => {
    state.projectData = projectData
    state.isProjectLoaded = true
    state.currentTick = Math.min(state.currentTick, projectData.totalTicks)

    if (selectedIds != null) {
      state.selectedNoteIds = new Set(selectedIds)
    }

    if (state.hoveredNoteId != null && !noteExists(projectData, state.hoveredNoteId)) {
      state.hoveredNoteId = null
    }
  })
}

export function cloneNote(note: Note): Note {
  return {
    endTick: note.endTick,
    id: note.id,
    pitch: note.pitch,
    startTick: note.startTick,
    velocity: note.velocity,
    visualEndTick: note.visualEndTick,
  }
}

export function createUpdatedProjectData(
  projectData: ProjectData,
  options: {
    deletedNoteIds?: Set<string>
    replacedNotesById?: Map<string, Note>
    insertedNotesByTrackId?: Map<string, Note[]>
  },
): ProjectData {
  const deletedNoteIds = options.deletedNoteIds ?? new Set<string>()
  const replacedNotesById = options.replacedNotesById ?? new Map<string, Note>()
  const insertedNotesByTrackId = options.insertedNotesByTrackId ?? new Map<string, Note[]>()

  const tracks = projectData.tracks.map((track) => {
    const insertedNotes = insertedNotesByTrackId.get(track.id)
    let changed = insertedNotes != null && insertedNotes.length > 0
    const notes: Note[] = []

    for (const note of track.notes) {
      if (deletedNoteIds.has(note.id)) {
        changed = true
        continue
      }

      const replacement = replacedNotesById.get(note.id)
      if (replacement != null) {
        notes.push(cloneNote(replacement))
        changed = true
      } else {
        notes.push(note)
      }
    }

    if (insertedNotes != null && insertedNotes.length > 0) {
      for (const note of insertedNotes) {
        notes.push(cloneNote(note))
      }
    }

    if (!changed) {
      return track
    }

    notes.sort(compareNotes)
    return {
      ...track,
      notes,
    }
  })

  return {
    ...projectData,
    totalTicks: recalculateTotalTicks(tracks),
    tracks,
  }
}

export function compareNotes(left: Note, right: Note): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick
  }

  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch
  }

  return left.id.localeCompare(right.id)
}

export function recalculateTotalTicks(tracks: Track[]): number {
  let totalTicks = 0

  for (const track of tracks) {
    for (const note of track.notes) {
      totalTicks = Math.max(totalTicks, note.visualEndTick)
    }
  }

  return totalTicks
}

export function clampPitch(pitch: number): number {
  return Math.min(127, Math.max(0, Math.round(pitch)))
}

export function clampTick(tick: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  return Math.min(max, Math.max(min, Math.floor(tick)))
}

export function describeCommand(verb: string, count: number, suffix = 'note'): string {
  const normalizedCount = Math.max(1, Math.floor(count))
  const noun = normalizedCount === 1 ? suffix : `${suffix}s`
  return `${verb} ${normalizedCount} ${noun}`
}

function noteExists(projectData: ProjectData, noteId: string): boolean {
  return projectData.tracks.some((track) => track.notes.some((note) => note.id === noteId))
}
