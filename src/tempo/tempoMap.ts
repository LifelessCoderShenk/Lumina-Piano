import type { TempoEvent } from '../midi/types'

import { TempoMapError } from './errors'

export type TempoSegment = {
  startTick: number
  endTick: number
  bpm: number
  microsecondsPerBeat: number
  startSeconds: number
  ticksPerSecond: number
}

export type PrecomputedTempoMap = {
  segments: TempoSegment[]
}

export type TimeSignatureLike = {
  numerator: number
  denominator: number
}

type IndexedTempoEvent = TempoEvent & {
  originalIndex: number
}

export function buildTempoMap(
  tempoEvents: TempoEvent[],
  ticksPerQuarter: number,
): PrecomputedTempoMap {
  validateTicksPerQuarter(ticksPerQuarter)
  validateTempoEventsInput(tempoEvents)

  const normalizedEvents = normalizeTempoEvents(tempoEvents)
  if (normalizedEvents.length === 0) {
    throw new TempoMapError('Tempo map is empty after processing.', 'EMPTY_TEMPO_MAP')
  }

  const canonicalEvents = ensureTickZeroStart(normalizedEvents)
  const segments: TempoSegment[] = []

  for (let index = 0; index < canonicalEvents.length; index += 1) {
    const current = canonicalEvents[index]
    const next = canonicalEvents[index + 1]
    const previousSegment = segments[index - 1]
    const startSeconds =
      previousSegment == null
        ? 0
        : previousSegment.startSeconds +
          ticksToSecondsDelta(
            current.tick - previousSegment.startTick,
            previousSegment.ticksPerSecond,
          )

    segments.push({
      bpm: 60_000_000 / current.microsecondsPerBeat,
      endTick: next?.tick ?? Number.POSITIVE_INFINITY,
      microsecondsPerBeat: current.microsecondsPerBeat,
      startSeconds,
      startTick: current.tick,
      ticksPerSecond: (ticksPerQuarter * 1_000_000) / current.microsecondsPerBeat,
    })
  }

  return { segments }
}

export function tickToSeconds(tick: number, tempoMap: PrecomputedTempoMap): number {
  validateFiniteNumber(tick, 'tick')
  validateTempoMap(tempoMap)

  if (tick < 0) {
    return 0
  }

  const segment = findSegmentByTick(tick, tempoMap.segments)
  return segment.startSeconds + ticksToSecondsDelta(tick - segment.startTick, segment.ticksPerSecond)
}

export function secondsToTick(seconds: number, tempoMap: PrecomputedTempoMap): number {
  validateFiniteNumber(seconds, 'seconds')
  validateTempoMap(tempoMap)

  if (seconds < 0) {
    return 0
  }

  const segment = findSegmentBySeconds(seconds, tempoMap.segments)
  const tick = segment.startTick + (seconds - segment.startSeconds) * segment.ticksPerSecond
  return Math.floor(tick)
}

export function ticksToBeats(tick: number, ticksPerQuarter: number): number {
  validateFiniteNumber(tick, 'tick')
  validateTicksPerQuarter(ticksPerQuarter)

  if (tick < 0) {
    return 0
  }

  return tick / ticksPerQuarter
}

export function ticksToBars(
  tick: number,
  ticksPerQuarter: number,
  timeSignature: TimeSignatureLike,
): number {
  validateFiniteNumber(tick, 'tick')
  validateTicksPerQuarter(ticksPerQuarter)
  validateTimeSignature(timeSignature)

  if (tick < 0) {
    return 0
  }

  const quarterNotesPerBar = (timeSignature.numerator * 4) / timeSignature.denominator
  const beats = tick / ticksPerQuarter
  return Math.floor(beats / quarterNotesPerBar)
}

