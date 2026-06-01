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
const mockTriggerChordCorrect = vi.hoisted(() => vi.fn())
const mockTriggerKeyFlash = vi.hoisted(() => vi.fn())
const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))

vi.mock('../../learn/MidiDeviceManager', () => ({
  default: mockMidiManager,
}))

vi.mock('../../learn/fingeringSystem', () => ({
  assignFingerNumbers: mockAssignFingerNumbers,
}))

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    triggerChordCorrect: mockTriggerChordCorrect,
    triggerKeyFlash: mockTriggerKeyFlash,
  },
}))

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
}))

describe('NoteByNoteSession', () => {
  beforeEach(() => {
    resetStore()
    mockMidiManager.onNoteOn = null
    mockMidiManager.onNoteOff = null
    mockAssignFingerNumbers.mockClear()
    mockTriggerChordCorrect.mockClear()
    mockTriggerKeyFlash.mockClear()
    mockLoadMidiFileFromPath.mockClear()
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
    vi.restoreAllMocks()
  })

  it('on mount sets isActive true, builds the chord list, and sets onNoteOn', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(useAppStore.getState().learnV3.isActive).toBe(true)
    })

    expect(mockAssignFingerNumbers).toHaveBeenCalledWith(
      createTwoChordProjectData().tracks.flatMap((track) => track.notes),
      'both',
    )
    expect(mockMidiManager.onNoteOn).not.toBeNull()
    expect(screen.getByText('1 / 2 CHORDS')).toBeTruthy()
  })

  it('correct chord triggers recordCorrect, triggerChordCorrect, and advanceChord', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      mockMidiManager.onNoteOn?.(64, 100)
    })

    expect(useAppStore.getState().learnV3.stats.correct).toBe(1)
    expect(useAppStore.getState().learnV3.currentChordIndex).toBe(1)
    expect(mockTriggerChordCorrect).toHaveBeenCalledWith(['note-1', 'note-2'])
  })

  it('wrong note triggers recordWrong and triggerKeyFlash', async () => {
    loadProjectIntoStore(createTwoChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    act(() => {
      mockMidiManager.onNoteOn?.(61, 100)
    })

    expect(useAppStore.getState().learnV3.stats.wrong).toBe(1)
    expect(mockTriggerKeyFlash).toHaveBeenCalledWith(61, 0xff3333)
  })

  it('last chord completion calls endSession and navigates to learnEnd', async () => {
    loadProjectIntoStore(createSingleChordProjectData())

    render(<NoteByNoteSession />)

    await waitFor(() => {
      expect(mockMidiManager.onNoteOn).not.toBeNull()
    })

    act(() => {
      mockMidiManager.onNoteOn?.(60, 100)
      mockMidiManager.onNoteOn?.(64, 100)
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
