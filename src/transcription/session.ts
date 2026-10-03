import { normalizeTranscriptionSettings } from './settings'
import type { CapturedNote, TranscriptionSession, TranscriptionSettings } from './types'

export const SESSION_STORAGE_KEY = 'lumina.transcription.session.v1'
export function createSession(settings: TranscriptionSettings, notes: readonly CapturedNote[] = []): TranscriptionSession {
  return { version: 1, id: crypto.randomUUID(), savedAt: Date.now(), settings: normalizeTranscriptionSettings(settings), originalNotes: [...notes], editedNotes: [...notes], events: [], durationMs: notes.reduce((end, note) => Math.max(end, note.endMs), 0), estimatedBpm: null }
}
export function validNote(value: unknown): value is CapturedNote {
  if (value == null || typeof value !== 'object') return false
  const note = value as CapturedNote
  return typeof note.id === 'string' && Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127 && Number.isFinite(note.startMs) && note.startMs >= 0 && Number.isFinite(note.endMs) && note.endMs > note.startMs && Number.isInteger(note.channel) && Number.isFinite(note.velocity) && note.velocity > 0 && note.velocity <= 127
}
export function readSession(): TranscriptionSession | null {
  try {
    const text = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!text) return null
    const value = JSON.parse(text) as TranscriptionSession
    if (value.version !== 1 || typeof value.id !== 'string' || !Array.isArray(value.originalNotes) || !Array.isArray(value.editedNotes) || !value.originalNotes.every(validNote) || !value.editedNotes.every(validNote) || !Array.isArray(value.events)) return null
    if (new Set(value.editedNotes.map((note) => note.id)).size !== value.editedNotes.length) return null
    const events = value.events.filter((event) => event && ['noteon', 'noteoff', 'controlchange'].includes(event.type) && Number.isFinite(event.timestampMs) && event.timestampMs >= 0 && Number.isInteger(event.channel))
    return { ...value, events, settings: normalizeTranscriptionSettings(value.settings), durationMs: Math.max(Number.isFinite(value.durationMs) ? value.durationMs : 0, ...value.originalNotes.map((note) => note.endMs)), estimatedBpm: Number.isFinite(value.estimatedBpm) ? value.estimatedBpm : null }
  } catch { return null }
}
export function saveSession(session: TranscriptionSession): string | null {
  try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, savedAt: Date.now() })); return null }
  catch { return 'This take is in memory, but local recovery could not be saved. Export it before closing the app.' }
}

export interface EditSnapshot { notes: readonly CapturedNote[]; settings: TranscriptionSettings }
export interface EditHistory { past: EditSnapshot[]; present: EditSnapshot; future: EditSnapshot[] }
export function pushEdit(history: EditHistory, next: EditSnapshot): EditHistory {
  return { past: [...history.past.slice(-99), history.present], present: next, future: [] }
}
export function moveHistory(history: EditHistory, direction: 'undo' | 'redo'): EditHistory {
  if (direction === 'undo') {
    const previous = history.past.at(-1)
    return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history
  }
  const next = history.future[0]
  return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history
}
