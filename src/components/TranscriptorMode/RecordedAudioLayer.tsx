import { useEffect, useRef } from 'react'

interface Props {
  url: string
  timeMs: number
  playing: boolean
  volume: number
}

/** Keeps recorded piano/microphone audio on the same review clock as the score. */
export function RecordedAudioLayer({ url, timeMs, playing, volume }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const element = audio.current
    if (!element) return
    if (Math.abs(element.currentTime - timeMs / 1000) > 0.15) element.currentTime = Math.max(0, timeMs / 1000)
    element.volume = Math.min(1, Math.max(0, volume))
    element.muted = volume <= 0
    if (playing) void element.play().catch(() => undefined)
    else element.pause()
  }, [playing, timeMs, volume])
  return <audio ref={audio} src={url} preload="auto" />
}
