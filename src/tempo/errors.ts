export class TempoMapError extends Error {
  constructor(
    message: string,
    public code: 'EMPTY_TEMPO_MAP' | 'INVALID_PPQ' | 'INVALID_INPUT',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'TempoMapError'
  }
}
