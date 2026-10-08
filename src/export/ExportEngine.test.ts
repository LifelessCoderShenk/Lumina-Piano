import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData, Track } from '../midi/types'
import type { VisualizerRenderFrameOptions, VisualizerResizeOptions } from '../renderer/VisualizerRenderer'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { secondsToTick, tickToSeconds } from '../tempo/tempoMap'
import { ExportEngine, ExportError, getVp9VideoBitrate, runFFmpeg, validateSettings } from './ExportEngine'
import type { ExportSettings } from './types'

const mockMkdir = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockRm = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockActiveVisualizerRenderer = vi.hoisted(() => ({
  current: null as null | {
    beginOfflineRender: () => void
    endOfflineRender: () => void
    getCanvas: () => HTMLCanvasElement
    getRenderLayoutContext?: () => { keyboardHeightRatio: number }
    isReady: () => boolean
    renderFrame: (tick: number, options?: VisualizerRenderFrameOptions) => void
    resize: (width: number, height: number, options?: VisualizerResizeOptions) => void
  },
}))
const mockBeginOfflineRender = vi.hoisted(() => vi.fn())
const mockEndOfflineRender = vi.hoisted(() => vi.fn())
const mockRenderFrame = vi.hoisted(() => vi.fn())
const mockResize = vi.hoisted(() => vi.fn())
const mockGetTempDir = vi.hoisted(() => vi.fn(() => Promise.resolve('C:\\temp\\lumina-export-test')))
const mockSaveFile = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockFfmpegRun = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockFsWriteFile = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockToneLoaded = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockToneOffline = vi.hoisted(() => vi.fn(async (callback: () => Promise<void>, _duration: number) => {
  await callback()
  return createMockAudioBuffer()
}))
const mockSamplerToDestination = vi.hoisted(() => vi.fn())
const mockSamplerTriggerAttackRelease = vi.hoisted(() => vi.fn())
const mockTransportCancel = vi.hoisted(() => vi.fn())
const mockSetViewportSize = vi.hoisted(() => vi.fn())
const mockMuxerAddVideoChunk = vi.hoisted(() => vi.fn())
const mockMuxerFinalize = vi.hoisted(() => vi.fn())
const mockVideoEncoderConfigure = vi.hoisted(() => vi.fn())
const mockVideoEncoderEncode = vi.hoisted(() => vi.fn())
const mockVideoEncoderFlush = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockVideoEncoderClose = vi.hoisted(() => vi.fn())
const mockVideoFrameClose = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackSeek = vi.hoisted(() => vi.fn())

vi.mock('./exportFileSystem', () => ({
  mkdirExportDir: mockMkdir,
  rmExportDir: mockRm,
  writeExportFile: mockFsWriteFile,
}))

vi.mock('webm-muxer', () => ({
  ArrayBufferTarget: class ArrayBufferTarget {
    buffer = new Uint8Array([1, 2, 3, 4]).buffer
  },
  Muxer: class Muxer {
    addVideoChunk = mockMuxerAddVideoChunk
    finalize = mockMuxerFinalize
  },
}))

vi.mock('tone', () => ({
  Frequency: vi.fn(() => ({ toNote: () => 'C4' })),
  Offline: mockToneOffline,
  Sampler: class Sampler {
    constructor(_options: object) {}

    toDestination() {
      mockSamplerToDestination()
      return {
        triggerAttackRelease: mockSamplerTriggerAttackRelease,
      }
    }
  },
  Transport: {
    cancel: mockTransportCancel,
    loop: false,
    loopEnd: 0,
    loopStart: 0,
    position: 0,
    swing: 0,
  },
  loaded: mockToneLoaded,
}))

vi.mock('../renderer/activeVisualizerRenderer', () => ({
  getActiveVisualizerRenderer: () => mockActiveVisualizerRenderer.current,
}))

vi.mock('../camera/CameraSystem', () => ({
  cameraSystem: {
    setViewportSize: mockSetViewportSize,
  },
}))

