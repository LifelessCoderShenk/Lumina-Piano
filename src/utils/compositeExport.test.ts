import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  compositeExport,
  resolveCompositeDrawPlan,
  resolveCompositeVideoBitrate,
} from './compositeExport'

const identityCameraOverlay = {
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  cropTop: 0,
  flipHorizontal: false,
  flipVertical: false,
  offsetX: 0,
  offsetY: 0,
  rotation: 0 as const,
  scale: 1,
}

const recorders: FakeMediaRecorder[] = []
const mediaRecorderStart = vi.fn()
const mediaRecorderStop = vi.fn()
const videoPlay = vi.fn(async () => undefined)
const midiSourceStart = vi.fn()
const lifecycleEvents: string[] = []
const videoPause = vi.fn()
const anchorClick = vi.fn()
const canvasCaptureStream = vi.fn()
let exportSourceVideo: HTMLVideoElement | null = null
let recorderStream: MediaStream | null = null
let recorderOptions: MediaRecorderOptions | undefined
let nextAnimationFrame: FrameRequestCallback | null = null
const videoTrack = { kind: 'video' } as MediaStreamTrack
const audioTrack = { kind: 'audio' } as MediaStreamTrack

class FakeMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: (() => void) | null = null
  onstop: (() => void) | null = null

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    recorderStream = stream
    recorderOptions = options
    recorders.push(this)
  }

  start() {
    this.state = 'recording'
    mediaRecorderStart()
  }

  stop() {
    this.state = 'inactive'
    mediaRecorderStop()
    this.ondataavailable?.({ data: new Blob(['composite']) } as BlobEvent)
    this.onstop?.()
  }
}

