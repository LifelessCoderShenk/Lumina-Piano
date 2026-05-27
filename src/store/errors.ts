export class StoreError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_PROJECT' | 'INVALID_COLOR' | 'INVALID_STATE',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'StoreError'
  }
}
