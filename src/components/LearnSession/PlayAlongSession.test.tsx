import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    triggerKeyFlash: mockTriggerKeyFlash,
  },
}))

vi.mock('../../learn/fingeringSystem', () => ({
  assignFingerNumbers: mockAssignFingerNumbers,
}))

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
}))

describe('PlayAlongSession', () => {
  beforeEach(() => {
    resetStore()
    playbackListeners.onEnded = null
    mockMidiManager.onNoteOn = null
    mockMidiManager.onNoteOff = null
    mockPlay.mockClear()
    mockPause.mockClear()
    mockSeek.mockClear()
    mockSetTempoMultiplier.mockClear()
    mockTriggerKeyFlash.mockClear()
    mockAssignFingerNumbers.mockClear()
    mockLoadMidiFileFromPath.mockClear()
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
    vi.restoreAllMocks()
  })

  it('on mount sets isActive true, sets tempo multiplier, sets onNoteOn, and calls play', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await waitFor(() => {
      expect(useAppStore.getState().learnV3.isActive).toBe(true)
    })

    expect(mockSetTempoMultiplier).toHaveBeenCalledWith(0.75)
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

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

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

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    act(() => {
      useAppStore.getState().setCurrentTick(0)
      mockMidiManager.onNoteOn?.(61, 100)
    })

    expect(useAppStore.getState().learnV3.stats.wrong).toBe(1)
    expect(mockTriggerKeyFlash).toHaveBeenCalledWith(61, 0xff3333)
  })

  it('song end records missed notes, calls endSession, and navigates to learnEnd', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await waitFor(() => {
      expect(playbackListeners.onEnded).not.toBeNull()
    })

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
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordWrong()
    useAppStore.getState().recordMissed()

    render(<PlayAlongSession />)

    expect(await screen.findByText('33% ACCURATE')).toBeTruthy()
  })

  it('play or pause button toggles playback', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    render(<PlayAlongSession />)

    await waitFor(() => {
      expect(mockPlay).toHaveBeenCalledTimes(1)
    })

    mockPlay.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }))
    expect(mockPlay).toHaveBeenCalledTimes(1)

    act(() => {
      useAppStore.getState().setIsPlaying(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }))
    expect(mockPause).toHaveBeenCalledTimes(1)
  })

  it('back button pauses, calls exitSession, and navigates to learnSong', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())
    useAppStore.getState().startSession()

    render(<PlayAlongSession />)

    fireEvent.click(await screen.findByRole('button', { name: 'Back to song page' }))

    expect(mockPause).toHaveBeenCalled()
    expect(useAppStore.getState().learnV3.isActive).toBe(false)
    expect(useAppStore.getState().learnV3.sessionState).toBe('idle')
    expect(useAppStore.getState().appMode).toBe('learnSong')
  })

  it('on unmount clears onNoteOn, resets tempo, and pauses', async () => {
    loadProjectIntoStore(createTwoNoteProjectData())

    const { unmount } = render(<PlayAlongSession />)

    await waitFor(() => {
      expect(useAppStore.getState().learnV3.isActive).toBe(true)
    })

    unmount()

    expect(mockMidiManager.onNoteOn).toBeNull()
    expect(useAppStore.getState().learnV3.isActive).toBe(false)
    expect(mockSetTempoMultiplier).toHaveBeenLastCalledWith(1.0)
    expect(mockPause).toHaveBeenCalled()
  })
})

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