vi.mock('../playback/PlaybackEngine', () => ({
  playbackEngine: {
    pause: mockPlaybackPause,
    play: mockPlaybackPlay,
    seek: mockPlaybackSeek,
  },
}))

beforeEach(() => {
  resetStore()
  vi.clearAllMocks()
  mockActiveVisualizerRenderer.current = {
    beginOfflineRender: mockBeginOfflineRender,
    endOfflineRender: mockEndOfflineRender,
    getCanvas: () => createMockCanvas(),
    isReady: () => true,
    renderFrame: mockRenderFrame,
    resize: mockResize,
  }
  vi.stubGlobal('VideoEncoder', class VideoEncoder {
    readonly encodeQueueSize = 0
    private readonly output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void

    constructor(init: VideoEncoderInit) {
      this.output = init.output
    }

    configure(config: VideoEncoderConfig) {
      mockVideoEncoderConfigure(config)
    }

    encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
      mockVideoEncoderEncode(frame, options)
      this.output({ timestamp: frame.timestamp, type: options?.keyFrame ? 'key' : 'delta' } as EncodedVideoChunk)
    }

    flush() {
      return mockVideoEncoderFlush()
    }

    close() {
      mockVideoEncoderClose()
    }
  })
  vi.stubGlobal('VideoFrame', class VideoFrame {
    readonly timestamp: number
    readonly duration: number

    constructor(_source: CanvasImageSource, init: VideoFrameInit) {
      this.timestamp = init.timestamp ?? 0
      this.duration = init.duration ?? 0
    }

    close() {
      mockVideoFrameClose()
    }
  })
  window.electronAPI = {
    openJsonFile: vi.fn(),
    openMidiFile: vi.fn(),
    showSaveDialog: vi.fn(),
    dialog: {
      getDefaultExportPath: vi.fn(),
      openMidiFile: vi.fn(),
      showSaveDialog: vi.fn(),
    },
    export: {
      getTempDir: mockGetTempDir,
      saveFile: mockSaveFile,
    },
    ffmpeg: {
      run: mockFfmpegRun,
    },
    shell: {
      openPath: vi.fn(),
    },
    window: {
      close: vi.fn(),
      maximize: vi.fn(),
      minimize: vi.fn(),
    },
  }
  window.electronFS = {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    writeFile: mockFsWriteFile,
  }
})

