export class MidiParseError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_FILE' | 'EMPTY_FILE' | 'CORRUPT_DATA' | 'UNSUPPORTED_FORMAT',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'MidiParseError'
  }
}
