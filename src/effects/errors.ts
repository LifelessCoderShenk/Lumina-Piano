export class EffectsLayerError extends Error {
  constructor(
    message: string,
    public code: 'NOT_INITIALIZED' | 'POOL_EXHAUSTED',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'EffectsLayerError'
  }
}