afterEach(() => {
  resetStore()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('validateSettings', () => {
  it('uses the visualizer settings to derive the export format', () => {
    const visualizerSettings = {
      ...useAppStore.getState().visualizerSettings,
      aspectRatio: '9:16' as const,
      framerate: 30 as const,
      resolution: '1080p' as const,
    }

    expect(validateSettings(createSettings(), visualizerSettings)).toMatchObject({
      aspectRatio: '9:16',
      fps: 30,
      resolution: { height: 1920, width: 1080 },
      resolutionTier: '1080p',
    })
  })

  it('throws INVALID_SETTINGS for invalid visualizer settings or output path', () => {
    const visualizerSettings = useAppStore.getState().visualizerSettings
    expect(() => validateSettings(createSettings(), {
      ...visualizerSettings,
      resolution: 'portrait' as '1080p',
    })).toThrowError(ExportError)
    expect(() => validateSettings(createSettings(), {
      ...visualizerSettings,
      framerate: 24 as 30,
    })).toThrowError(ExportError)
    expect(() => validateSettings(createSettings({ outputPath: '/tmp/output.mov' }), visualizerSettings)).toThrowError(ExportError)
  })
})

describe('ExportEngine', () => {
  it('throws NO_PROJECT when no project is loaded', async () => {
    const engine = new ExportEngine()
    await expect(engine.export(createSettings())).rejects.toMatchObject({ code: 'NO_PROJECT' })
  })

  it('throws ALREADY_RUNNING when export is already in progress', async () => {
    loadProject(480)
    const engine = new ExportEngine()

    let resolveExport: (() => void) | null = null
    const exportPromise = new Promise<void>((resolve) => {
      resolveExport = resolve
    })

    mockSaveFile.mockImplementationOnce(() => exportPromise)

    const firstExport = engine.export(createSettings())
    await expect(engine.export(createSettings())).rejects.toMatchObject({ code: 'ALREADY_RUNNING' })

    resolveExport?.()
    await firstExport.catch(() => undefined)
  })

  it('sets isExporting true during export and false afterward', async () => {
    loadProject(480)
    const engine = new ExportEngine()

    const exportPromise = engine.export(createSettings())
    expect(useAppStore.getState().isExporting).toBe(true)

    await exportPromise
    expect(useAppStore.getState().isExporting).toBe(false)
  })

  it('sets isExporting false when export fails', async () => {
    loadProject(480)
    mockSaveFile.mockRejectedValueOnce(Object.assign(new Error('disk'), { code: 'ENOSPC' }))

    const engine = new ExportEngine()
    await expect(engine.export(createSettings())).rejects.toMatchObject({ code: 'DISK_FULL' })
    expect(useAppStore.getState().isExporting).toBe(false)
  })

  it('throws NOT_INITIALIZED when no active renderer is ready', async () => {
    loadProject(480)
    mockActiveVisualizerRenderer.current = null

    const engine = new ExportEngine()
    await expect(engine.export(createSettings())).rejects.toMatchObject({ code: 'NOT_INITIALIZED' })
  })

  it('suspends the active renderer for offline export and restores it before playback resumes', async () => {
    loadProject(480)
    useAppStore.setState({
      currentTick: 240,
      isPlaying: true,
      viewportHeight: 720,
      viewportWidth: 1280,
    })

    const engine = new ExportEngine()
    await engine.export(createSettings({ includeAudio: false }))

    expect(mockPlaybackPause).toHaveBeenCalledTimes(2)
    expect(mockBeginOfflineRender).toHaveBeenCalledTimes(1)
    expect(mockEndOfflineRender).toHaveBeenCalledTimes(1)
    expect(mockResize).toHaveBeenNthCalledWith(1, 1920, 1080, {
      pixelRatio: 1,
      postprocessScale: 2,
    })
    expect(mockResize).toHaveBeenNthCalledWith(2, 1280, 720)
    expect(mockPlaybackSeek).toHaveBeenCalledWith(240)
    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1)

    const beginOrder = mockBeginOfflineRender.mock.invocationCallOrder[0]
    const exportResizeOrder = mockResize.mock.invocationCallOrder[0]
    const restoreResizeOrder = mockResize.mock.invocationCallOrder[1]
    const seekOrder = mockPlaybackSeek.mock.invocationCallOrder[0]
    const endOrder = mockEndOfflineRender.mock.invocationCallOrder[0]
    const playOrder = mockPlaybackPlay.mock.invocationCallOrder[0]

    expect(beginOrder).toBeLessThan(exportResizeOrder)
    expect(restoreResizeOrder).toBeLessThan(seekOrder)
    expect(seekOrder).toBeLessThan(endOrder)
    expect(endOrder).toBeLessThan(playOrder)
  })

  it('renders the expected number of frames and seeks renderer per tick', async () => {
    const tempoMap = createTempoMap()
    loadProject(960, tempoMap)
    const ticksPerFrame = secondsToTick(1 / 30, tempoMap)
    const expectedFrames = Math.ceil(960 / ticksPerFrame)

    const engine = new ExportEngine()
    await engine.export(createSettings({ fps: 30 }))

    expect(mockRenderFrame).toHaveBeenCalledTimes(expectedFrames)
    expect(mockRenderFrame.mock.calls[0]?.[0]).toBe(0)
    expect(mockRenderFrame.mock.calls[0]?.[1]).toEqual({ animationTimeSeconds: 0 })
    expect((mockRenderFrame.mock.calls[1]?.[1] as VisualizerRenderFrameOptions | undefined)?.animationTimeSeconds)
      .toBeCloseTo(1 / 30, 6)
    expect(mockVideoEncoderEncode).toHaveBeenCalledTimes(expectedFrames)
    expect(mockSaveFile).toHaveBeenCalledTimes(1)
    expect(mockMkdir).toHaveBeenCalled()
    expect(mockRm).toHaveBeenCalled()
    expect(mockResize).toHaveBeenNthCalledWith(1, 1920, 1080, {
      pixelRatio: 1,
      postprocessScale: 2,
    })
    expect(mockResize).toHaveBeenLastCalledWith(useAppStore.getState().viewportWidth, useAppStore.getState().viewportHeight)
  })

  it('caps export postprocess supersampling for 4K renders', async () => {
    loadProject(480)
    const engine = new ExportEngine()

    await engine.export(createSettings({
      includeAudio: false,
      resolution: '4K',
    }))

    expect(mockResize).toHaveBeenNthCalledWith(1, 3840, 2160, {
      pixelRatio: 1,
      postprocessScale: 1,
    })
  })

  it('renders a vertical Create export at the full portrait resolution', async () => {
    loadProject(480)

    await new ExportEngine().export(createSettings({
      aspectRatio: '9:16',
      includeAudio: false,
      resolution: '1080p',
    }))

    expect(mockResize).toHaveBeenNthCalledWith(1, 1_080, 1_920, {
      pixelRatio: 1,
      postprocessScale: 1.125,
    })
    expect(mockRenderFrame).toHaveBeenCalled()
    expect(mockBeginOfflineRender.mock.invocationCallOrder[0])
      .toBeLessThan(mockRenderFrame.mock.invocationCallOrder[0])
    expect(mockEndOfflineRender.mock.invocationCallOrder[0])
      .toBeGreaterThan(mockRenderFrame.mock.invocationCallOrder.at(-1) ?? 0)
  })

  it('snapshots the live keyboard height ratio for the offline renderer', async () => {
    loadProject(480)
    mockActiveVisualizerRenderer.current = {
      beginOfflineRender: mockBeginOfflineRender,
      endOfflineRender: mockEndOfflineRender,
      getCanvas: () => createMockCanvas(),
      getRenderLayoutContext: () => ({ keyboardHeightRatio: 0.42 }),
      isReady: () => true,
      renderFrame: mockRenderFrame,
      resize: mockResize,
    }

    await new ExportEngine().export(createSettings({ includeAudio: false }))

    expect(mockResize).toHaveBeenNthCalledWith(1, 1920, 1080, {
      layoutContext: { keyboardHeightRatio: 0.42 },
      pixelRatio: 1,
      postprocessScale: 2,
    })
    expect(mockResize).toHaveBeenNthCalledWith(2, useAppStore.getState().viewportWidth, useAppStore.getState().viewportHeight, {
      layoutContext: { keyboardHeightRatio: 0.42 },
    })
  })

  it('scales VP9 bitrate with export pixels and framerate', () => {
    expect(getVp9VideoBitrate(1280, 720, 30)).toBe(8_000_000)
    expect(getVp9VideoBitrate(1920, 1080, 30)).toBe(9_953_280)
    expect(getVp9VideoBitrate(3840, 2160, 60)).toBe(79_626_240)
  })

  it('snapshots visualizer settings when export begins', async () => {
    loadProject(480)
    useAppStore.getState().setVisualizerSettings({
      aspectRatio: '4:3',
      framerate: 30,
      resolution: '1080p',
    })
    mockRenderFrame.mockImplementationOnce(() => {
      useAppStore.getState().setVisualizerSettings({
        aspectRatio: '1:1',
        framerate: 60,
        resolution: '4K',
      })
    })

    const engine = new ExportEngine()
    await engine.export(createSettings({ includeAudio: false }))

    expect(mockResize).toHaveBeenNthCalledWith(1, 1920, 1440, {
      pixelRatio: 1,
      postprocessScale: 1.5,
    })
    expect(mockVideoEncoderConfigure).toHaveBeenCalledWith(expect.objectContaining({
      framerate: 30,
      height: 1440,
      width: 1920,
    }))
    expect(mockRenderFrame).toHaveBeenCalledTimes(15)
  })

  it('writes zero-padded PNG filenames and updates progress', async () => {
    loadProject(480)
    const engine = new ExportEngine()
    const remainingValues: number[] = []

    engine.onProgress((progress) => {
      remainingValues.push(progress.estimatedSecondsRemaining)
    })

    await engine.export(createSettings({ fps: 30 }))

    expect(mockSaveFile.mock.calls[0]?.[0]?.outputPath).toMatch(/export\.webm$/)
    expect(remainingValues.length).toBeGreaterThan(0)
    expect(remainingValues.every((value) => Number.isFinite(value))).toBe(true)
  })

  it('cancels at the next frame boundary and cleans up temp files', async () => {
    loadProject(4_800)
    const engine = new ExportEngine()

    mockRenderFrame.mockImplementation(() => {
      engine.cancel()
    })

    await expect(engine.export(createSettings({ fps: 30 }))).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(mockRm).toHaveBeenCalled()
    expect(useAppStore.getState().isExporting).toBe(false)

    mockRenderFrame.mockReset()
    await expect(engine.export(createSettings({ fps: 30 }))).resolves.toBeUndefined()
  })

  it('skips audio rendering when includeAudio is false', async () => {
    loadProject(480)
    const engine = new ExportEngine()

    await engine.export(createSettings({ includeAudio: false }))

    expect(mockToneOffline).not.toHaveBeenCalled()
    expect(mockFfmpegRun).toHaveBeenCalled()
    const ffmpegArgs = mockFfmpegRun.mock.calls[0]?.[0] as string[]
    expect(ffmpegArgs).toContain('-c:v')
    expect(ffmpegArgs).toContain('copy')
    expect(ffmpegArgs).not.toContain('-c:a')
  })

  it('renders audio through Tone.Offline when includeAudio is enabled', async () => {
    loadProject(480, createTempoMap(), [
      {
        channel: 0,
        id: 'muted-track',
        name: 'Muted',
        notes: [createNote('muted', 0, 120, 60)],
      },
      {
        channel: 1,
        id: 'active-track',
        name: 'Active',
        notes: [createNote('active', 0, 120, 64)],
      },
    ])

    useAppStore.getState().setTrackMuted('muted-track', true)

    const engine = new ExportEngine()
    await engine.export(createSettings())

    expect(mockTransportCancel).toHaveBeenCalled()
    expect(mockToneOffline).toHaveBeenCalledTimes(1)
    expect(mockToneLoaded).toHaveBeenCalledTimes(1)
    expect(mockSamplerToDestination).toHaveBeenCalledTimes(1)
    expect(mockSamplerTriggerAttackRelease).toHaveBeenCalledTimes(1)
    expect(mockFsWriteFile).toHaveBeenCalledTimes(1)
  })

  it('keeps audio and video aligned to the same zero-offset export timeline', async () => {
    loadProject(960, createTempoMap(), [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 120, 60),
          createNote('note-2', 480, 600, 64),
        ],
      },
    ])

    const engine = new ExportEngine()
    await engine.export(createSettings())

    expect(mockRenderFrame.mock.calls[0]?.[0]).toBe(0)
    expect(mockSamplerTriggerAttackRelease.mock.calls[0]?.[2]).toBe(0)
    expect(mockSamplerTriggerAttackRelease.mock.calls[1]?.[2]).toBeCloseTo(0.5, 6)
  })

  it('uses per-frame time mapping to avoid cumulative drift at 110 BPM and 30 fps', async () => {
    const tempoMap = createTempoMap(110)
    const totalTicks = secondsToTick(60, tempoMap)
    loadProject(totalTicks, tempoMap)

    const engine = new ExportEngine()
    await engine.export(createSettings({ fps: 30, includeAudio: false }))

    const expectedFrames = Math.ceil(tickToSeconds(totalTicks, tempoMap) * 30)
    const lastFrameIndex = expectedFrames - 1
    const lastRenderedTick = mockRenderFrame.mock.calls.at(-1)?.[0]
    const expectedLastTick = secondsToTick(lastFrameIndex / 30, tempoMap)
    const oldTicksPerFrame = secondsToTick(1 / 30, tempoMap)
    const oldSteppedLastTick = Math.min(totalTicks, lastFrameIndex * oldTicksPerFrame)

    expect(lastRenderedTick).toBe(expectedLastTick)
    expect(lastRenderedTick).not.toBe(oldSteppedLastTick)
    expect(tickToSeconds(lastRenderedTick ?? 0, tempoMap)).toBeCloseTo(lastFrameIndex / 30, 2)
  })

  it('throws FFMPEG_FAILED when ffmpeg exits with a non-zero code', async () => {
    loadProject(480)
    mockFfmpegRun.mockRejectedValueOnce(new Error('ffmpeg failed'))

    const engine = new ExportEngine()
    await expect(engine.export(createSettings())).rejects.toMatchObject({ code: 'FFMPEG_FAILED' })
    expect(mockRm).toHaveBeenCalled()
  })
})

