import type { CapturedNote, TranscriptionInputEvent } from './types'

export interface CaptureMidiMessage {
  readonly sourceId?: string
  readonly type: 'noteon' | 'noteoff'
  readonly pitch: number
  readonly velocity: number
  readonly channel: number
  readonly timestampMs: number
}
type OpenNote = Omit<CapturedNote, 'endMs'>

/** One performance clock for MIDI, pointer input, pedal events and paused video. */
export class LiveTranscriptionCapture {
  private nextId = 0
  private origin: number | null = null
  private pausedAt: number | null = null
  private pausedMs = 0
  private duration = 0
  private completed: CapturedNote[] = []
  private cached: readonly CapturedNote[] | null = null
  private readonly open = new Map<string, OpenNote[]>()
  private readonly sustained = new Map<string, OpenNote[]>()
  private readonly pedals = new Set<string>()
  private readonly raw: TranscriptionInputEvent[] = []

  start(timestampMs: number): void { this.clear(); this.origin = timestampMs }
  clear(): void {
    this.origin = null; this.pausedAt = null; this.pausedMs = 0; this.duration = 0; this.nextId = 0
    this.completed = []; this.cached = null; this.open.clear(); this.sustained.clear(); this.pedals.clear(); this.raw.length = 0
  }
  elapsed(timestampMs: number): number {
    return this.origin == null ? this.duration : Math.max(0, (this.pausedAt ?? timestampMs) - this.origin - this.pausedMs)
  }
  get activeNoteCount(): number { return [...this.open.values()].reduce((n, notes) => n + notes.length, 0) }
  get sustainDown(): boolean { return this.pedals.size > 0 }
  events(): readonly TranscriptionInputEvent[] { return [...this.raw] }

  receive(message: CaptureMidiMessage | TranscriptionInputEvent): void {
    if (this.origin == null || this.pausedAt != null) return
    const time = this.elapsed(message.timestampMs)
    const group = `${message.sourceId ?? 'midi'}:${message.channel}`
    this.raw.push({ ...message, timestampMs: time })
    if (message.type === 'controlchange') {
      if (message.controller === 64) {
        if ((message.value ?? 0) >= 64) this.pedals.add(group)
        else { this.pedals.delete(group); this.releaseSustained(group, time) }
      } else if (message.controller === 120 || message.controller === 123) {
        this.closeHeld(message.timestampMs, message.sourceId ?? 'midi')
      }
      return
    }
    if (message.pitch == null) return
    const key = `${group}:${message.pitch}`
    if (message.type === 'noteon' && (message.velocity ?? 0) > 0) {
      const tails = this.sustained.get(group) ?? []
      tails.filter((note) => note.pitch === message.pitch).forEach((note) => this.complete(note, time))
      this.sustained.set(group, tails.filter((note) => note.pitch !== message.pitch))
      const queue = this.open.get(key) ?? []
      queue.push({ id: `captured-${this.nextId++}`, pitch: message.pitch, velocity: message.velocity ?? 100, channel: message.channel, startMs: time, sourceId: message.sourceId })
      this.open.set(key, queue)
    } else {
      const queue = this.open.get(key)
      const note = queue?.shift()
      if (queue?.length === 0) this.open.delete(key)
      if (note == null) return
      if (this.pedals.has(group)) {
        const held = this.sustained.get(group) ?? []
        held.push({ ...note, keyEndMs: Math.max(note.startMs + 1, time) }); this.sustained.set(group, held)
      } else this.complete(note, time)
    }
  }

  /** Flush a disconnected source (or every source) without stopping the take. */
  closeHeld(timestampMs: number, sourceId?: string): void {
    const time = this.elapsed(timestampMs)
    for (const [key, notes] of this.open) {
      if (sourceId != null && !key.startsWith(`${sourceId}:`)) continue
      for (const note of notes) {
        this.complete(note, time)
        this.raw.push({ type: 'noteoff', pitch: note.pitch, velocity: 0, channel: note.channel, sourceId: note.sourceId, timestampMs: time })
      }
      this.open.delete(key)
    }
    for (const group of new Set([...this.pedals, ...this.sustained.keys()])) {
      if (sourceId != null && !group.startsWith(`${sourceId}:`)) continue
      this.releaseSustained(group, time)
      if (this.pedals.delete(group)) {
        const separator = group.lastIndexOf(':')
        this.raw.push({ type: 'controlchange', controller: 64, value: 0, sourceId: group.slice(0, separator), channel: Number(group.slice(separator + 1)), timestampMs: time })
      }
    }
  }
  pause(timestampMs: number): void {
    if (this.origin == null || this.pausedAt != null) return
    this.closeHeld(timestampMs); this.pausedAt = timestampMs
  }
  resume(timestampMs: number): void {
    if (this.pausedAt == null) return
    this.pausedMs += Math.max(0, timestampMs - this.pausedAt); this.pausedAt = null
  }
  stop(timestampMs: number): readonly CapturedNote[] {
    if (this.origin != null) { this.closeHeld(timestampMs); this.duration = this.elapsed(timestampMs); this.origin = null; this.pausedAt = null }
    return this.notes()
  }
  notes(): readonly CapturedNote[] {
    return this.cached ??= [...this.completed].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
  }
  preview(timestampMs: number): readonly CapturedNote[] {
    const held = [...this.open.values(), ...this.sustained.values()].flat()
    if (held.length === 0) return this.notes()
    const time = this.elapsed(timestampMs)
    return [...this.completed, ...held.map((note) => ({ ...note, endMs: Math.max(note.startMs + 1, time) }))].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
  }
  private complete(note: OpenNote, time: number): void {
    this.completed.push({ ...note, endMs: Math.max(note.startMs + 1, time) }); this.cached = null
  }
  private releaseSustained(group: string, time: number): void {
    this.sustained.get(group)?.forEach((note) => this.complete(note, time)); this.sustained.delete(group)
  }
}
