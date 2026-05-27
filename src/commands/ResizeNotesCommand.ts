import type { Note } from '../midi/types'
import {
  type Command,
  clampTick,
  cloneNote,
  commitProjectData,
  createUpdatedProjectData,
  describeCommand,
  requireProjectData,
  resolveNoteTargets,
} from './Command'

export class ResizeNotesCommand implements Command {
  readonly description: string

  private readonly noteIds: string[]
  private readonly beforeNotesById: Map<string, Note>
  private readonly afterNotesById: Map<string, Note>

  constructor(
    noteIds: string[],
    deltaStartTicks: number,
    deltaEndTicks: number,
  ) {
    const projectData = requireProjectData()
    const resolved = resolveNoteTargets(noteIds)

    this.noteIds = resolved.noteIds
    this.description = describeCommand('Resize', this.noteIds.length)
    this.beforeNotesById = new Map<string, Note>()
    this.afterNotesById = new Map<string, Note>()

    for (const noteId of this.noteIds) {
      const target = resolved.targetsById.get(noteId)!
      const originalNote = cloneNote(target.note)
      const nextEndTick = clampTick(
        target.note.endTick + deltaEndTicks,
        1,
        projectData.totalTicks,
      )
      const nextStartTick = clampTick(
        target.note.startTick + deltaStartTicks,
        0,
        nextEndTick - 1,
      )
      const appliedEndDelta = nextEndTick - target.note.endTick
      const nextVisualEndTick = clampTick(
        target.note.visualEndTick + appliedEndDelta,
        nextStartTick + 1,
        projectData.totalTicks,
      )

      this.beforeNotesById.set(noteId, originalNote)
      this.afterNotesById.set(noteId, {
        ...cloneNote(target.note),
        endTick: Math.max(nextStartTick + 1, nextEndTick),
        startTick: nextStartTick,
        visualEndTick: Math.max(nextStartTick + 1, nextVisualEndTick),
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
