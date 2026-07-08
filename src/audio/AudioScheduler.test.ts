import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Note, ProjectData, Track } from '../midi/types'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { AudioScheduler, AudioSchedulerError } from './AudioScheduler'

const mockTriggerAttackRelease = vi.hoisted(() => vi.fn())
const mockReleaseAll = vi.hoisted(() => vi.fn())
const mockTransportCancel = vi.hoisted(() => vi.fn())
const mockTransportStart = vi.hoisted(() => vi.fn())
const mockTransportStop = vi.hoisted(() => vi.fn())
const mockToneNow = vi.hoisted(() => vi.fn(() => 0))
const mockToneLoaded = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockToneStart = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockSamplerDispose = vi.hoisted(() => vi.fn())
const mockToDestination = vi.hoisted(() => vi.fn(function (this: MockSamplerInstance) {
  return this
}))
const mockFrequencyToFrequency = vi.hoisted(() => vi.fn(() => 261.63))
const mockFrequencyToNote = vi.hoisted(() => vi.fn(() => 'C4'))
const mockToneContext = vi.hoisted(() => ({
  state: 'running' as 'running' | 'suspended',
}))

type MockSamplerInstance = {
  triggerAttackRelease: typeof mockTriggerAttackRelease
  releaseAll: typeof mockReleaseAll
  toDestination: typeof mockToDestination
  dispose: typeof mockSamplerDispose
  loaded: boolean
  volume: { value: number }
}

const MockSampler = vi.hoisted(() =>
  vi.fn(function (
    this: MockSamplerInstance,
    options?: {
      baseUrl?: string
      onload?: () => void
      onerror?: (error: unknown) => void
    },
  ) {
    this.triggerAttackRelease = mockTriggerAttackRelease
    this.releaseAll = mockReleaseAll
    this.toDestination = mockToDestination
    this.dispose = mockSamplerDispose
    this.loaded = true
    this.volume = { value: 0 }

    queueMicrotask(() => {
      options?.onload?.()
    })

    return this
  }),
)

vi.mock('tone', () => ({
  Frequency: vi.fn(() => ({
    toFrequency: mockFrequencyToFrequency,
    toNote: mockFrequencyToNote,
  })),
  Sampler: MockSampler,
  Transport: {
    cancel: mockTransportCancel,
    position: 0,
    start: mockTransportStart,
    stop: mockTransportStop,
  },
  context: mockToneContext,
  loaded: mockToneLoaded,
  now: mockToneNow,
  start: mockToneStart,
}))

beforeEach(() => {
  resetStore()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    return globalThis.setTimeout(() => {
      callback(16)
    }, 0) as unknown as number
  })
  mockToneNow.mockReturnValue(0)
  mockFrequencyToFrequency.mockReturnValue(261.63)
  mockFrequencyToNote.mockReturnValue('C4')
  mockToneContext.state = 'running'
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetStore()
})

describe('AudioScheduler initialization', () => {
  it('creates Tone.Sampler with the Salamander base URL and becomes initialized after samples load', async () => {
    const scheduler = new AudioScheduler()

    await scheduler.init()

    expect(MockSampler).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
      }),
    )
    expect(mockToneLoaded).toHaveBeenCalled()
    expect(() => scheduler.start()).not.toThrow()

    scheduler.destroy()
  })

  it('throws NOT_INITIALIZED when start() is called before init()', () => {
    const scheduler = new AudioScheduler()

    expect(() => scheduler.start()).toThrow(AudioSchedulerError)

    try {
      scheduler.start()
    } catch (error: unknown) {
      expect((error as AudioSchedulerError).code).toBe('NOT_INITIALIZED')
    }
  })

  it('throws SAMPLE_LOAD_FAILED when sample loading reports an error', async () => {
    MockSampler.mockImplementationOnce(function (
      this: MockSamplerInstance,
      options?: { onerror?: (error: unknown) => void },
    ) {
      this.triggerAttackRelease = mockTriggerAttackRelease
      this.releaseAll = mockReleaseAll
      this.toDestination = mockToDestination
      this.dispose = mockSamplerDispose
      this.volume = { value: 0 }

      queueMicrotask(() => {
        options?.onerror?.(new Error('network failure'))
      })

      return this
    })

    const scheduler = new AudioScheduler()

    await expect(scheduler.init()).rejects.toMatchObject({
      code: 'SAMPLE_LOAD_FAILED',
    })
  })
})

