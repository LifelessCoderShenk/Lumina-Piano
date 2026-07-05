import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData, Track } from '../../midi/types'
import { resetStore, useAppStore } from '../../store/store'
import type { PrecomputedTempoMap } from '../../tempo/tempoMap'
import { PlayAlongSession } from './PlayAlongSession'

const playbackListeners = vi.hoisted(() => ({
  onEnded: null as null | (() => void),
}))
const mockMidiManager = vi.hoisted(() => ({
  onNoteOff: null as null | ((pitch: number) => void),
  onNoteOn: null as null | ((pitch: number, velocity: number) => void),
}))
const mockPlay = vi.hoisted(() => vi.fn())
const mockPause = vi.hoisted(() => vi.fn())
const mockSeek = vi.hoisted(() => vi.fn())
const mockSetTempoMultiplier = vi.hoisted(() => vi.fn())
const mockTriggerKeyFlash = vi.hoisted(() => vi.fn())
const mockRenderFrame = vi.hoisted(() => vi.fn())
const mockRendererIsReady = vi.hoisted(() => vi.fn(() => true))
const mockAudioSchedulerReset = vi.hoisted(() => vi.fn())
const mockAudioSchedulerWarmUpAudio = vi.hoisted(() => vi.fn(async () => undefined))
const mockSpatialIndexBuild = vi.hoisted(() => vi.fn())
const mockToneStart = vi.hoisted(() => vi.fn(async () => undefined))
const mockTransportStop = vi.hoisted(() => vi.fn())
const mockTransportCancel = vi.hoisted(() => vi.fn())
const mockAssignFingerNumbers = vi.hoisted(() => vi.fn(() => ({
  'note-1': 1,
  'note-2': 2,
  'note-3': 3,
})))
const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))

vi.mock('../../learn/MidiDeviceManager', () => ({
  default: mockMidiManager,
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    off: vi.fn((event: string, listener: () => void) => {
      if (event === 'onEnded' && playbackListeners.onEnded === listener) {
        playbackListeners.onEnded = null
      }
    }),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'onEnded') {
        playbackListeners.onEnded = listener
      }
    }),
    pause: mockPause,
    play: mockPlay,
    seek: mockSeek,
    setTempoMultiplier: mockSetTempoMultiplier,
  },
}))

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    reset: mockAudioSchedulerReset,
    warmUpAudio: mockAudioSchedulerWarmUpAudio,
  },
}))

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    isReady: mockRendererIsReady,
    renderFrame: mockRenderFrame,
    triggerKeyFlash: mockTriggerKeyFlash,
  },
}))

vi.mock('../../spatial/SpatialIndex', () => ({
  spatialIndex: {
    build: mockSpatialIndexBuild,
  },
}))

vi.mock('../../learn/fingeringSystem', () => ({
  assignFingerNumbers: mockAssignFingerNumbers,
}))

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
}))

vi.mock('tone', () => ({
  Transport: {
    cancel: mockTransportCancel,
    stop: mockTransportStop,
  },
  start: mockToneStart,
}))