describe('compositeExport duration lifecycle', () => {
  beforeEach(() => {
    recorders.length = 0
    mediaRecorderStart.mockReset()
    mediaRecorderStop.mockReset()
    videoPlay.mockReset()
    videoPlay.mockImplementation(async () => {
      lifecycleEvents.push('video')
    })
    midiSourceStart.mockReset()
    lifecycleEvents.length = 0
    videoPause.mockReset()
    anchorClick.mockReset()
    canvasCaptureStream.mockReset()
    canvasCaptureStream.mockImplementation(() => ({
      getAudioTracks: () => [],
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
    }))
    exportSourceVideo = null
    recorderStream = null
    recorderOptions = undefined
    nextAnimationFrame = null

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    vi.stubGlobal('MediaStream', class MediaStream {
      constructor(private readonly tracks: MediaStreamTrack[]) {}

      getAudioTracks() {
        return this.tracks.filter((track) => track.kind === 'audio')
      }

      getVideoTracks() {
        return this.tracks.filter((track) => track.kind === 'video')
      }
    })
    vi.stubGlobal('AudioContext', class AudioContext {
      state: AudioContextState = 'running'
      currentTime = 10

      close = vi.fn(async () => undefined)
      createBufferSource = () => ({
        buffer: null as AudioBuffer | null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: (...args: [number?, number?]) => {
          lifecycleEvents.push('midi')
          midiSourceStart(...args)
        },
        stop: vi.fn(),
      })
      createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
      createMediaStreamDestination = vi.fn(() => ({
        disconnect: vi.fn(),
        stream: { getAudioTracks: () => [audioTrack] },
      }))
      resume = vi.fn(async () => undefined)
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:recording'),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextAnimationFrame = callback
      return 1
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: videoPlay })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: videoPause })
    Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: canvasCaptureStream,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({
        beginPath: vi.fn(),
        clip: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
        rect: vi.fn(),
        restore: vi.fn(),
        rotate: vi.fn(),
        save: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
      })),
    })

    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = createElement(tagName)
      if (tagName.toLowerCase() === 'video') {
        exportSourceVideo = element as HTMLVideoElement
        Object.defineProperty(element, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_METADATA })
        Object.defineProperty(element, 'duration', { configurable: true, value: 12 })
        Object.defineProperty(element, 'videoHeight', { configurable: true, value: 720 })
        Object.defineProperty(element, 'videoWidth', { configurable: true, value: 1280 })
      }
      if (tagName.toLowerCase() === 'a') {
        element.click = anchorClick
      }
      return element
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not finalize a twelve-second source at the three-second pre-roll boundary', async () => {
    const exportPromise = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'camera recording',
      { expectedDurationSeconds: 12 },
    )

    for (let index = 0; index < 4; index += 1) await Promise.resolve()
    expect(nextAnimationFrame).not.toBeNull()
    expect(mediaRecorderStart).toHaveBeenCalledTimes(1)
    expect(exportSourceVideo).not.toBeNull()
    expect(recorders).toHaveLength(1)

    exportSourceVideo!.currentTime = 3
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await Promise.resolve()
    expect(mediaRecorderStop).not.toHaveBeenCalled()

    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await exportPromise

    expect(mediaRecorderStop).toHaveBeenCalledTimes(1)
    expect(anchorClick).toHaveBeenCalledTimes(1)
  })

  it('uses the snapshotted Visualizer Settings framerate for the whole composite stream', async () => {
    const exportPromise = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'camera recording',
      { expectedDurationSeconds: 12, frameRate: 30 },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(canvasCaptureStream).toHaveBeenCalledWith(30)

    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await exportPromise
  })

  it('uses a resolution-aware high-quality bitrate instead of MediaRecorder defaults', async () => {
    const exportPromise = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'camera recording',
      { expectedDurationSeconds: 12, frameRate: 60 },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(recorderOptions?.videoBitsPerSecond).toBe(resolveCompositeVideoBitrate(1280, 720, 60))
    expect(recorderOptions?.videoBitsPerSecond).toBeGreaterThan(6_000_000)

    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await exportPromise
  })

  it.each([
    ['camera and MIDI', true, {} as AudioBuffer, 1],
    ['MIDI only', false, {} as AudioBuffer, 1],
    ['video only', false, null, 0],
  ])('muxes %s audio without changing the video track', async (_label, includeCameraAudio, midiAudioBuffer, expectedAudioTracks) => {
    const exportPromise = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'camera recording',
      {
        expectedDurationSeconds: 12,
        includeCameraAudio,
        midiAudioBuffer,
      },
    )

    for (let index = 0; index < 4; index += 1) {
      await Promise.resolve()
    }
    expect(recorderStream).not.toBeNull()
    expect(recorderStream?.getVideoTracks()).toEqual([videoTrack])
    expect(recorderStream?.getAudioTracks()).toHaveLength(expectedAudioTracks)
    if (midiAudioBuffer != null) {
      // Both sources begin on the same export master timeline. Camera Mode's
      // pre-roll is silence baked into the offline MIDI buffer, not an offset.
      expect(lifecycleEvents).toEqual(['video', 'midi'])
      expect(midiSourceStart).toHaveBeenCalledTimes(1)
    }

    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await exportPromise
  })

  it('trims or delays MIDI audio from the shared export master clock', async () => {
    const trimmedExport = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'trimmed MIDI',
      {
        expectedDurationSeconds: 12,
        midiAudioBuffer: {} as AudioBuffer,
        midiAudioSourceTimeAtExportStartSeconds: 1.25,
      },
    )
    for (let index = 0; index < 4; index += 1) await Promise.resolve()
    expect(midiSourceStart).toHaveBeenLastCalledWith(10, 1.25)
    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await trimmedExport

    midiSourceStart.mockClear()
    const delayedExport = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'delayed MIDI',
      {
        expectedDurationSeconds: 12,
        midiAudioBuffer: {} as AudioBuffer,
        midiAudioSourceTimeAtExportStartSeconds: -0.5,
      },
    )
    for (let index = 0; index < 4; index += 1) await Promise.resolve()
    expect(midiSourceStart).toHaveBeenLastCalledWith(10.5, 0)
    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await delayedExport
  })

  it('updates the shifted MIDI visual immediately before sampling each frame', async () => {
    const onBeforeDrawFrame = vi.fn()
    const exportPromise = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'shifted visuals',
      { expectedDurationSeconds: 12, onBeforeDrawFrame },
    )
    for (let index = 0; index < 4; index += 1) await Promise.resolve()
    expect(nextAnimationFrame).not.toBeNull()
    exportSourceVideo!.currentTime = 4.25
    nextAnimationFrame?.(0)
    expect(onBeforeDrawFrame).toHaveBeenCalledWith(4.25)

    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await exportPromise
  })

  it('reports an audio warning while still saving a video when audio mixing is unavailable', async () => {
    const onWarning = vi.fn()
    vi.stubGlobal('AudioContext', undefined)
    const exportPromise = compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'camera recording',
      {
        expectedDurationSeconds: 12,
        midiAudioBuffer: {} as AudioBuffer,
        onWarning,
      },
    )

    for (let index = 0; index < 4; index += 1) {
      await Promise.resolve()
    }
    expect(onWarning).toHaveBeenCalledWith('Audio could not be added to this export; the video was saved without audio.')
    expect(recorderStream?.getAudioTracks()).toHaveLength(0)

    exportSourceVideo!.currentTime = 12
    exportSourceVideo!.dispatchEvent(new Event('ended'))
    await exportPromise
  })

  it('rejects cleanly when export playback cannot start', async () => {
    await expect(compositeExport(
      new Blob(['recording']),
      document.createElement('canvas'),
      'camera recording',
      {
        expectedDurationSeconds: 12,
        onBeforeExportStart: async () => { throw new Error('Playback could not start') },
      },
    )).rejects.toThrow('Playback could not start')

    expect(mediaRecorderStop).toHaveBeenCalledTimes(1)
  })
})

