import type { Note } from '../midi/types'
import {
  type Command,
  clampPitch,
  clampTick,
  cloneNote,
  commitProjectData,
  createUpdatedProjectData,
  describeCommand,
  requireProjectData,
  resolveNoteTargets,
} from './Command'
import { CommandError } from './errors'

export class MoveNotesCommand implements Command {
  readonly description: string

  private readonly noteIds: string[]
  private readonly beforeNotesById: Map<string, Note>
  private readonly afterNotesById: Map<string, Note>

  constructor(
    noteIds: string[],
    deltaPitch: number,
    deltaTicks: number,
  ) {
    if (deltaPitch === 0 && deltaTicks === 0) {
      throw new CommandError('Move command has no effect.', 'EMPTY_COMMAND', {
        deltaPitch,
        deltaTicks,
      })
    }

    const projectData = requireProjectData()
    const resolved = resolveNoteTargets(noteIds)

    this.noteIds = resolved.noteIds
    this.description = describeCommand('Move', this.noteIds.length)
    this.beforeNotesById = new Map<string, Note>()
    this.afterNotesById = new Map<string, Note>()

    for (const noteId of this.noteIds) {
      const target = resolved.targetsById.get(noteId)!
      const originalNote = cloneNote(target.note)
      const clampedStartTick = clampTick(target.note.startTick + deltaTicks, 0, projectData.totalTicks)
      const appliedDeltaTicks = clampedStartTick - target.note.startTick

      this.beforeNotesById.set(noteId, originalNote)
      this.afterNotesById.set(noteId, {
        ...cloneNote(target.note),
        endTick: target.note.endTick + appliedDeltaTicks,
        pitch: clampPitch(target.note.pitch + deltaPitch),
        startTick: clampedStartTick,
        visualEndTick: target.note.visualEndTick + appliedDeltaTicks,
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