describe('start() / stop()', () => {
  it('starts and stops the scheduling interval and releases active audio', async () => {
    const scheduler = await setupScheduler()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')

    scheduler.start()
    const intervalId = intervalSpy.mock.results.at(-1)?.value
    expect(intervalId).toBeDefined()

    scheduler.stop()

    expect(clearSpy).toHaveBeenCalledWith(intervalId)
    expect(mockReleaseAll).toHaveBeenCalled()
    expect(mockTransportCancel).toHaveBeenCalled()

    scheduler.destroy()
  })

  it('restarts scheduling correctly after stop()', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 0, 480, 60, 100),
    ])

    useAppStore.getState().setIsPlaying(true)
    scheduler.start()
    vi.advanceTimersByTime(25)
    const firstCallCount = mockTriggerAttackRelease.mock.calls.length

    scheduler.stop()
    mockTriggerAttackRelease.mockClear()

    scheduler.start()
    useAppStore.getState().setIsPlaying(true)
    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease.mock.calls.length).toBeGreaterThanOrEqual(firstCallCount)

    scheduler.destroy()
  })
})

describe('playNotes()', () => {
  it('calls triggerAttackRelease for each note with the expected frequency and duration', async () => {
    const scheduler = await setupScheduler()

    mockFrequencyToFrequency
      .mockReturnValueOnce(261.63)
      .mockReturnValueOnce(329.63)

    scheduler.playNotes([
      { durationMs: 250, pitch: 60 },
      { durationMs: 500, pitch: 64 },
    ])

    expect(mockTriggerAttackRelease).toHaveBeenNthCalledWith(1, 261.63, 0.25)
    expect(mockTriggerAttackRelease).toHaveBeenNthCalledWith(2, 329.63, 0.5)

    scheduler.destroy()
  })
})

describe('warmUpAudio()', () => {
  it('warmUp starts Tone, waits for samples, primes the sampler, and restores volume after the warm-up delay', async () => {
    const scheduler = await setupScheduler()
    scheduler.setVolume(-18)

    await scheduler.warmUp()

    expect(mockToneStart).toHaveBeenCalled()
    expect(mockToneLoaded).toHaveBeenCalled()
    expect(mockTriggerAttackRelease).toHaveBeenCalledWith('C4', 0.01)
    expect(getSamplerVolume()).toBe(Number.NEGATIVE_INFINITY)

    vi.advanceTimersByTime(50)

    expect(getSamplerVolume()).toBe(-18)

    scheduler.destroy()
  })

  it('primeSampler triggers a silent note and restores the previous volume after the warm-up delay', async () => {
    const scheduler = await setupScheduler()
    scheduler.setVolume(-20)

    scheduler.primeSampler()

    expect(mockTriggerAttackRelease).toHaveBeenCalledWith('C4', 0.01)
    expect(getSamplerVolume()).toBe(Number.NEGATIVE_INFINITY)

    vi.advanceTimersByTime(50)

    expect(getSamplerVolume()).toBe(-20)

    scheduler.destroy()
  })
})

describe('reset()', () => {
  it('cancels scheduled transport state, releases notes, and stops future scheduling until restarted', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 0, 480, 60, 100),
    ])

    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()
    vi.advanceTimersByTime(25)

    mockTriggerAttackRelease.mockClear()
    mockReleaseAll.mockClear()
    mockTransportCancel.mockClear()

    scheduler.reset()
    vi.advanceTimersByTime(50)

    expect(mockReleaseAll).toHaveBeenCalled()
    expect(mockTransportCancel).toHaveBeenCalled()
    expect(mockTriggerAttackRelease).not.toHaveBeenCalled()

    scheduler.destroy()
  })
})

