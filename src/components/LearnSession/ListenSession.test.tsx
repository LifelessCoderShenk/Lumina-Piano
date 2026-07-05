import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData, Track } from '../../midi/types'
import { resetStore, useAppStore } from '../../store/store'
import type { PrecomputedTempoMap } from '../../tempo/tempoMap'
import { ListenSession } from './ListenSession'

const playbackListeners = vi.hoisted(() => ({
  onEnded: null as null | (() => void),
}))
const mockPlay = vi.hoisted(() => vi.fn())
const mockPause = vi.hoisted(() => vi.fn())
const mockSeek = vi.hoisted(() => vi.fn())
const mockSetTempoMultiplier = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererDestroy = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererForceResume = vi.hoisted(() => vi.fn())
const mockWarmUpAudio = vi.hoisted(() => vi.fn(async () => undefined))
const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))
const mockCanvasContext = vi.hoisted(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  get fillStyle() {
    return ''
  },
  scale: vi.fn(),
  set fillStyle(_value: string) {},
  setTransform: vi.fn(),
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

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
}))

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    destroy: mockRendererDestroy,
    forceResume: mockRendererForceResume,
  },
}))

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    init: vi.fn(),
    isReady: vi.fn(() => true),
    warmUpAudio: mockWarmUpAudio,
  },
}))

describe('ListenSession', () => {
  beforeEach(() => {
    resetStore()
    playbackListeners.onEnded = null
    mockPlay.mockClear()
    mockPause.mockClear()
    mockSeek.mockClear()
    mockSetTempoMultiplier.mockClear()
    mockRendererDestroy.mockClear()
    mockRendererDestroy.mockImplementation(async () => undefined)
    mockRendererForceResume.mockClear()
    mockWarmUpAudio.mockClear()
    mockLoadMidiFileFromPath.mockClear()
    useAppStore.getState().setSelectedSong('song-1')
    useAppStore.getState().setSessionConfig({
      mode: 'listen',
      tempoMultiplier: 0.75,
    })
    useAppStore.getState().setAppMode('learnSession')
    window.electronAPI = createElectronApiMock()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => mockCanvasContext as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: 48,
      height: 48,
      left: 0,
      right: 400,
      toJSON: () => ({}),
      top: 0,
      width: 400,
      x: 0,
      y: 0,
    }))
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 400,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 48,
    })
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.restoreAllMocks()
  })

  it('on mount sets tempo multiplier and calls play', async () => {
    loadProjectIntoStore()

    render(<ListenSession />)

    await waitFor(() => {
      expect(mockSetTempoMultiplier).toHaveBeenCalledWith(0.75)
    })
    expect(mockWarmUpAudio).toHaveBeenCalledTimes(1)
    expect(mockRendererForceResume).toHaveBeenCalledTimes(1)
    expect(mockSeek).toHaveBeenCalledWith(0)
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockSeek.mock.invocationCallOrder[0]).toBeLessThan(mockPlay.mock.invocationCallOrder[0])
  })

  it('session bar renders at the top with controls row, waveform canvas, and back button', async () => {
    loadProjectIntoStore()

    render(<ListenSession />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play playback' })).toBeTruthy()
    })
    expect(screen.getByTestId('listen-session-top-bar')).toBeTruthy()
    expect(screen.getByLabelText('Session waveform')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tempo multiplier' }).textContent).toBe('0.75x')
    expect(screen.getByRole('button', { name: 'Back to song page' })).toBeTruthy()
  })

  it('clicking the waveform canvas seeks to the matching tick position', async () => {
    loadProjectIntoStore(1000)

    render(<ListenSession />)

    const waveform = await screen.findByLabelText('Session waveform')
    mockSeek.mockClear()

    fireEvent.click(waveform, { clientX: 200 })

    expect(mockSeek).toHaveBeenCalledWith(500)
  })

  it('hide toggle hides the waveform row while keeping controls visible', async () => {
    loadProjectIntoStore()

    render(<ListenSession />)

    await waitFor(() => {
      expect(screen.getByLabelText('Session waveform')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hide waveform' }))

    expect(screen.queryByLabelText('Session waveform')).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to song page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play playback' })).toBeTruthy()
  })

  it('play or pause button toggles playback', async () => {
    loadProjectIntoStore()

    render(<ListenSession />)

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

  it('back button calls seek(0) before exitSession and navigates to learnSong', async () => {
    loadProjectIntoStore()
    useAppStore.getState().startSession()

    render(<ListenSession />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to song page' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Back to song page' }))

    await waitFor(() => {
      expect(mockRendererDestroy).toHaveBeenCalledTimes(1)
    })

    expect(mockPause).toHaveBeenCalled()
    expect(mockSeek).toHaveBeenCalledWith(0)
    expect(mockSetTempoMultiplier).toHaveBeenCalledWith(1.0)
    expect(useAppStore.getState().learnV3.isActive).toBe(false)
    expect(useAppStore.getState().learnV3.sessionState).toBe('idle')
    expect(useAppStore.getState().appMode).toBe('learnSong')
  })

  it('playback end event calls endSession and navigates to learnEnd', async () => {
    loadProjectIntoStore()
    useAppStore.getState().startSession()

    render(<ListenSession />)

    await waitFor(() => {
      expect(playbackListeners.onEnded).not.toBeNull()
    })

    act(() => {
      playbackListeners.onEnded?.()
    })

    expect(useAppStore.getState().learnV3.sessionState).toBe('ended')
    expect(useAppStore.getState().appMode).toBe('learnEnd')
  })

  it('on unmount pauses playback, seeks to 0, and resets tempo multiplier to 1.0', async () => {
    loadProjectIntoStore()

    const { unmount } = render(<ListenSession />)

    await waitFor(() => {
      expect(mockSetTempoMultiplier).toHaveBeenCalledWith(0.75)
    })

    unmount()

    expect(mockPause).toHaveBeenCalled()
    expect(mockSeek).toHaveBeenCalledWith(0)
    expect(mockSetTempoMultiplier).toHaveBeenLastCalledWith(1.0)
  })

  it('enables note labels and keyboard labels on mount and restores them on back navigation', async () => {
    loadProjectIntoStore()
    useAppStore.getState().setNoteLabelsOnNotes(false)
    useAppStore.getState().setNoteLabelsOnKeys(false)

    render(<ListenSession />)

    await waitFor(() => {
      expect(useAppStore.getState().noteLabelsOnNotes).toBe(true)
    })
    expect(useAppStore.getState().noteLabelsOnKeys).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Back to song page' }))

    await waitFor(() => {
      expect(useAppStore.getState().noteLabelsOnNotes).toBe(false)
    })

    expect(useAppStore.getState().noteLabelsOnNotes).toBe(false)
    expect(useAppStore.getState().noteLabelsOnKeys).toBe(false)
  })
})

function createElectronApiMock() {
  return {
    getSongs: vi.fn(async () => [
      {
        composer: 'Composer',
        difficulty: 'advanced',
        file: 'C:\\songs\\moonlight.mid',
        filePath: 'C:\\songs\\moonlight.mid',
        id: 'song-1',
        source: 'user',
        title: 'Moonlight Sonata',
      },
    ]),
    openJsonFile: vi.fn(async () => null),
    openMidiFile: vi.fn(async () => null),
    showSaveDialog: vi.fn(),
  } as typeof window.electronAPI
}

function loadProjectIntoStore(totalTicks = 960): void {
  useAppStore.getState().loadProject(createProjectData(totalTicks), createTempoMap())
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
