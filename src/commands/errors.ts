export class CommandError extends Error {
  constructor(
    message: string,
    public code: 'NO_PROJECT' | 'INVALID_NOTE_IDS' | 'EMPTY_COMMAND',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'CommandError'
  }
}
