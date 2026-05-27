import type { Note } from '../midi/types'
import { cloneNote, resolveNoteTargets, type PastedNote } from './Command'
import { PasteNotesCommand } from './PasteNotesCommand'

interface CopiedNote {
  trackId: string
  note: Note
}

export class Clipboard {
  private copiedNotes: CopiedNote[] = []

  copy(noteIds: string[]): void {
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      this.copiedNotes = []
      return
    }

    const resolved = resolveNoteTargets(noteIds)
    const copiedNotes = resolved.noteIds.map((noteId) => {
      const target = resolved.targetsById.get(noteId)!
      return {
        note: cloneNote(target.note),
        trackId: target.trackId,
      }
    })

    const earliestStartTick = Math.min(...copiedNotes.map((copiedNote) => copiedNote.note.startTick))
    this.copiedNotes = copiedNotes.map((copiedNote) => ({
      note: {
        ...copiedNote.note,
        endTick: copiedNote.note.endTick - earliestStartTick,
        startTick: copiedNote.note.startTick - earliestStartTick,
        visualEndTick: copiedNote.note.visualEndTick - earliestStartTick,
      },
      trackId: copiedNote.trackId,
    }))
  }

  paste(targetTick: number): PasteNotesCommand | null {
    if (!this.hasContent()) {
      return null
    }

    const notes: PastedNote[] = this.copiedNotes.map((copiedNote) => ({
      endTick: copiedNote.note.endTick,
      pitch: copiedNote.note.pitch,
      startTick: copiedNote.note.startTick,
      trackId: copiedNote.trackId,
      velocity: copiedNote.note.velocity,
      visualEndTick: copiedNote.note.visualEndTick,
    }))

    return new PasteNotesCommand(notes, targetTick)
  }

  hasContent(): boolean {
    return this.copiedNotes.length > 0
  }

  clear(): void {
    this.copiedNotes = []
  }
}
