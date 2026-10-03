import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTranscriptionMedia } from './useTranscriptionMedia'
import { useTakeMedia } from './useTakeMedia'
import { normalizeTranscriptionSettings } from '../../transcription/settings'
const storage = vi.hoisted(() => ({ readMediaAsset: vi.fn(async () => null), saveMediaAsset: vi.fn(async () => undefined) }))
vi.mock('../../transcription/mediaStorage', () => storage)
const configuration = normalizeTranscriptionSettings({ bpm: 120, meter: '4/4', midiDeviceId: null, chordNamesEnabled: true, keyLabelsEnabled: false })
class Recorder {
  static isTypeSupported() { return true }
  static last: Recorder
  state = 'inactive'; mimeType = 'video/webm'
  ondataavailable?: (event: { data: Blob }) => void
  onstop?: () => void
  constructor() { Recorder.last = this }
  start() { this.state = 'recording' }
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['video']) }); queueMicrotask(() => this.onstop?.()) }
}
function stream(kind: 'video' | 'audio' = 'video') {
  const track = { kind, onended: null as null | (() => void), stop: vi.fn() }
  return { track, getTracks: () => [track], getAudioTracks: () => kind === 'audio' ? [track] : [], getVideoTracks: () => kind === 'video' ? [track] : [] }
}
let getUserMedia = vi.fn()
beforeEach(() => {
  getUserMedia = vi.fn(); storage.readMediaAsset.mockClear(); storage.saveMediaAsset.mockClear()
  vi.stubGlobal('MediaRecorder', Recorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn(async () => []), addEventListener: vi.fn(), removeEventListener: vi.fn() } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }) })

it('never requests the camera by default and tolerates permission denial', async () => {
  getUserMedia.mockRejectedValue(new Error('Permission denied'))
  const { result, rerender } = renderHook(({ settings }) => useTranscriptionMedia(settings, 'take', vi.fn()), { initialProps: { settings: configuration } })
  expect(getUserMedia).not.toHaveBeenCalled()
  rerender({ settings: { ...configuration, webcamEnabled: true } })
  await waitFor(() => expect(result.current.status).toBe('error'))
  act(() => result.current.start('notes-only'))
  await expect(result.current.stop(1000)).resolves.toBeNull()
})
it('keeps video ready when audio is denied and persists each available source independently', async () => {
  const source = stream('video')
  getUserMedia.mockResolvedValueOnce(source).mockRejectedValueOnce(new Error('Mic denied'))
  const mediaSources = [
    { id: 'camera', kind: 'video' as const, role: 'piano' as const, name: 'Piano camera', deviceId: 'camera-1', enabled: true, volume: 1, latencyMs: 0, overlay: configuration.webcamOverlay },
    { id: 'audio', kind: 'audio' as const, role: 'piano' as const, name: 'Piano audio', deviceId: 'audio-1', enabled: true, volume: 1, latencyMs: 0 },
  ]
  const { result, unmount } = renderHook(() => useTranscriptionMedia({ ...configuration, mediaSources }, 'take', vi.fn()))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(getUserMedia.mock.calls[0][0].audio).toBe(false)
  expect(getUserMedia.mock.calls[1][0].video).toBe(false)
  expect(result.current.message).toContain('Piano audio')
  act(() => result.current.start('take'))
  act(() => result.current.pause()); expect(Recorder.last.state).toBe('paused')
  act(() => result.current.resume()); expect(Recorder.last.state).toBe('recording')
  await act(async () => { await result.current.stop(1234) })
  expect(result.current.take).toMatchObject({ id: 'take:camera', inputId: 'camera', kind: 'video', durationMs: 1234 })
  expect(storage.saveMediaAsset).toHaveBeenCalledOnce()
  unmount(); expect(source.track.stop).toHaveBeenCalledOnce()
})
it('releases old device streams and reports unexpected track failure', async () => {
  const first = stream(); const second = stream(); const failure = vi.fn()
  getUserMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
  const { result, rerender } = renderHook(({ id }) => useTranscriptionMedia({ ...configuration, mediaSources: [{ id: 'camera', kind: 'video', role: 'face', name: 'Camera', deviceId: id, enabled: true, volume: 1, latencyMs: 0, overlay: configuration.webcamOverlay }] }, 'take', failure), { initialProps: { id: 'camera-a' } })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  rerender({ id: 'camera-b' })
  await waitFor(() => expect(result.current.stream).toBe(second))
  expect(first.track.stop).toHaveBeenCalledOnce()
  act(() => second.track.onended?.())
  expect(failure).toHaveBeenCalledOnce(); expect(result.current.status).toBe('error')
})
it('keeps the same camera stream while its overlay is moved', async () => {
  const camera = stream()
  getUserMedia.mockResolvedValue(camera)
  const source = { id: 'camera', kind: 'video' as const, role: 'face' as const, name: 'Camera', deviceId: 'camera-a', enabled: true, volume: 1, latencyMs: 0, overlay: { x: .1, y: .1, width: .2, crop: 0, mirror: false } }
  const { result, rerender } = renderHook(({ overlay }) => useTranscriptionMedia({ ...configuration, mediaSources: [{ ...source, overlay }] }, 'take', vi.fn()), { initialProps: { overlay: source.overlay } })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  rerender({ overlay: { ...source.overlay, x: .4, y: .3 } })
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(camera.track.stop).not.toHaveBeenCalled()
})

it('applies an audio input latency once when previewing a recorded take', async () => {
  const audio = { id: 'audio-take', inputId: 'audio', kind: 'audio' as const, blob: new Blob(['audio']), hasMicrophone: true, durationMs: 1_000 }
  storage.readMediaAsset.mockResolvedValueOnce(audio as never)
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:audio-take'), revokeObjectURL: vi.fn() })
  const settings = {
    ...configuration,
    mediaSources: [{ id: 'audio', kind: 'audio' as const, role: 'piano' as const, name: 'Piano audio', deviceId: 'audio-1', enabled: true, volume: 1, latencyMs: 100 }],
  }
  const take = {
    version: 1 as const,
    id: 'take',
    savedAt: 0,
    settings,
    originalNotes: [],
    editedNotes: [],
    events: [],
    durationMs: 1_100,
    estimatedBpm: null,
    mediaSegments: [{ sourceId: audio.id, inputId: 'audio', kind: 'audio' as const, sourceOffsetMs: 0, startMs: 0, durationMs: 1_000 }],
  }
  const { result } = renderHook(() => useTakeMedia(take, null))
  await waitFor(() => expect(result.current.ready).toBe(true))

  expect(result.current.atAll(99)).toEqual([])
  expect(result.current.atAll(150)[0]?.timeMs).toBe(50)
  expect(result.current.atAll(1_100)).toEqual([])
})
