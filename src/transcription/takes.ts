import { createSession } from './session'
import type { CapturedNote, MediaSegment, RecordingOperation, TranscriptionInputEvent, TranscriptionSession, TranscriptionSettings } from './types'

export function spliceNotes(previous: readonly CapturedNote[], recorded: readonly CapturedNote[], operation: RecordingOperation, id: string): CapturedNote[] {
  const start = operation.startMs
  const end = operation.kind === 'replace' ? operation.endMs! : Infinity
  const kept = operation.kind === 'fresh' ? [] : previous.filter((note) => note.startMs < start || note.startMs >= end).map((note) => note.startMs < start && note.endMs > start ? { ...note, endMs: start, keyEndMs: Math.min(note.keyEndMs ?? start, start) } : note).filter((note) => note.endMs > note.startMs)
  const added = recorded.map((note) => ({ ...note, id: `${id}:${note.id}`, sourceId: `${id}:${note.sourceId ?? 'midi'}`, startMs: note.startMs + start, endMs: Math.min(end, note.endMs + start), keyEndMs: note.keyEndMs == null ? undefined : Math.min(end, note.keyEndMs + start) })).filter((note) => note.startMs < end && note.endMs > note.startMs)
  return [...kept, ...added].sort((a, b) => a.startMs - b.startMs)
}

export function spliceMedia(previous: readonly MediaSegment[], added: MediaSegment | readonly MediaSegment[] | null, operation: RecordingOperation): MediaSegment[] {
  const start = operation.startMs, end = operation.kind === 'replace' ? operation.endMs! : Infinity
  const kept: MediaSegment[] = []
  if (operation.kind !== 'fresh') for (const segment of previous) {
    const finish = segment.startMs + segment.durationMs
    if (segment.startMs < start) kept.push({ ...segment, durationMs: Math.min(finish, start) - segment.startMs })
    if (finish > end) {
      const nextStart = Math.max(segment.startMs, end)
      kept.push({ ...segment, startMs: nextStart, sourceOffsetMs: segment.sourceOffsetMs + nextStart - segment.startMs, durationMs: finish - nextStart })
    }
  }
  if (added) kept.push(...(Array.isArray(added) ? added : [added]))
  return kept.filter((segment) => segment.durationMs > 0).sort((a, b) => a.startMs - b.startMs)
}

function splicePedals(parent: TranscriptionSession | null, events: readonly TranscriptionInputEvent[], operation: RecordingOperation, id: string, duration: number): TranscriptionInputEvent[] {
  const start = operation.startMs, end = operation.kind === 'replace' ? operation.endMs! : Infinity
  const old = operation.kind === 'fresh' ? [] : (parent?.events ?? []).filter((event) => event.timestampMs < start || event.timestampMs >= end)
  const groups = new Map<string, TranscriptionInputEvent>()
  for (const event of parent?.events ?? []) if (event.type === 'controlchange' && event.controller === 64) groups.set(`${event.sourceId}:${event.channel}`, event)
  const resets = [...groups.values()].flatMap((event) => [start, ...(Number.isFinite(end) ? [end] : [])].map((timestampMs) => ({ ...event, value: 0, timestampMs })))
  const added = events.filter((event) => event.timestampMs <= duration).map((event) => ({ ...event, sourceId: `${id}:${event.sourceId ?? 'midi'}`, timestampMs: event.timestampMs + start }))
  return [...old, ...resets, ...added].sort((a, b) => a.timestampMs - b.timestampMs)
}

export function assembleTake(parent: TranscriptionSession | null, notes: readonly CapturedNote[], events: readonly TranscriptionInputEvent[], durationMs: number, settings: TranscriptionSettings, id: string, name: string, operation: RecordingOperation, media: MediaSegment | readonly MediaSegment[] | null): TranscriptionSession {
  const originalNotes = spliceNotes(parent?.originalNotes ?? [], notes, operation, id)
  const editedNotes = spliceNotes(parent?.editedNotes ?? [], notes, operation, id)
  return { ...createSession(settings), id, name, parentId: parent?.id, operation, originalNotes, editedNotes,
    events: splicePedals(parent, events, operation, id, durationMs),
    durationMs: operation.kind === 'replace' ? parent!.durationMs : operation.startMs + durationMs,
    mediaSegments: spliceMedia(parent?.mediaSegments ?? [], media, operation),
  }
}
