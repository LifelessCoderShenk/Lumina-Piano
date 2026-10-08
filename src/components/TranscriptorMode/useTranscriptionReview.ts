import { useEffect, useRef, useState } from 'react'
import { renderTranscriptionAudio } from '../../transcription/exportTranscription'
import type { CapturedNote } from '../../transcription/types'

export function useTranscriptionReview(notes: readonly CapturedNote[], durationMs: number, volume: number) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [timeMs, setTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const context = useRef<AudioContext | null>(null)
  const gain = useRef<GainNode | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const buffer = useRef<AudioBuffer | null>(null)
  const clock = useRef({ offset: 0, start: 0 })
  const run = useRef(0)
  const duration = Math.max(durationMs, ...notes.map((note) => note.endMs), 0) + 1000
  const stopSource = () => { if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); source.current = null } }
  const pause = () => {
    run.current++
    if (source.current && context.current) { clock.current.offset = Math.min(duration, clock.current.offset + (context.current.currentTime - clock.current.start) * 1000); setTime(clock.current.offset) }
    stopSource(); setPlaying(false); setLoading(false)
  }
  useEffect(() => {
    run.current++; stopSource(); buffer.current = null; clock.current.offset = 0; setTime(0); setPlaying(false); setLoading(false)
  }, [notes, durationMs])
  useEffect(() => { if (gain.current) gain.current.gain.value = volume }, [volume])
  useEffect(() => () => { run.current++; stopSource(); void context.current?.close() }, [])
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (context.current) setTime(Math.min(duration, clock.current.offset + (context.current.currentTime - clock.current.start) * 1000))
    }, 50)
    return () => window.clearInterval(timer)
  }, [playing, duration])
  const play = async () => {
    const token = ++run.current
    setLoading(true); setError(null)
    try {
      context.current ??= new AudioContext()
      await context.current.resume()
      const rendered = buffer.current ?? await renderTranscriptionAudio(notes, duration / 1000)
      if (run.current !== token) return
      buffer.current = rendered
      if (clock.current.offset >= duration - 20) clock.current.offset = 0
      gain.current ??= context.current.createGain(); gain.current.gain.value = volume
      gain.current.disconnect(); gain.current.connect(context.current.destination)
      const next = context.current.createBufferSource(); next.buffer = buffer.current; next.connect(gain.current)
      clock.current.start = context.current.currentTime
      next.start(0, clock.current.offset / 1000); source.current = next; setPlaying(true)
      next.onended = () => { source.current = null; clock.current.offset = duration; setTime(duration); setPlaying(false) }
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Preview audio unavailable.') }
    finally { if (run.current === token) setLoading(false) }
  }
  return { playing, loading, timeMs, duration, error, pause,
    toggle: () => { if (playing || loading) pause(); else void play() },
    seek: (time: number) => { const resume = playing; pause(); clock.current.offset = Math.min(duration, Math.max(0, time)); setTime(clock.current.offset); if (resume) void play() },
  }
}