describe('PlayAlongSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
    playbackListeners.onEnded = null
    mockMidiManager.onNoteOn = null
    mockMidiManager.onNoteOff = null
    mockPlay.mockClear()
    mockPause.mockClear()
    mockSeek.mockClear()
    mockSetTempoMultiplier.mockClear()
    mockTriggerKeyFlash.mockClear()
    mockRenderFrame.mockClear()
    mockRendererIsReady.mockClear()
    mockAudioSchedulerReset.mockClear()
    mockAudioSchedulerWarmUpAudio.mockClear()
    mockSpatialIndexBuild.mockClear()
    mockToneStart.mockClear()
    mockTransportStop.mockClear()
    mockTransportCancel.mockClear()
    mockAssignFingerNumbers.mockClear()
    mockLoadMidiFileFromPath.mockClear()
    mockRendererIsReady.mockReturnValue(true)
    useAppStore.getState().setSelectedSong('song-1')
    useAppStore.getState().setSessionConfig({
      hand: 'both',
      mode: 'playAlong',
      tempoMultiplier: 0.75,
    })
    useAppStore.getState().setAppMode('learnSession')
    window.electronAPI = createElectronApiMock()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the scorecard and countdown before playback starts', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())
    useAppStore.getState().setCurrentTick(720)
    useAppStore.getState().setIsPlaying(true)
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordWrong()
    useAppStore.getState().recordMissed()

    render(<PlayAlongSession />)

    await settleSessionEffects()

    expect(mockPause).toHaveBeenCalled()
    expect(mockSeek).toHaveBeenCalledWith(0)
    expect(mockTransportStop).toHaveBeenCalled()
    expect(mockTransportCancel).toHaveBeenCalled()
    expect(mockToneStart).toHaveBeenCalled()
    expect(mockAudioSchedulerReset).toHaveBeenCalled()
    expect(mockSpatialIndexBuild).toHaveBeenCalledWith(createTwoNoteProjectData())
    expect(mockRenderFrame).toHaveBeenCalledWith(0)
    expect(useAppStore.getState().currentTick).toBe(0)
    expect(useAppStore.getState().isPlaying).toBe(false)
    expect(useAppStore.getState().learnV3.stats).toEqual({
      bestStreak: 0,
      correct: 0,
      missed: 0,
      streak: 0,
      wrong: 0,
    })
    expect(useAppStore.getState().learnV3.isActive).toBe(true)
    expect(screen.getByText('Play Along Song')).toBeTruthy()
    expect(screen.getByText('INTERMEDIATE')).toBeTruthy()
    expect(mockAudioSchedulerWarmUpAudio).not.toHaveBeenCalled()
    expect(mockPlay).not.toHaveBeenCalled()

    await advanceIntroBy(1_600)
    expect(screen.getByText('3')).toBeTruthy()
    expect(mockAudioSchedulerWarmUpAudio).toHaveBeenCalledTimes(1)

    await advanceIntroBy(550)
    expect(screen.getByText('2')).toBeTruthy()

    await advanceIntroBy(550)
    expect(screen.getByText('1')).toBeTruthy()

    await advanceIntroBy(550)
    expect(screen.getByText('GO')).toBeTruthy()

    await advanceIntroBy(400)

    expect(mockSetTempoMultiplier).toHaveBeenCalledWith(0.75)
    expect(mockSetTempoMultiplier).toHaveBeenCalledTimes(2)
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockMidiManager.onNoteOn).not.toBeNull()
    expect(mockAssignFingerNumbers).toHaveBeenCalledWith(
      createTwoNoteProjectData().tracks.flatMap((track) => track.notes),
      'both',
    )
  })

  it('correct note within tolerance calls recordCorrect and green key flash', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()

    act(() => {
      useAppStore.getState().setCurrentTick(0)
      mockMidiManager.onNoteOn?.(60, 100)
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(1)
    expect(mockTriggerKeyFlash).toHaveBeenCalledWith(60, 0x00ff00)
  })

  it('wrong note calls recordWrong and red key flash', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()

    act(() => {
      useAppStore.getState().setCurrentTick(0)
      mockMidiManager.onNoteOn?.(61, 100)
    })

    expect(useAppStore.getState().learnV3.stats.wrong).toBe(1)
    expect(mockTriggerKeyFlash).toHaveBeenCalledWith(61, 0xff3333)
  })

  it('marks notes missed during playback when no matching input arrives', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()

    act(() => {
      useAppStore.getState().setIsPlaying(true)
      useAppStore.getState().setCurrentTick(480)
    })

    expect(useAppStore.getState().learnV3.stats.missed).toBe(1)
    expect(screen.getByText('0% ACCURATE')).toBeTruthy()
  })

  it('song end records missed notes, calls endSession, and navigates to learnEnd', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()

    act(() => {
      useAppStore.getState().setCurrentTick(0)
      mockMidiManager.onNoteOn?.(60, 100)
      playbackListeners.onEnded?.()
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(1)
    expect(useAppStore.getState().learnV3.stats.missed).toBe(1)
    expect(useAppStore.getState().learnV3.sessionState).toBe('ended')
    expect(useAppStore.getState().appMode).toBe('learnEnd')
  })

  it('accuracy display calculates correctly including missed notes', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()

    act(() => {
      useAppStore.getState().recordCorrect()
      useAppStore.getState().recordWrong()
      useAppStore.getState().recordMissed()
    })

    expect(screen.getByText('33% ACCURATE')).toBeTruthy()
  })

  it('play or pause button toggles playback', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()
    await advanceThroughIntro()

    mockPlay.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }))
    expect(mockPlay).toHaveBeenCalledTimes(1)

    act(() => {
      useAppStore.getState().setIsPlaying(true)
    })

    mockPause.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }))
    expect(mockPause).toHaveBeenCalledTimes(1)
  })

  it('waits for audio warm-up to complete before starting playback after the countdown', async () => {
    let resolveWarmUp: (() => void) | null = null
    mockAudioSchedulerWarmUpAudio.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWarmUp = resolve
        }),
    )

    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await settleSessionEffects()
    await advanceIntroBy(1_600)
    await advanceIntroBy(550)
    await advanceIntroBy(550)
    await advanceIntroBy(550)
    await advanceIntroBy(400)

    expect(mockPlay).not.toHaveBeenCalled()

    resolveWarmUp?.()
    await settleSessionEffects()

    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('back button pauses, calls exitSession, and navigates to learnSong', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())
    useAppStore.getState().startSession()

    render(<PlayAlongSession />)

    await settleSessionEffects()

    fireEvent.click(screen.getByRole('button', { name: 'Back to song page' }))

    expect(mockPause).toHaveBeenCalled()
    expect(useAppStore.getState().learnV3.isActive).toBe(false)
    expect(useAppStore.getState().learnV3.sessionState).toBe('idle')
    expect(useAppStore.getState().appMode).toBe('learnSong')
  })

  it('on unmount clears onNoteOn, resets tempo, and pauses', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    const { unmount } = render(<PlayAlongSession />)

    await settleSessionEffects()

    unmount()

    expect(mockMidiManager.onNoteOn).toBeNull()
    expect(useAppStore.getState().learnV3.isActive).toBe(false)
    expect(mockSetTempoMultiplier).toHaveBeenLastCalledWith(1.0)
    expect(mockPause).toHaveBeenCalled()
  })
})

