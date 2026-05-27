import {
  type Command,
  type PastedNote,
  clampPitch,
  clampTick,
  cloneNote,
  commitProjectData,
  createUpdatedProjectData,
  describeCommand,
  requireProjectData,
} from './Command'
import { CommandError } from './errors'

export class PasteNotesCommand implements Command {
  readonly description: string

  private readonly insertedNotesByTrackId: Map<string, ReturnType<typeof cloneNote>[]>
  private readonly pastedNoteIds: string[]

  constructor(
    notes: PastedNote[],
    targetTick: number,
  ) {
    const projectData = requireProjectData()

    if (!Array.isArray(notes) || notes.length === 0) {
      throw new CommandError('Paste command requires notes.', 'EMPTY_COMMAND', notes)
    }

    const trackIds = new Set(projectData.tracks.map((track) => track.id))
    const earliestStartTick = Math.min(...notes.map((note) => note.startTick))
    const normalizedTargetTick = clampTick(targetTick, 0)

    this.insertedNotesByTrackId = new Map()
    this.pastedNoteIds = []
    this.description = describeCommand('Paste', notes.length)

    for (const note of notes) {
      if (!trackIds.has(note.trackId)) {
        throw new CommandError('Paste command references a missing track.', 'INVALID_NOTE_IDS', note)
      }

      const nextNote = {
        endTick: normalizedTargetTick + (note.endTick - earliestStartTick),
        id: globalThis.crypto.randomUUID(),
        pitch: clampPitch(note.pitch),
        startTick: normalizedTargetTick + (note.startTick - earliestStartTick),
        velocity: note.velocity,
        visualEndTick: normalizedTargetTick + (note.visualEndTick - earliestStartTick),
      }

      const notesForTrack = this.insertedNotesByTrackId.get(note.trackId) ?? []
      notesForTrack.push(nextNote)
      this.insertedNotesByTrackId.set(note.trackId, notesForTrack)
      this.pastedNoteIds.push(nextNote.id)
    }
  }

  execute(): void {
    const updatedProjectData = createUpdatedProjectData(requireProjectData(), {
      insertedNotesByTrackId: this.insertedNotesByTrackId,
    })

    commitProjectData(updatedProjectData, this.pastedNoteIds)
  }

  undo(): void {
    const updatedProjectData = createUpdatedProjectData(requireProjectData(), {
      deletedNoteIds: new Set(this.pastedNoteIds),
    })

    commitProjectData(updatedProjectData, [])
  }

  redo(): void {
    this.execute()
  }
}
