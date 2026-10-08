import { useEffect, useRef, useState } from 'react'
import type { WebcamOverlay as OverlaySettings } from '../../transcription/types'
import styles from './TranscriptorMode.module.css'

interface Props { stream: MediaStream | null; recordedUrl?: string | null; overlay: OverlaySettings; onChange: (overlay: OverlaySettings) => void; disabled?: boolean; timeMs?: number; playing?: boolean; microphoneVolume?: number; label?: string }
export function WebcamOverlay({ stream, recordedUrl, overlay, onChange, disabled = false, timeMs = 0, playing = false, microphoneVolume = 0, label = 'Camera' }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [parentSize, setParentSize] = useState({ width: 1280, height: 462 })
  useEffect(() => {
    const parent = host.current?.parentElement
    if (!parent) return
    const resize = () => {
      const bounds = parent.getBoundingClientRect()
      setParentSize({ width: parent.clientWidth || bounds.width || 1280, height: parent.clientHeight || bounds.height || 462 })
    }
    resize(); const observer = new ResizeObserver(resize); observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  const drag = useRef<{ x: number; y: number; pointerId: number; resize: boolean; original: OverlaySettings; width: number; height: number } | null>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.srcObject = recordedUrl ? null : stream
    if (recordedUrl) element.src = recordedUrl
    else element.removeAttribute('src')
    if (stream && !recordedUrl) void element.play().catch(() => undefined)
    return () => { element.pause(); element.srcObject = null; element.removeAttribute('src') }
  }, [stream, recordedUrl])
  useEffect(() => {
    const element = video.current
    if (!element || !recordedUrl) return
    if (Math.abs(element.currentTime - timeMs / 1000) > 0.15) element.currentTime = timeMs / 1000
    element.muted = microphoneVolume === 0
    element.volume = Math.min(1, microphoneVolume)
    if (playing) void element.play().catch(() => undefined); else element.pause()
  }, [timeMs, playing, recordedUrl, microphoneVolume])
  const width = parentSize.width * overlay.width
  const height = overlay.height == null ? Math.min(parentSize.height, width * 9 / 16) : parentSize.height * overlay.height
  return <div ref={host} className={styles.webcamOverlay} style={{ left: Math.max(0, Math.min(parentSize.width * overlay.x, parentSize.width - width)), top: Math.max(0, Math.min(parentSize.height * overlay.y, parentSize.height - height)), width, height }} onPointerDown={(event) => {
    if (disabled || event.button !== 0) return
    const parent = host.current?.parentElement?.getBoundingClientRect()
    if (!parent || parent.width <= 0 || parent.height <= 0) return
    event.preventDefault()
    drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, original: overlay, resize: false, width: parent.width, height: parent.height }
    host.current?.setPointerCapture?.(event.pointerId)
  }} onPointerMove={(event) => {
    const move = drag.current
    if (!move || move.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = (event.clientX - move.x) / move.width; const dy = (event.clientY - move.y) / move.height
    const width = move.resize ? Math.min(1, Math.max(0.15, move.original.width + dx)) : move.original.width
    const originalHeight = move.original.height ?? move.original.width * move.width * 9 / 16 / move.height
    const heightFraction = move.resize ? Math.min(1, Math.max(.12, originalHeight * width / move.original.width)) : originalHeight
    onChange({ ...move.original, width, ...(move.original.height == null && !move.resize ? {} : { height: heightFraction }), x: Math.max(0, Math.min(1 - width, move.original.x + (move.resize ? 0 : dx))), y: Math.max(0, Math.min(1 - heightFraction, move.original.y + (move.resize ? 0 : dy))) })
  }} onPointerUp={(event) => {
    if (drag.current?.pointerId !== event.pointerId) return
    host.current?.releasePointerCapture?.(event.pointerId); drag.current = null
  }} onPointerCancel={(event) => {
    if (drag.current?.pointerId !== event.pointerId) return
    host.current?.releasePointerCapture?.(event.pointerId); drag.current = null
  }}>
    <video ref={video} autoPlay={!recordedUrl} muted playsInline style={{ objectPosition: `${(overlay.cropX ?? .5) * 100}% ${(overlay.cropY ?? .5) * 100}%`, transformOrigin: `${(overlay.cropX ?? .5) * 100}% ${(overlay.cropY ?? .5) * 100}%`, transform: `scale(${1 / (1 - overlay.crop * 2)}) scaleX(${overlay.mirror ? -1 : 1})` }} />
    <button type="button" className={styles.webcamDrag} aria-label={`Move ${label}`} disabled={disabled}>{label} · drag to move</button>
    <button type="button" className={styles.webcamResize} aria-label={`Resize ${label}`} disabled={disabled} onPointerDown={(event) => {
      const parent = host.current?.parentElement?.getBoundingClientRect()
      if (!parent || event.button !== 0) return
      event.preventDefault(); event.stopPropagation()
      drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, original: overlay, resize: true, width: parent.width, height: parent.height }
      host.current?.setPointerCapture?.(event.pointerId)
    }}>↘</button>
  </div>
}
