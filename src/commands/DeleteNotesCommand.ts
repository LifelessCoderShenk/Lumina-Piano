import type { Note } from '../midi/types'
import {
  type Command,
  cloneNote,
  commitProjectData,
  createUpdatedProjectData,
  describeCommand,
  requireProjectData,
  resolveNoteTargets,
} from './Command'

type DeletedNoteSnapshot = {
  trackId: string
  note: Note
}

export class DeleteNotesCommand implements Command {
  readonly description: string

  private readonly noteIds: string[]
  private readonly deletedNoteIds: Set<string>
  private readonly deletedNotesByTrackId: Map<string, Note[]>

  constructor(noteIds: string[]) {
    const resolved = resolveNoteTargets(noteIds)

    this.noteIds = resolved.noteIds
    this.description = describeCommand('Delete', this.noteIds.length)
    this.deletedNoteIds = new Set(this.noteIds)
    this.deletedNotesByTrackId = new Map<string, Note[]>()

    for (const noteId of this.noteIds) {
      const target = resolved.targetsById.get(noteId)!
      const notesForTrack = this.deletedNotesByTrackId.get(target.trackId) ?? []
      notesForTrack.push(cloneNote(target.note))
      this.deletedNotesByTrackId.set(target.trackId, notesForTrack)
    }
  }

  execute(): void {
    const updatedProjectData = createUpdatedProjectData(requireProjectData(), {
      deletedNoteIds: this.deletedNoteIds,
    })

    commitProjectData(updatedProjectData, [])
  }

  undo(): void {
    const insertedNotesByTrackId = new Map<string, Note[]>()

    for (const [trackId, notes] of this.deletedNotesByTrackId) {
      insertedNotesByTrackId.set(trackId, notes.map((note) => cloneNote(note)))
    }

    const updatedProjectData = createUpdatedProjectData(requireProjectData(), {
      insertedNotesByTrackId,
    })

    commitProjectData(updatedProjectData, this.noteIds)
  }

  redo(): void {
    this.execute()
  }
}