describe('scheduleAhead()', () => {
  it('schedules notes in the lookahead window with correct pitch, duration, and velocity', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 0, 480, 64, 127),
    ])

    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalled()
    const [pitch, duration, scheduleTime, velocity] = mockTriggerAttackRelease.mock.calls[0]
    expect(pitch).toBe('C4')
    expect(duration).toBeGreaterThan(0)
    expect(scheduleTime).toBeGreaterThanOrEqual(0)
    expect(velocity).toBeCloseTo(127 / 127)

    scheduler.destroy()
  })

  it('does not schedule notes before lastScheduledTick on subsequent passes', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 0, 480, 60, 100),
    ])

    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    vi.advanceTimersByTime(25)
    const firstPassCalls = mockTriggerAttackRelease.mock.calls.length
    expect(firstPassCalls).toBeGreaterThan(0)

    mockTriggerAttackRelease.mockClear()
    vi.advanceTimersByTime(25)

    const noteIds = mockTriggerAttackRelease.mock.calls.map(() => 'note-1')
    expect(noteIds.length).toBe(0)

    scheduler.destroy()
  })

  it('does not schedule notes that are already in the past', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('past-note', 0, 120, 60, 100),
    ])

    mockToneNow.mockReturnValue(10)
    useAppStore.getState().setCurrentTick(960)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).not.toHaveBeenCalled()

    scheduler.destroy()
  })

  it('does nothing when playback is not active', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 0, 480, 60, 100),
    ])

    useAppStore.getState().setIsPlaying(false)
    scheduler.start()
    vi.advanceTimersByTime(50)

    expect(mockTriggerAttackRelease).not.toHaveBeenCalled()

    scheduler.destroy()
  })

  it('skips muted tracks and honors solo logic', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes(
      [
        createNote('muted-note', 0, 480, 60, 100),
        createNote('solo-note', 0, 480, 72, 100),
      ],
      [
        createTrack('track-muted', 'Muted', [createNote('muted-note', 0, 480, 60, 100)]),
        createTrack('track-solo', 'Solo', [createNote('solo-note', 0, 480, 72, 100)]),
      ],
    )

    useAppStore.getState().setTrackMuted('track-muted', true)
    useAppStore.getState().setTrackSoloed('track-solo', true)
    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalledTimes(1)

    scheduler.destroy()
  })

  it('plays all unmuted tracks when no solo is active', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes(
      [
        createNote('note-a', 0, 480, 60, 100),
        createNote('note-b', 0, 480, 64, 100),
      ],
      [
        createTrack('track-a', 'A', [createNote('note-a', 0, 480, 60, 100)]),
        createTrack('track-b', 'B', [createNote('note-b', 0, 480, 64, 100)]),
      ],
    )

    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalledTimes(2)

    scheduler.destroy()
  })

  it('hand left skips scheduling notes with pitch 60 and above', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('left-note', 0, 480, 59, 100),
      createNote('right-note', 0, 480, 60, 100),
    ])

    useAppStore.getState().setSessionConfig({ hand: 'left', mode: 'listen' })
    useAppStore.getState().startSession()
    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalledTimes(1)

    scheduler.destroy()
  })

  it('hand right skips scheduling notes with pitch below 60', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('left-note', 0, 480, 59, 100),
      createNote('right-note', 0, 480, 60, 100),
    ])

    useAppStore.getState().setSessionConfig({ hand: 'right', mode: 'listen' })
    useAppStore.getState().startSession()
    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalledTimes(1)

    scheduler.destroy()
  })

  it('hand both schedules all notes', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('left-note', 0, 480, 59, 100),
      createNote('right-note', 0, 480, 60, 100),
    ])

    useAppStore.getState().setSessionConfig({ hand: 'both', mode: 'listen' })
    useAppStore.getState().startSession()
    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalledTimes(2)

    scheduler.destroy()
  })
})

describe('seek()', () => {
  it('resets scheduling state, cancels transport events, and reschedules when running', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 960, 1_440, 60, 100),
    ])

    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()
    vi.advanceTimersByTime(25)

    mockTriggerAttackRelease.mockClear()
    mockReleaseAll.mockClear()
    mockTransportCancel.mockClear()

    useAppStore.getState().setCurrentTick(960)
    scheduler.seek(960)
    vi.advanceTimersByTime(25)

    expect(mockReleaseAll).toHaveBeenCalled()
    expect(mockTransportCancel).toHaveBeenCalled()
    expect(mockTriggerAttackRelease).toHaveBeenCalled()

    scheduler.destroy()
  })

  it('wraps seek in try/catch, warns, and attempts recovery when cancel throws', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 960, 1_440, 60, 100),
    ])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()

    mockTransportCancel.mockImplementationOnce(() => {
      throw new Error('transport failure')
    })

    expect(() => scheduler.seek(960)).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
    expect(mockReleaseAll).toHaveBeenCalled()
    expect(mockTransportStop).toHaveBeenCalled()
    expect(mockTransportStart).toHaveBeenCalled()

    scheduler.destroy()
  })

  it('does not reschedule notes on seek when playback is not active', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 960, 1_440, 60, 100),
    ])

    useAppStore.getState().setCurrentTick(960)
    useAppStore.getState().setIsPlaying(false)
    scheduler.seek(960)
    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).not.toHaveBeenCalled()

    scheduler.destroy()
  })

  it('applies the hand filter after a seek reschedule', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('left-note', 960, 1_440, 59, 100),
      createNote('right-note', 960, 1_440, 60, 100),
    ])

    useAppStore.getState().setSessionConfig({ hand: 'left', mode: 'listen' })
    useAppStore.getState().startSession()
    useAppStore.getState().setCurrentTick(0)
    useAppStore.getState().setIsPlaying(true)
    scheduler.start()
    vi.advanceTimersByTime(25)

    mockTriggerAttackRelease.mockClear()

    useAppStore.getState().setCurrentTick(960)
    scheduler.seek(960)
    vi.advanceTimersByTime(25)

    expect(mockTriggerAttackRelease).toHaveBeenCalledTimes(1)

    scheduler.destroy()
  })
})

