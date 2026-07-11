import { tickToSeconds, type PrecomputedTempoMap } from '../tempo/tempoMap'

interface TickSpanLike {
  endTick: number
  startTick: number
}

export function getNoteDurationMs(
  note: TickSpanLike,
  tempoMap: PrecomputedTempoMap,
): number {
  return Math.max(100, (tickToSeconds(note.endTick, tempoMap) - tickToSeconds(note.startTick, tempoMap)) * 1000)
}
