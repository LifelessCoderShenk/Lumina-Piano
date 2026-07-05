import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData, Track } from '../midi/types'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { PlaybackEngine, PlaybackEngineError } from './PlaybackEngine'

let mockTime = 0
let rafCallback: ((time: number) => void) | null = null
let rafId = 0

beforeEach(() => {
  resetStore()
  mockTime = 0
  rafCallback = null
  rafId = 0

  vi.stubGlobal('performance', {
    now: () => mockTime,
  })
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    rafCallback = callback
    rafId += 1
    return rafId
  })
  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
    rafCallback = null
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetStore()
})

describe('PlaybackEngine', () => {
  it('initializes correctly and auto-seeks to tick 0 when a new project loads', () => {
    const engine = new PlaybackEngine()
    const firstTempoMap = createTempoMap(500_000)
    const secondTempoMap = createTempoMap(1_000_000)

    useAppStore.getState().setCurrentTick(300)
    engine.init(firstTempoMap)

    useAppStore.getState().loadProject(createProjectData(960), secondTempoMap)

    expect(useAppStore.getState().currentTick).toBe(0)

    engine.play()
    runFrame(1_000)

    expect(useAppStore.getState().currentTick).toBe(480)

    engine.destroy()
  })

  it('prevents double initialization', () => {
    const engine = new PlaybackEngine()
    engine.init(createTempoMap())

    expect(() => engine.init(createTempoMap())).toThrowError(PlaybackEngineError)

    try {
      engine.init(createTempoMap())
    } catch (error: unknown) {
      expect((error as PlaybackEngineError).code).toBe('ALREADY_INITIALIZED')
    }

    engine.destroy()
  })

  it('destroy resets cleanly and is safe to call multiple times', () => {
    const engine = new PlaybackEngine()
    useAppStore.getState().loadProject(createProjectData(960), createTempoMap())
    engine.init(createTempoMap())
    engine.play()

    expect(useAppStore.getState().isPlaying).toBe(true)

    engine.destroy()
    engine.destroy()

    expect(useAppStore.getState().isPlaying).toBe(false)
    expect(() => engine.play()).toThrowError(PlaybackEngineError)
  })

  it('play sets isPlaying true and pause sets it false', () => {
    const engine = setupInitializedEngine()

    engine.play()
    expect(useAppStore.getState().isPlaying).toBe(true)

    engine.pause()
    expect(useAppStore.getState().isPlaying).toBe(false)

    engine.destroy()
  })

  it('playWithPreRoll starts from a negative tick and reaches tick 0 after the pre-roll duration', () => {
    const engine = setupInitializedEngine()

    engine.playWithPreRoll(1)

    expect(useAppStore.getState().currentTick).toBe(-480)
    expect(useAppStore.getState().isPlaying).toBe(true)

    runFrame(500)
    expect(useAppStore.getState().currentTick).toBe(-240)

    runFrame(1_000)
    expect(useAppStore.getState().currentTick).toBe(0)

    runFrame(1_500)
    expect(useAppStore.getState().currentTick).toBe(240)

    engine.destroy()
  })

  it('has no drift across pause and resume', () => {
    const engine = setupInitializedEngine()

    engine.play()
    runFrame(500)
    expect(useAppStore.getState().currentTick).toBe(240)

    engine.pause()
    mockTime = 1_000
    expect(useAppStore.getState().currentTick).toBe(240)

    engine.play()
    runFrame(1_500)
    expect(useAppStore.getState().currentTick).toBe(480)

    engine.destroy()
  })

  it('clamps seek correctly and does not start playback when paused', () => {
    const engine = setupInitializedEngine()

    engine.seek(-25)
    expect(useAppStore.getState().currentTick).toBe(0)
    expect(useAppStore.getState().isPlaying).toBe(false)

    engine.seek(2_000)
    expect(useAppStore.getState().currentTick).toBe(960)
    expect(useAppStore.getState().isPlaying).toBe(false)

    engine.destroy()
  })

  it('resets anchors when seeking during playback', () => {
    const engine = setupInitializedEngine()

    engine.play()
    runFrame(250)
    expect(useAppStore.getState().currentTick).toBe(120)

    engine.seek(480)
    runFrame(750)
    expect(useAppStore.getState().currentTick).toBe(720)

    engine.destroy()
  })

  it('throws INVALID_TICK for non-finite seek values', () => {
    const engine = setupInitializedEngine()

    expect(() => engine.seek(Number.NaN)).toThrowError(PlaybackEngineError)

    try {
      engine.seek(Number.POSITIVE_INFINITY)
    } catch (error: unknown) {
      expect((error as PlaybackEngineError).code).toBe('INVALID_TICK')
    }

    engine.destroy()
  })

  it('uses absolute time for exact tick progression at 120 BPM', () => {
    const engine = setupInitializedEngine()

    engine.play()

    runFrame(500)
    expect(useAppStore.getState().currentTick).toBe(240)

    runFrame(1_000)
    expect(useAppStore.getState().currentTick).toBe(480)

    engine.destroy()
  })

  it('does not drift across multiple updates', () => {
    const engine = setupInitializedEngine()

    engine.play()

    runFrame(100)
    expect(useAppStore.getState().currentTick).toBe(48)

    runFrame(400)
    expect(useAppStore.getState().currentTick).toBe(192)

    runFrame(1_000)
    expect(useAppStore.getState().currentTick).toBe(480)

    engine.destroy()
  })

  it('applies the tempo multiplier to playback speed', async () => {
    const engine = setupInitializedEngine()

    await engine.setTempoMultiplier(0.5)
    engine.play()
    runFrame(1_000)

    expect(useAppStore.getState().currentTick).toBe(240)

    engine.destroy()
  })

  it('re-anchors playback when the tempo multiplier changes during playback', async () => {
    const engine = setupInitializedEngine()

    engine.play()
    runFrame(500)
    expect(useAppStore.getState().currentTick).toBe(240)

    await engine.setTempoMultiplier(0.5)
    runFrame(1_500)

    expect(useAppStore.getState().currentTick).toBe(480)

    engine.destroy()
  })

  it('setTempoMultiplier while playing seeks to the current tick and resumes playback after a microtask', async () => {
    const engine = setupInitializedEngine()
    const onPause = vi.fn()
    const onPlay = vi.fn()
    const onSeek = vi.fn()

    engine.on('onPause', onPause)
    engine.on('onPlay', onPlay)
    engine.on('onSeek', onSeek)

    engine.play()
    runFrame(500)
    expect(useAppStore.getState().currentTick).toBe(240)

    onPlay.mockClear()

    const resumePromise = engine.setTempoMultiplier(0.5)

    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(240)
    expect(onPlay).not.toHaveBeenCalled()
    expect(useAppStore.getState().isPlaying).toBe(false)

    await resumePromise

    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().currentTick).toBe(240)
    expect(useAppStore.getState().isPlaying).toBe(true)

    engine.destroy()
  })

  it('loops exactly at the boundary and resets anchors correctly', () => {
    const engine = setupInitializedEngine(2_000)
    useAppStore.getState().setLoop(true, 240, 480)

    engine.play()

    runFrame(1_000)
    expect(useAppStore.getState().currentTick).toBe(240)
    expect(useAppStore.getState().isPlaying).toBe(true)

    runFrame(1_250)
    expect(useAppStore.getState().currentTick).toBe(360)

    engine.destroy()
  })

  it('stops exactly at totalTicks and emits onEnded once', () => {
    const engine = setupInitializedEngine(480)
    const ended = vi.fn()

    engine.on('onEnded', ended)
    engine.play()

    runFrame(1_000)

    expect(useAppStore.getState().currentTick).toBe(480)
    expect(useAppStore.getState().isPlaying).toBe(false)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(rafCallback).toBeNull()

    engine.destroy()
  })

  it('fires onTick after store updates each frame', () => {
    const engine = setupInitializedEngine()
    const ticks: number[] = []
    const storeValues: number[] = []

    engine.on('onTick', (tick) => {
      ticks.push(tick)
      storeValues.push(useAppStore.getState().currentTick)
    })

    engine.play()
    runFrame(250)
    runFrame(500)

    expect(ticks).toEqual([120, 240])
    expect(storeValues).toEqual([120, 240])

    engine.destroy()
  })

  it('supports once listeners correctly', () => {
    const engine = setupInitializedEngine()
    const onSeek = vi.fn()

    engine.once('onSeek', onSeek)
    engine.seek(120)
    engine.seek(240)

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(120)

    engine.destroy()
  })

  it('removes listeners with off', () => {
    const engine = setupInitializedEngine()
    const onTick = vi.fn()

    engine.on('onTick', onTick)
    engine.off('onTick', onTick)
    engine.play()
    runFrame(500)

    expect(onTick).not.toHaveBeenCalled()

    engine.destroy()
  })
})

