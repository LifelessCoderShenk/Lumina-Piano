import { useEffect, useMemo, useRef, useState } from 'react'

import { createRecordingMediaRecorder } from '../shared/mediaRecorderMimeType'
import { useMediaRecording } from '../shared/useMediaRecording'
import { readMediaAsset, saveMediaAsset, type RecordedMediaAsset } from '../../transcription/mediaStorage'
import type { TranscriptionMediaSource, TranscriptionSettings } from '../../transcription/types'

export interface TranscriptionMediaSourceState {
  source: TranscriptionMediaSource
  stream: MediaStream | null
  status: 'off' | 'loading' | 'ready' | 'error'
  message: string | null
}

interface ActiveRecorder {
  recorder: MediaRecorder
  completion: Promise<RecordedMediaAsset | null>
}

export function useTranscriptionMedia(settings: TranscriptionSettings, sessionId: string, onFailure: () => void) {
  const { stopMediaStream } = useMediaRecording()
  const configurationKey = JSON.stringify(settings.mediaSources?.length
    ? settings.mediaSources.map(({ id, kind, role, deviceId, enabled }) => ({ id, kind, role, deviceId, enabled }))
    : [settings.webcamEnabled, settings.cameraDeviceId, settings.microphoneEnabled, settings.microphoneDeviceId])
  // The serialized device configuration prevents an unrelated notation change from reopening every camera and microphone.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const configuredSources = useMemo(() => resolveConfiguredSources(settings), [configurationKey])
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [sourceStates, setSourceStates] = useState<TranscriptionMediaSourceState[]>([])
  const [assets, setAssets] = useState<RecordedMediaAsset[]>([])
  const [finalizing, setFinalizing] = useState(false)
  const streamRefs = useRef(new Map<string, MediaStream>())
  const recorders = useRef(new Map<string, ActiveRecorder>())
  const durationRef = useRef(0)
  const mounted = useRef(true)
  const failureRef = useRef(onFailure); failureRef.current = onFailure

  useEffect(() => {
    let canceled = false
    const refresh = async () => {
      try {
        const available = await navigator.mediaDevices?.enumerateDevices()
        if (!canceled) setDevices(available ?? [])
      } catch { /* Device labels may remain hidden until the user grants access. */ }
    }
    void refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => { canceled = true; navigator.mediaDevices?.removeEventListener?.('devicechange', refresh) }
  }, [sourceStates.length])

  useEffect(() => {
    let canceled = false
    const owned = new Map<string, MediaStream>()
    const release = () => {
      owned.forEach((stream) => {
        stream.getTracks().forEach((track) => { track.onended = null })
        stopMediaStream(stream)
      })
      owned.clear()
      streamRefs.current.clear()
    }
    setSourceStates(configuredSources.map((source) => ({ source, stream: null, status: source.enabled ? 'loading' : 'off', message: null })))
    if (!configuredSources.some((source) => source.enabled)) return release
    void Promise.all(configuredSources.map(async (source) => {
      if (!source.enabled) return
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Media device access is unavailable.')
        const stream = await navigator.mediaDevices.getUserMedia(source.kind === 'video'
          ? { video: { width: { ideal: source.role === 'piano' ? 1920 : 1280 }, height: { ideal: source.role === 'piano' ? 1080 : 720 }, frameRate: { ideal: 30, max: 30 }, ...(source.deviceId ? { deviceId: { exact: source.deviceId } } : {}) }, audio: false }
          : { video: false, audio: source.deviceId ? { deviceId: { exact: source.deviceId }, echoCancellation: source.role !== 'piano', noiseSuppression: source.role !== 'piano', autoGainControl: source.role !== 'piano' } : true })
        if (canceled) { stopMediaStream(stream); return }
        if (source.kind === 'video' && typeof stream.getVideoTracks === 'function') stream.getVideoTracks().forEach((track) => { try { track.contentHint = 'motion' } catch { /* Optional browser hint. */ } })
        owned.set(source.id, stream); streamRefs.current.set(source.id, stream)
        stream.getTracks().forEach((track) => { track.onended = () => {
          if (canceled) return
          streamRefs.current.delete(source.id)
          setSourceStates((current) => current.map((entry) => entry.source.id === source.id ? { ...entry, status: 'error', message: `${source.name} disconnected.` } : entry))
          failureRef.current()
        } })
        setSourceStates((current) => current.map((entry) => entry.source.id === source.id ? { ...entry, stream, status: 'ready', message: null } : entry))
      } catch (error) {
        if (!canceled) setSourceStates((current) => current.map((entry) => entry.source.id === source.id ? { ...entry, status: 'error', message: `${source.name}: ${error instanceof Error ? error.message : 'device unavailable'}` } : entry))
      }
    }))
    return () => { canceled = true; release() }
  }, [configuredSources, stopMediaStream])

  useEffect(() => {
    let canceled = false
    const savedIds = (settings.mediaSources ?? []).map((source) => `${sessionId}:${source.id}`)
    void Promise.all(savedIds.map((id) => readMediaAsset(id).catch(() => null))).then((saved) => {
      if (!canceled) setAssets(saved.filter((asset): asset is RecordedMediaAsset => asset != null))
    })
    return () => { canceled = true }
  }, [sessionId, settings.mediaSources])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recorders.current.forEach(({ recorder }) => { if (recorder.state !== 'inactive') recorder.stop() })
    }
  }, [])

  const start = (takeId: string) => {
    setAssets([]); recorders.current.clear(); durationRef.current = 0
    configuredSources.forEach((source) => {
      const stream = streamRefs.current.get(source.id)
      if (!source.enabled || !stream) return
      try {
        const recorder = createRecordingMediaRecorder(stream)
        const chunks: Blob[] = []
        const completion = new Promise<RecordedMediaAsset | null>((resolve) => {
          recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
          recorder.onerror = () => { resolve(null); failureRef.current() }
          recorder.onstop = () => {
            const asset: RecordedMediaAsset | null = chunks.length ? {
              id: `${takeId}:${source.id}`, inputId: source.id, kind: source.kind, name: source.name,
              blob: new Blob(chunks, { type: recorder.mimeType || (source.kind === 'video' ? 'video/webm' : 'audio/webm') }),
              hasMicrophone: source.kind === 'audio', durationMs: durationRef.current,
            } : null
            if (asset) void saveMediaAsset(asset).catch(() => undefined)
            resolve(asset)
          }
        })
        recorders.current.set(source.id, { recorder, completion })
        recorder.start(1000)
      } catch { /* One unsupported device must not block notes or other sources. */ }
    })
  }

  const stop = async (durationMs: number): Promise<RecordedMediaAsset[] | null> => {
    durationRef.current = durationMs
    const active = [...recorders.current.values()]
    if (!active.length) return null
    setFinalizing(true)
    active.forEach(({ recorder }) => { if (recorder.state !== 'inactive') recorder.stop() })
    const saved = (await Promise.all(active.map(({ completion }) => completion))).filter((asset): asset is RecordedMediaAsset => asset != null)
    recorders.current.clear()
    if (mounted.current) { setAssets(saved); setFinalizing(false) }
    return saved
  }

  const ready = sourceStates.filter((entry) => entry.status === 'ready')
  const enabledCount = configuredSources.filter((source) => source.enabled).length
  const video = ready.find((entry) => entry.source.kind === 'video')
  const messages = sourceStates.map((entry) => entry.message).filter(Boolean)
  return {
    devices, sourceStates, assets, enabledCount, readyCount: ready.length, finalizing,
    status: enabledCount === 0 ? 'off' as const : ready.length > 0 ? 'ready' as const : sourceStates.some((entry) => entry.status === 'loading') ? 'loading' as const : 'error' as const,
    message: messages.join(' ') || null,
    stream: video?.stream ?? null,
    take: assets.find((asset) => asset.kind === 'video') ?? assets[0] ?? null,
    start, stop,
    pause: () => recorders.current.forEach(({ recorder }) => { if (recorder.state === 'recording') recorder.pause() }),
    resume: () => recorders.current.forEach(({ recorder }) => { if (recorder.state === 'paused') recorder.resume() }),
    clear: () => { setAssets([]); recorders.current.clear() },
  }
}

function resolveConfiguredSources(settings: TranscriptionSettings): readonly TranscriptionMediaSource[] {
  if (settings.mediaSources?.length) return settings.mediaSources
  if (!settings.webcamEnabled) return []
  return [
    { id: 'legacy-camera', kind: 'video', role: 'face', name: 'Face camera', deviceId: settings.cameraDeviceId ?? null, enabled: true, volume: 1, latencyMs: 0, overlay: settings.webcamOverlay },
    ...(settings.microphoneEnabled ? [{ id: 'legacy-microphone', kind: 'audio' as const, role: 'microphone' as const, name: 'Microphone', deviceId: settings.microphoneDeviceId ?? null, enabled: true, volume: settings.microphoneVolume ?? 1, latencyMs: 0 }] : []),
  ]
}