describe('resolveCompositeDrawPlan', () => {
  it('keeps the default composition regions unchanged', () => {
    expect(resolveCompositeDrawPlan(identityCameraOverlay, 1280, 720, 1280, 720)).toMatchObject({
      camera: {
        destinationHeight: 288,
        destinationY: 432,
        sourceCrop: { height: 720, left: 0, top: 0, width: 1280 },
      },
      visualizer: { height: 432, offsetX: 0, offsetY: 0, scale: 1 },
    })
  })

  it('uses cover fitting so rotated camera footage fills its clipped destination', () => {
    const plan = resolveCompositeDrawPlan({
      ...identityCameraOverlay,
      flipHorizontal: true,
      rotation: 90,
    }, 1280, 720, 1280, 720)

    expect(plan).not.toBeNull()
    const rotatedWidth = plan!.camera.sourceCrop.height * plan!.camera.coverScale
    const rotatedHeight = plan!.camera.sourceCrop.width * plan!.camera.coverScale
    expect(rotatedWidth).toBeGreaterThanOrEqual(1280)
    expect(rotatedHeight).toBeGreaterThanOrEqual(plan!.camera.destinationHeight)
    expect(plan!.camera.transform).toEqual({ flipX: -1, flipY: 1, rotationDegrees: 90 })
  })

  it('scales visualizer offsets from preview CSS pixels into native export pixels', () => {
    expect(resolveCompositeDrawPlan({
      ...identityCameraOverlay,
      offsetX: 50,
      offsetY: 10,
      scale: 1.25,
    }, 1280, 720, 1280, 720, {
      visualizerHeight: 216,
      visualizerWidth: 640,
    })?.visualizer).toEqual({
      height: 432,
      offsetX: 100,
      offsetY: 20,
      scale: 1.25,
    })
  })

  it('uses the expanded live visualizer height rather than forcing a 60/40 export', () => {
    const plan = resolveCompositeDrawPlan(
      identityCameraOverlay,
      1280,
      720,
      1280,
      720,
      { compositeHeight: 600, visualizerHeight: 480, visualizerWidth: 1000 },
    )

    expect(plan?.visualizer.height).toBe(576)
    expect(plan?.camera.destinationY).toBe(576)
    expect(plan?.camera.destinationHeight).toBe(144)
  })

  it('moves the keyboard boundary down and keeps the camera below it for vertical social video', () => {
    const plan = resolveCompositeDrawPlan(
      identityCameraOverlay,
      1920,
      1080,
      1080,
      1920,
      { compositeHeight: 1000, visualizerHeight: 600, visualizerWidth: 1000 },
    )

    expect(plan?.visualizer.height).toBe(1248)
    expect(plan?.camera.destinationY).toBe(1248)
    expect(plan?.camera.destinationHeight).toBe(672)
  })
})