async function advanceIntroBy(durationMs: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(durationMs)
    await Promise.resolve()
  })
}

async function advanceThroughIntro(): Promise<void> {
  await advanceIntroBy(3_650)
}

async function settleSessionEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function createElectronApiMock() {
  return {
    getSongs: vi.fn(async () => [
      {
        composer: 'Composer',
        difficulty: 'intermediate',
        file: 'C:\\songs\\playalong.mid',
        filePath: 'C:\\songs\\playalong.mid',
        id: 'song-1',
        source: 'user',
        title: 'Play Along Song',
      },
    ]),
    openJsonFile: vi.fn(async () => null),
    openMidiFile: vi.fn(async () => null),
    showSaveDialog: vi.fn(),
  } as typeof window.electronAPI
}

function loadProjectIntoStore(projectData: ProjectData): void {
  useAppStore.getState().loadProject(projectData, createTempoMap())
}

function createTwoNoteProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
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
        createNote('note-1', 0, 120, 60),
        createNote('note-2', 720, 840, 64),
      ],
    },
  ]
}

function createNote(id: string, startTick: number, endTick: number, pitch: number) {
  return {
    endTick,
    id,
    pitch,
    startTick,
    velocity: 100,
    visualEndTick: endTick,
  }
}

function createTempoMap(): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 60,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 1_000_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: 480,
      },
    ],
  }
}