function normalizeTempoEvents(tempoEvents: TempoEvent[]): TempoEvent[] {
  const indexedEvents: IndexedTempoEvent[] = tempoEvents.map((event, originalIndex) => {
    if (event == null || typeof event !== 'object') {
      throw new TempoMapError('Tempo events must be objects.', 'INVALID_INPUT', {
        event,
        originalIndex,
      })
    }

    validateFiniteNumber(event.tick, `tempoEvents[${originalIndex}].tick`)
    validateFiniteNumber(
      event.microsecondsPerBeat,
      `tempoEvents[${originalIndex}].microsecondsPerBeat`,
    )

    if (event.tick < 0 || event.microsecondsPerBeat <= 0) {
      throw new TempoMapError('Tempo events must use non-negative ticks and positive tempo.', 'INVALID_INPUT', {
        event,
        originalIndex,
      })
    }

    return {
      ...event,
      originalIndex,
    }
  })

  indexedEvents.sort((left, right) => {
    if (left.tick !== right.tick) {
      return left.tick - right.tick
    }

    return left.originalIndex - right.originalIndex
  })

  const deduped: TempoEvent[] = []

  for (const event of indexedEvents) {
    const lastEvent = deduped[deduped.length - 1]
    if (lastEvent?.tick === event.tick) {
      deduped[deduped.length - 1] = {
        bpm: 60_000_000 / event.microsecondsPerBeat,
        microsecondsPerBeat: event.microsecondsPerBeat,
        tick: event.tick,
      }
      continue
    }

    deduped.push({
      bpm: 60_000_000 / event.microsecondsPerBeat,
      microsecondsPerBeat: event.microsecondsPerBeat,
      tick: event.tick,
    })
  }

  return deduped
}

function ensureTickZeroStart(tempoEvents: TempoEvent[]): TempoEvent[] {
  const firstEvent = tempoEvents[0]
  if (firstEvent.tick === 0) {
    return tempoEvents
  }

  return [
    {
      bpm: firstEvent.bpm,
      microsecondsPerBeat: firstEvent.microsecondsPerBeat,
      tick: 0,
    },
    ...tempoEvents,
  ]
}

function findSegmentByTick(tick: number, segments: TempoSegment[]): TempoSegment {
  let low = 0
  let high = segments.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const segment = segments[mid]

    if (tick < segment.startTick) {
      high = mid - 1
      continue
    }

    if (tick >= segment.endTick) {
      low = mid + 1
      continue
    }

    return segment
  }

  return segments[Math.max(0, high)]
}

function findSegmentBySeconds(seconds: number, segments: TempoSegment[]): TempoSegment {
  let low = 0
  let high = segments.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const segment = segments[mid]
    const next = segments[mid + 1]

    if (seconds < segment.startSeconds) {
      high = mid - 1
      continue
    }

    if (next != null && seconds >= next.startSeconds) {
      low = mid + 1
      continue
    }

    return segment
  }

  return segments[Math.max(0, high)]
}

function ticksToSecondsDelta(ticks: number, ticksPerSecond: number): number {
  return ticks / ticksPerSecond
}

function validateTempoEventsInput(tempoEvents: TempoEvent[]): void {
  if (!Array.isArray(tempoEvents)) {
    throw new TempoMapError('Tempo events input must be an array.', 'INVALID_INPUT', tempoEvents)
  }
}

function validateTempoMap(tempoMap: PrecomputedTempoMap): void {
  if (
    tempoMap == null ||
    !Array.isArray(tempoMap.segments) ||
    tempoMap.segments.length === 0
  ) {
    throw new TempoMapError('Tempo map is empty after processing.', 'EMPTY_TEMPO_MAP', tempoMap)
  }
}

function validateTicksPerQuarter(ticksPerQuarter: number): void {
  validateFiniteNumber(ticksPerQuarter, 'ticksPerQuarter')

  if (ticksPerQuarter <= 0) {
    throw new TempoMapError('ticksPerQuarter must be greater than zero.', 'INVALID_PPQ', {
      ticksPerQuarter,
    })
  }
}

function validateTimeSignature(timeSignature: TimeSignatureLike): void {
  if (timeSignature == null) {
    throw new TempoMapError('Time signature is required.', 'INVALID_INPUT', timeSignature)
  }

  validateFiniteNumber(timeSignature.numerator, 'timeSignature.numerator')
  validateFiniteNumber(timeSignature.denominator, 'timeSignature.denominator')

  if (timeSignature.numerator <= 0 || timeSignature.denominator <= 0) {
    throw new TempoMapError('Time signature values must be positive.', 'INVALID_INPUT', timeSignature)
  }
}

function validateFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TempoMapError(`${label} must be a finite number.`, 'INVALID_INPUT', {
      [label]: value,
    })
  }
}

export { TempoMapError }
