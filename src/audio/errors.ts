export class AudioSchedulerError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INITIALIZED' | 'SAMPLE_LOAD_FAILED' | 'AUDIO_CONTEXT_ERROR',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AudioSchedulerError'
  }
}
