export class SpatialIndexError extends Error {
  constructor(
    message: string,
    public code: 'NOT_BUILT' | 'INVALID_VIEWPORT' | 'INVALID_REGION',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'SpatialIndexError'
  }
}
