export class CameraError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INITIALIZED' | 'INVALID_ZOOM' | 'INVALID_VIEWPORT',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'CameraError'
  }
}
