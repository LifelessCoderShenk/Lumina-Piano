export type { Command, PastedNote } from './Command'
export { CommandHistory } from './Command'
export { Clipboard } from './Clipboard'
export { DeleteNotesCommand } from './DeleteNotesCommand'
export { MoveNotesCommand } from './MoveNotesCommand'
export { PasteNotesCommand } from './PasteNotesCommand'
export { QuantizeNotesCommand } from './QuantizeNotesCommand'
export { ResizeNotesCommand } from './ResizeNotesCommand'
export { useCommandShortcuts } from './useCommandShortcuts'
export { CommandError } from './errors'

import { CommandHistory } from './Command'
import { Clipboard } from './Clipboard'

export const commandHistory = new CommandHistory()
export const clipboard = new Clipboard()
