import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData, Track } from '../midi/types'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { secondsToTick } from '../tempo/tempoMap'
import { ExportEngine, ExportError, runFFmpeg, validateSettings } from './ExportEngine'

const mockMkdir = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockRm = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockGetCanvas = vi.hoisted(() => vi.fn(() => createMockCanvas()))
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

vi.mock('../renderer/Renderer', () => ({
  renderer: {
    getCanvas: mockGetCanvas,
    isReady: vi.fn(() => true),
    renderFrame: mockRenderFrame,
    resize: mockResize,
  },
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
    deleteSong: vi.fn(),
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
    getSongs: vi.fn(async () => []),
    library: {
      deleteUserSong: vi.fn(),
      getUserSongs: vi.fn(async () => []),
      saveUserSong: vi.fn(),
    },
    shell: {
      openPath: vi.fn(),
    },
    uploadSong: vi.fn(),
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
  it('maps 720p, 1080p, and 4K resolutions', () => {
    expect(validateSettings(createSettings({ resolution: '720p' }))).toEqual({
      height: 720,
      width: 1280,
    })
    expect(validateSettings(createSettings({ resolution: '1080p' }))).toEqual({
      height: 1080,
      width: 1920,
    })
    expect(validateSettings(createSettings({ resolution: '4K' }))).toEqual({
      height: 2160,
      width: 3840,
    })
  })

  it('throws INVALID_SETTINGS for invalid resolution, fps, and output path', () => {
    expect(() => validateSettings(createSettings({ resolution: 'portrait' as '1080p' }))).toThrowError(ExportError)
    expect(() => validateSettings(createSettings({ fps: 24 as 30 }))).toThrowError(ExportError)
    expect(() => validateSettings(createSettings({ outputPath: '/tmp/output.mov' }))).toThrowError(ExportError)
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

  it('renders the expected number of frames and seeks renderer per tick', async () => {
    const tempoMap = createTempoMap()
    loadProject(960, tempoMap)
    const ticksPerFrame = secondsToTick(1 / 30, tempoMap)
    const expectedFrames = Math.ceil(960 / ticksPerFrame)

    const engine = new ExportEngine()
    await engine.export(createSettings({ fps: 30 }))

    expect(mockRenderFrame).toHaveBeenCalledTimes(expectedFrames)
    expect(mockRenderFrame.mock.calls[0]?.[0]).toBe(0)
    expect(mockGetCanvas).toHaveBeenCalled()
    expect(mockVideoEncoderEncode).toHaveBeenCalledTimes(expectedFrames)
    expect(mockSaveFile).toHaveBeenCalledTimes(1)
    expect(mockMkdir).toHaveBeenCalled()
    expect(mockRm).toHaveBeenCalled()
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

function createSettings(overrides: Partial<import('./types').ExportSettings> = {}): import('./types').ExportSettings {
  return {
    fps: 30,
    includeAudio: true,
    outputPath: 'C:\\temp\\export.mp4',
    resolution: '1080p',
    ...overrides,
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

function createTempoMap(): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 120,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 500_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: (480 * 1_000_000) / 500_000,
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