describe('store integration', () => {
  it('starts and stops automatically when isPlaying changes', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([createNote('note-1', 0, 480, 60, 100)])

    useAppStore.getState().setIsPlaying(true)
    vi.advanceTimersByTime(25)
    expect(mockTriggerAttackRelease).toHaveBeenCalled()

    mockTriggerAttackRelease.mockClear()
    useAppStore.getState().setIsPlaying(false)
    vi.advanceTimersByTime(50)

    expect(mockTriggerAttackRelease).not.toHaveBeenCalled()

    scheduler.destroy()
  })

  it('detects large tick jumps as seeks but ignores small playback advances', async () => {
    const scheduler = await setupScheduler()
    loadProjectWithNotes([
      createNote('note-1', 0, 480, 60, 100),
      createNote('note-2', 2_000, 2_480, 62, 100),
    ])

    useAppStore.getState().setIsPlaying(true)
    scheduler.start()
    vi.advanceTimersByTime(25)

    mockReleaseAll.mockClear()
    mockTransportCancel.mockClear()

    useAppStore.getState().setCurrentTick(10)
    vi.advanceTimersByTime(25)
    expect(mockReleaseAll).not.toHaveBeenCalled()
    expect(mockTransportCancel).not.toHaveBeenCalled()

    useAppStore.getState().setCurrentTick(2_000)
    vi.advanceTimersByTime(25)
    expect(mockReleaseAll).toHaveBeenCalled()
    expect(mockTransportCancel).toHaveBeenCalled()

    scheduler.destroy()
  })
})

describe('volume controls', () => {
  it('applies setVolume, mute, and unmute to the sampler output', async () => {
    const scheduler = await setupScheduler()

    scheduler.setVolume(-20)
    expect(getSamplerVolume()).toBe(-20)

    scheduler.mute()
    expect(getSamplerVolume()).toBe(-60)

    scheduler.unmute()
    expect(getSamplerVolume()).toBe(-20)

    scheduler.destroy()
  })

  it('supports setMuted for camera mode recording and preview playback', async () => {
    const scheduler = await setupScheduler()

    scheduler.setVolume(-12)
    scheduler.setMuted(true)
    expect(getSamplerVolume()).toBe(Number.NEGATIVE_INFINITY)

    scheduler.setMuted(false)
    expect(getSamplerVolume()).toBe(-12)

    scheduler.destroy()
  })
})

async function setupScheduler(): Promise<AudioScheduler> {
  const scheduler = new AudioScheduler()
  await scheduler.init()
  return scheduler
}

function getSamplerVolume(): number {
  const instance = MockSampler.mock.results.at(-1)?.value as MockSamplerInstance | undefined
  return instance?.volume.value ?? Number.NaN
}

function loadProjectWithNotes(notes: Note[], tracks?: Track[]): void {
  const projectTracks =
    tracks ??
    [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes,
      },
    ]

  useAppStore.getState().loadProject(
    {
      tempoMap: [
        {
          bpm: 120,
          microsecondsPerBeat: 500_000,
          tick: 0,
        },
      ],
      ticksPerQuarter: 480,
      timeSignatures: [
        {
          denominator: 4,
          numerator: 4,
          tick: 0,
        },
      ],
      totalTicks: 4_000,
      tracks: projectTracks,
    },
    createTempoMap(),
  )
}

function createTrack(id: string, name: string, trackNotes: Note[]): Track {
  return {
    channel: 0,
    id,
    name,
    notes: trackNotes,
  }
}

function createNote(
  id: string,
  startTick: number,
  visualEndTick: number,
  pitch: number,
  velocity: number,
): Note {
  return {
    endTick: visualEndTick,
    id,
    pitch,
    startTick,
    velocity,
    visualEndTick,
  }
}

function createTempoMap(microsecondsPerBeat = 500_000): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 120,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: (480 * 1_000_000) / microsecondsPerBeat,
      },
    ],
  }
}
