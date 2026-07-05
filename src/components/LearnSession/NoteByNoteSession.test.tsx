import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData, Track } from '../../midi/types'
import { resetStore, useAppStore } from '../../store/store'
import type { PrecomputedTempoMap } from '../../tempo/tempoMap'
import { NoteByNoteSession } from './NoteByNoteSession'

const mockMidiManager = vi.hoisted(() => ({
  onNoteOff: null as null | ((pitch: number) => void),
  onNoteOn: null as null | ((pitch: number, velocity: number) => void),
}))
const mockAssignFingerNumbers = vi.hoisted(() => vi.fn(() => ({
  'note-1': 1,
  'note-2': 2,
  'note-3': 3,
})))
const mockStartNoteDrain = vi.hoisted(() => vi.fn())
const mockCancelNoteDrain = vi.hoisted(() => vi.fn())
const mockTriggerChordCorrect = vi.hoisted(() => vi.fn())
const mockTriggerKeyFlash = vi.hoisted(() => vi.fn())
const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))
const mockPlayNotes = vi.hoisted(() => vi.fn())
const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlaybackSeek = vi.hoisted(() => vi.fn())

vi.mock('../../learn/MidiDeviceManager', () => ({
  default: mockMidiManager,
}))

vi.mock('../../learn/fingeringSystem', () => ({
  assignFingerNumbers: mockAssignFingerNumbers,
}))

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    cancelNoteDrain: mockCancelNoteDrain,
    startNoteDrain: mockStartNoteDrain,
    triggerChordCorrect: mockTriggerChordCorrect,
    triggerKeyFlash: mockTriggerKeyFlash,
  },
}))

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    playNotes: mockPlayNotes,
  },
}))

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    pause: mockPlaybackPause,
    play: mockPlaybackPlay,
    seek: mockPlaybackSeek,
  },
}))