function setupInitializedEngine(totalTicks = 960): PlaybackEngine {
  const projectData = createProjectData(totalTicks)
  const tempoMap = createTempoMap()
  useAppStore.getState().loadProject(projectData, tempoMap)

  const engine = new PlaybackEngine()
  engine.init(tempoMap)
  return engine
}

function runFrame(time: number): void {
  const callback = rafCallback
  if (callback == null) {
    throw new Error('requestAnimationFrame callback was not scheduled.')
  }

  mockTime = time
  callback(time)
}

function createProjectData(totalTicks: number): ProjectData {
  return {
    tempoMap: [
      {
        bpm: 60,
        microsecondsPerBeat: 1_000_000,
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
    totalTicks,
    tracks: createTracks(),
  }
}

function createTracks(): Track[] {
  return [
    {
      channel: 0,
      id: 'track-1',
      name: 'Track 1',
      notes: [
        {
          endTick: 480,
          id: 'note-1',
          pitch: 60,
          startTick: 0,
          velocity: 100,
          visualEndTick: 480,
        },
      ],
    },
  ]
}

function createTempoMap(microsecondsPerBeat = 1_000_000): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 60_000_000 / microsecondsPerBeat,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: (480 * 1_000_000) / microsecondsPerBeat,
      },
    ],
  }
}
