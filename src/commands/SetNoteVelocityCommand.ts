import type { Note } from '../midi/types'
import { type Command, cloneNote, commitProjectData, createUpdatedProjectData, describeCommand, requireProjectData, resolveNoteTargets } from './Command'

export class SetNoteVelocityCommand implements Command {
  readonly description: string
  private readonly noteIds: string[]
  private readonly before = new Map<string, Note>()
  private readonly after = new Map<string, Note>()

  constructor(noteIds: string[], velocity: number) {
    const resolved = resolveNoteTargets(noteIds)
    this.noteIds = resolved.noteIds
    this.description = describeCommand('Change velocity of', this.noteIds.length)
    const nextVelocity = Math.max(1, Math.min(127, Math.round(velocity)))
    for (const id of this.noteIds) {
      const note = resolved.targetsById.get(id)!.note
      this.before.set(id, cloneNote(note))
      this.after.set(id, { ...cloneNote(note), velocity: nextVelocity })
    }
  }
  execute(): void { this.apply(this.after) }
  undo(): void { this.apply(this.before) }
  redo(): void { this.execute() }
  private apply(notes: Map<string, Note>): void {
    commitProjectData(createUpdatedProjectData(requireProjectData(), { replacedNotesById: notes }), this.noteIds)
  }
}