describe('NoteByNoteSession', () => {
  beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockMidiManager.onNoteOn = null
    mockMidiManager.onNoteOff = null
    mockAssignFingerNumbers.mockClear()
    mockStartNoteDrain.mockClear()
    mockCancelNoteDrain.mockClear()
    mockTriggerChordCorrect.mockClear()
    mockTriggerKeyFlash.mockClear()
    mockLoadMidiFileFromPath.mockClear()
    mockPlayNotes.mockClear()
    mockPlaybackPause.mockClear()
    mockPlaybackPlay.mockClear()
    mockPlaybackSeek.mockClear()
    useAppStore.getState().setSelectedSong('song-1')
    useAppStore.getState().setSessionConfig({
      hand: 'both',
      mode: 'noteByNote',
      tempoMultiplier: 1,
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

  it('on mount sets isActive true, builds the chord list once, sets onNoteOn, and never starts playback', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    const { rerender } = render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(useAppStore.getState().learnV3.isActive).toBe(true)
    })

    expect(mockAssignFingerNumbers).toHaveBeenCalledWith(
      createTwoChordProjectData().tracks.flatMap((track) => track.notes),
      'both',
    )
    expect(console.log).toHaveBeenCalledWith('[NoteByNote] total chords:', 2)
    expect(mockMidiManager.onNoteOn).not.toBeNull()
    expect(screen.getByText('1 / 2 CHORDS')).toBeTruthy()
    expect(mockPlayNotes).toHaveBeenCalledWith([
      { durationMs: 250, pitch: 60 },
      { durationMs: 250, pitch: 64 },
    ])
    expect(mockPlaybackPause).toHaveBeenCalledTimes(1)
    expect(mockPlaybackSeek).toHaveBeenCalledWith(0)
    expect(mockPlaybackPlay).not.toHaveBeenCalled()

    rerender(<NoteByNoteSession />)
    useAppStore.getState().recordWrong()

    const totalChordLogs = vi.mocked(console.log).mock.calls.filter(
      (call) => call[0] === '[NoteByNote] total chords:',
    )
    expect(totalChordLogs).toHaveLength(1)
  })

  it('onNoteOn starts drain animation with a duration computed from the tempo map', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
    })

    expect(mockStartNoteDrain).toHaveBeenCalledTimes(1)
    expect(mockStartNoteDrain).toHaveBeenCalledWith(60, 250, expect.any(Number))
  })

  it('onNoteOff before the required duration resets the whole chord, cancels all drains, and replays audio', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
      expect(mockMidiManager.onNoteOff).not.toBeNull()
    })

    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      mockMidiManager.onNoteOn?.(64, 100)
      vi.advanceTimersByTime(100)
      mockMidiManager.onNoteOff?.(60)
    })

    expect(mockCancelNoteDrain).toHaveBeenCalledWith(60)
    expect(mockCancelNoteDrain).toHaveBeenCalledWith(64)
    expect(useAppStore.getState().learnV3.stats.wrong).toBe(1)
    expect(mockTriggerKeyFlash).toHaveBeenCalledWith(60, 0xff3333)
    expect(mockPlayNotes).toHaveBeenCalledTimes(2)
  })

  it('each note is tracked independently, and all notes must complete before the chord advances', async () => {
    loadProjectIntoStore(createIndependentDurationProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      mockMidiManager.onNoteOn?.(64, 100)
      vi.advanceTimersByTime(112)
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(0)
    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(0)

    act(() => {
      vi.advanceTimersByTime(144)
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(1)
    expect(mockTriggerChordCorrect).toHaveBeenCalledWith(['note-1', 'note-2'])
    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(0)

    act(() => {
      vi.advanceTimersByTime(149)
    })

    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(0)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(1)
    expect(mockPlayNotes).toHaveBeenNthCalledWith(2, [
      { durationMs: 250, pitch: 67 },
    ])
    expect(console.log).toHaveBeenCalledWith(
      '[NoteByNote] advanced to chord index:',
      1,
      'pitches:',
      [67],
    )
  })

  it('applies the hand filter to the chord list before grouping', async () => {
    loadProjectIntoStore(createMixedHandProjectData())
    useAppStore.getState().setSessionConfig({
      hand: 'left',
      mode: 'noteByNote',
      tempoMultiplier: 1,
    })

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })

    act(() => {
      mockMidiManager.onNoteOn?.(48, 100)
      vi.advanceTimersByTime(256)
      vi.advanceTimersByTime(150)
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(1)
    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(1)
    expect(mockTriggerChordCorrect).toHaveBeenCalledWith(['left-note-1'])
  })

  it('wrong note resets the whole chord, flashes the key, and replays the chord audio', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    act(() => {
      mockMidiManager.onNoteOn?.(61, 100)
    })

    expect(useAppStore.getState().learnV3.stats.wrong).toBe(1)
    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(0)
    expect(mockTriggerKeyFlash).toHaveBeenCalledWith(61, 0xff3333)
    expect(mockCancelNoteDrain).toHaveBeenCalledWith(60)
    expect(mockCancelNoteDrain).toHaveBeenCalledWith(64)
    expect(mockPlayNotes).toHaveBeenCalledTimes(2)
  })

  it('last chord completion calls endSession and navigates to learnEnd', async () => {
    loadProjectIntoStore(createSingleChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      mockMidiManager.onNoteOn?.(64, 100)
      vi.advanceTimersByTime(256)
    })

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(useAppStore.getState().learnV3.sessionState).toBe('ended')
    expect(useAppStore.getState().appMode).toBe('learnEnd')
  })

  it('accuracy display calculates correctly', async () => {
    loadProjectIntoStore(createTwoChordProjectData())
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordWrong()

    render(<NoteByNoteSession />)

    expect(await screen.findByText('67% ACCURATE')).toBeTruthy()
  })

  it('chord counter updates with currentChordIndex', async () => {
    loadProjectIntoStore(createThreeChordProjectData())
    useAppStore.getState().setCurrentChordIndex(1)

    render(<NoteByNoteSession />)

    expect(await screen.findByText('2 / 3 CHORDS')).toBeTruthy()
  })

  it('does not play chord audio on advance when audio preview is disabled', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Disable audio preview' }))
    mockPlayNotes.mockClear()

    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      mockMidiManager.onNoteOn?.(64, 100)
      vi.advanceTimersByTime(256)
      vi.advanceTimersByTime(150)
    })

    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(1)
    expect(mockPlayNotes).not.toHaveBeenCalled()
  })

  it('back button calls exitSession and navigates to learnSong', async () => {
    loadProjectIntoStore(createTwoChordProjectData())
    useAppStore.getState().startSession()

    render(<NoteByNoteSession />)

    fireEvent.click(await screen.findByRole('button', { name: 'Back to song page' }))

    expect(useAppStore.getState().learnV3.isActive).toBe(false)
    expect(useAppStore.getState().learnV3.sessionState).toBe('idle')
    expect(useAppStore.getState().appMode).toBe('learnSong')
  })

  it('on unmount clears onNoteOn and sets isActive false', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    const { unmount } = render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(useAppStore.getState().learnV3.isActive).toBe(true)
    })

    unmount()

    expect(mockMidiManager.onNoteOn).toBeNull()
    expect(useAppStore.getState().learnV3.isActive).toBe(false)
  })

  it('clamps note durations to a minimum of 100ms', async () => {
    loadProjectIntoStore(createMinDurationProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    vi.useFakeTimers({
      toFake: ['Date', 'performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      vi.advanceTimersByTime(99)
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(0)
    expect(mockStartNoteDrain).toHaveBeenCalledWith(60, 100, expect.any(Number))

    act(() => {
      vi.advanceTimersByTime(13)
      vi.advanceTimersByTime(150)
    })

    expect(useAppStore.getState().learnV3.sessionState).toBe('ended')
    expect(useAppStore.getState().appMode).toBe('learnEnd')
  })
})

function createElectronApiMock() {
  return {
    getSongs: vi.fn(async () => [
      {
        composer: 'Composer',
        difficulty: 'intermediate',
        file: 'C:\\songs\\practice.mid',
        filePath: 'C:\\songs\\practice.mid',
        id: 'song-1',
        source: 'user',
        title: 'Practice Song',
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

function createTwoChordProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
    tracks: createTwoChordTracks(),
  }
}

function createThreeChordProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 1_440,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 120, 60),
          createNote('note-2', 240, 360, 64),
          createNote('note-3', 480, 600, 67),
        ],
      },
    ],
  }
}

function createSingleChordProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 480,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 120, 60),
          createNote('note-2', 0, 120, 64),
        ],
      },
    ],
  }
}

function createTwoChordTracks(): Track[] {
  return [
    {
      channel: 0,
      id: 'track-1',
      name: 'Track 1',
      notes: [
        createNote('note-1', 0, 120, 60),
        createNote('note-2', 0, 120, 64),
        createNote('note-3', 240, 360, 67),
      ],
    },
  ]
}

function createMixedHandProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('left-note-1', 0, 120, 48),
          createNote('right-note-1', 0, 120, 60),
          createNote('left-note-2', 240, 360, 50),
        ],
      },
    ],
  }
}

function createIndependentDurationProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 48, 60),
          createNote('note-2', 0, 120, 64),
          createNote('note-3', 240, 360, 67),
        ],
      },
    ],
  }
}

function createMinDurationProjectData(): ProjectData {
  return {
    tempoMap: [{ bpm: 60, microsecondsPerBeat: 1_000_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 40,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          createNote('note-1', 0, 10, 60),
        ],
      },
    ],
  }
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