describe('runFFmpeg', () => {
  it('resolves when the ffmpeg bridge succeeds', async () => {
    await expect(runFFmpeg(['-version'])).resolves.toBeUndefined()
  })
})

type TestSettingsOverrides = Partial<ExportSettings> & {
  fps?: 30 | 60
  resolution?: '720p' | '1080p' | '4K'
  aspectRatio?: 'fit' | '16:9' | '9:16' | '1:1' | '4:3'
}

function createSettings(overrides: TestSettingsOverrides = {}): ExportSettings {
  const { aspectRatio, fps, resolution, ...exportSettings } = overrides

  if (aspectRatio != null || fps != null || resolution != null) {
    useAppStore.getState().setVisualizerSettings({
      ...(aspectRatio == null ? {} : { aspectRatio }),
      ...(fps == null ? {} : { framerate: fps }),
      ...(resolution == null ? {} : { resolution }),
    })
  }

  return {
    includeAudio: true,
    outputPath: 'C:\\temp\\export.mp4',
    ...exportSettings,
  }
}

function loadProject(
  totalTicks: number,
  tempoMap: PrecomputedTempoMap = createTempoMap(),
  tracks?: Track[],
): void {
  const projectData: ProjectData = {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks,
    tracks:
      tracks ??
      [
        {
          channel: 0,
          id: 'track-1',
          name: 'Track 1',
          notes: [createNote('note-1', 0, 120, 60)],
        },
      ],
  }

  useAppStore.getState().loadProject(projectData, tempoMap)
}

function createNote(id: string, startTick: number, visualEndTick: number, pitch: number) {
  return {
    endTick: visualEndTick,
    id,
    pitch,
    startTick,
    velocity: 100,
    visualEndTick,
  }
}

function createTempoMap(bpm = 120): PrecomputedTempoMap {
  const microsecondsPerBeat = 60_000_000 / bpm

  return {
    segments: [
      {
        bpm,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: (480 * 1_000_000) / microsecondsPerBeat,
      },
    ],
  }
}

function createMockCanvas(): HTMLCanvasElement {
  return {
    height: 1080,
    width: 1920,
  } as HTMLCanvasElement
}

function createMockAudioBuffer(): AudioBuffer {
  const channelData = new Float32Array([0.1, -0.1, 0.05, -0.05])

  return {
    duration: channelData.length / 48_000,
    getChannelData: vi.fn(() => channelData),
    length: channelData.length,
    numberOfChannels: 2,
    sampleRate: 48_000,
  } as AudioBuffer
}
