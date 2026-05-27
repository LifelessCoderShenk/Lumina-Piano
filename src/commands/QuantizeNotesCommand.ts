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
import { CommandError } from './errors'

export class QuantizeNotesCommand implements Command {
  readonly description: string

  private readonly noteIds: string[]
  private readonly beforeNotesById: Map<string, Note>
  private readonly afterNotesById: Map<string, Note>

  constructor(
    noteIds: string[],
    gridTicks: number,
  ) {
    if (!Number.isFinite(gridTicks) || gridTicks <= 0) {
      throw new CommandError('Quantize grid must be greater than zero.', 'EMPTY_COMMAND', {
        gridTicks,
      })
    }

    const resolved = resolveNoteTargets(noteIds)

    this.noteIds = resolved.noteIds
    this.description = `Quantize ${this.noteIds.length} ${this.noteIds.length === 1 ? 'note' : 'notes'}`
    this.beforeNotesById = new Map<string, Note>()
    this.afterNotesById = new Map<string, Note>()

    for (const noteId of this.noteIds) {
      const target = resolved.targetsById.get(noteId)!
      const originalNote = cloneNote(target.note)
      const quantizedStartTick = Math.round(target.note.startTick / gridTicks) * gridTicks
      const deltaTicks = quantizedStartTick - target.note.startTick

      this.beforeNotesById.set(noteId, originalNote)
      this.afterNotesById.set(noteId, {
        ...cloneNote(target.note),
        endTick: target.note.endTick + deltaTicks,
        startTick: quantizedStartTick,
        visualEndTick: target.note.visualEndTick + deltaTicks,
      })
    }
  }

  execute(): void {
    this.apply(this.afterNotesById)
  }

  undo(): void {
    this.apply(this.beforeNotesById)
  }

  redo(): void {
    this.execute()
  }

  private apply(replacedNotesById: Map<string, Note>): void {
    const updatedProjectData = createUpdatedProjectData(requireProjectData(), {
      replacedNotesById,
    })

    commitProjectData(updatedProjectData, this.noteIds)
  }
}
