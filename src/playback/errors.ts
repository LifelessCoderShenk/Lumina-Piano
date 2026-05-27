export class PlaybackEngineError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INITIALIZED' | 'ALREADY_INITIALIZED' | 'INVALID_TICK',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'PlaybackEngineError'
  }
}
