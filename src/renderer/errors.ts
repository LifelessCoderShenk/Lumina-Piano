export class RendererError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INITIALIZED' | 'CANVAS_ERROR' | 'PIXI_ERROR',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'RendererError'
  }
}
