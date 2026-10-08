import { renderTranscriptionAudio } from './exportTranscription'
import type { CapturedNote } from './types'

/** Map the scheduled audio boundary to the timestamp domain used by MIDI events. */
export class LeadInPlayback {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private generation = 0
  stop(): void {
    this.generation++
    if (this.source) { try { this.source.stop() } catch { /* Finished. */ } this.source.disconnect(); this.source = null }
    const context = this.context; this.context = null
    if (context) void context.close()
  }
  async prepare(notes: readonly CapturedNote[], startMs: number, endMs: number, volume: number): Promise<{ startAtMs: number; endAtMs: number; play: () => void } | null> {
    this.stop(); const token = this.generation
    const context = new AudioContext(); this.context = context
    await context.resume()
    const buffer = await renderTranscriptionAudio(notes, endMs / 1000)
    if (token !== this.generation) return null
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = buffer; gain.gain.value = volume
    source.connect(gain).connect(context.destination); this.source = source
    const at = context.currentTime + .1
    const startAtMs = performance.now() + (at - context.currentTime) * 1000
    return { startAtMs, endAtMs: startAtMs + endMs - startMs, play: () => { if (token === this.generation) source.start(at, startMs / 1000, (endMs - startMs) / 1000) } }
  }
}
