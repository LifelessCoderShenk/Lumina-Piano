export class ExportError extends Error {
  constructor(
    message: string,
    public code:
      | 'NOT_INITIALIZED'
      | 'ALREADY_RUNNING'
      | 'NO_PROJECT'
      | 'INVALID_SETTINGS'
      | 'FFMPEG_FAILED'
      | 'DISK_FULL'
      | 'CANCELLED'
      | 'AUDIO_RENDER_FAILED'
      | 'FRAME_RENDER_FAILED',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ExportError'
  }
}
