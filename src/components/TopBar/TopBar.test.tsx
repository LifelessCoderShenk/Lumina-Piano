import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))
const mockWarmUpAudioAndStartPlayback = vi.hoisted(() => vi.fn(async () => undefined))
const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackSeek = vi.hoisted(() => vi.fn())

vi.mock('../../midi/loadMidiProject', () => ({
  isMidiFilePath: (filePath: string) => /\.(mid|midi)$/i.test(filePath),
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
  warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback,
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    pause: mockPlaybackPause,
    seek: mockPlaybackSeek,
  },
}))

const { TopBar } = await import('./TopBar')
const { resetStore, useAppStore } = await import('../../store/store')

describe('TopBar', () => {
  beforeEach(() => {
    resetStore()
    mockLoadMidiFileFromPath.mockReset()
    mockLoadMidiFileFromPath.mockImplementation(async () => true)
    mockWarmUpAudioAndStartPlayback.mockReset()
    mockWarmUpAudioAndStartPlayback.mockImplementation(async () => undefined)
    mockPlaybackPause.mockReset()
    mockPlaybackSeek.mockReset()
    applyDesignTokens()

    window.electronAPI = {
      deleteSong: vi.fn(),
      dialog: {
        getDefaultExportPath: vi.fn(),
        openMidiFile: vi.fn(async () => null),
        showSaveDialog: vi.fn(),
      },
      export: {
        getTempDir: vi.fn(),
        saveFile: vi.fn(),
      },
      ffmpeg: {
        run: vi.fn(),
      },
      getSongs: vi.fn(async () => []),
      library: {
        deleteUserSong: vi.fn(),
        getUserSongs: vi.fn(async () => []),
        saveUserSong: vi.fn(),
      },
      openJsonFile: vi.fn(),
      openMidiFile: vi.fn(async () => 'C:/music/demo-piece.mid'),
      shell: {
        openPath: vi.fn(),
      },
      showSaveDialog: vi.fn(),
      uploadSong: vi.fn(),
      window: {
        close: vi.fn(),
        maximize: vi.fn(),
        minimize: vi.fn(),
      },
    }
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders all 5 top bar buttons', () => {
    render(<TopBar />)

    const topBar = screen.getByTestId('top-bar')
    const addButton = screen.getByRole('button', { name: 'Add Piece' })
    const homeButton = screen.getByRole('button', { name: 'Home' })
    const settingsButton = screen.getByRole('button', { name: 'Settings' })
    const cameraButton = screen.getByRole('button', { name: 'Camera' })
    const recordButton = screen.getByRole('button', { name: 'Record' })

    expect(topBar.style.backgroundColor).toBe('var(--color-bg)')
    expect(addButton).toBeTruthy()
    expect(homeButton).toBeTruthy()
    expect(settingsButton).toBeTruthy()
    expect(cameraButton).toBeTruthy()
    expect(recordButton).toBeTruthy()
    expect(addButton.style.color).toBe('var(--color-icon)')
    expect(homeButton.style.color).toBe('var(--color-icon)')
    expect(settingsButton.style.color).toBe('var(--color-icon)')
    expect(cameraButton.style.color).toBe('var(--color-icon)')
    expect(recordButton.style.color).toBe('var(--color-icon)')
  })

  it('dims the camera button when no piece is loaded', () => {
    render(<TopBar />)

    const cameraButton = screen.getByRole('button', { name: 'Camera' }) as HTMLButtonElement
    expect(cameraButton.disabled).toBe(true)
    expect(cameraButton.title).toBe('Load a piece first')
    expect(cameraButton.style.opacity).toBe('0.5')
  })

  it('toggles settings through the settings button props', () => {
    const toggleSettings = vi.fn()

    render(<TopBar isSettingsOpen={false} onToggleSettings={toggleSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(toggleSettings).toHaveBeenCalledTimes(1)
  })

  it('opens the file picker, creates a piece, and starts playback for MIDI files', async () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Piece' }))

    await waitFor(() => {
      expect(window.electronAPI.openMidiFile).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(mockLoadMidiFileFromPath).toHaveBeenCalledWith('C:/music/demo-piece.mid')
    })

    await waitFor(() => {
      expect(mockWarmUpAudioAndStartPlayback).toHaveBeenCalledTimes(1)
    })

    expect(useAppStore.getState().pieces).toHaveLength(1)
    expect(useAppStore.getState().pieces[0]).toMatchObject({
      filePath: 'C:/music/demo-piece.mid',
      name: 'demo-piece',
      type: 'midi',
    })
  })

  it('home clears the currently loaded piece state', () => {
    useAppStore.getState().loadProject(createProjectData(), createTempoMap())

    render(<TopBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))

    expect(mockPlaybackPause).toHaveBeenCalledTimes(1)
    expect(mockPlaybackSeek).toHaveBeenCalledWith(0)
    expect(useAppStore.getState().isProjectLoaded).toBe(false)
    expect(useAppStore.getState().projectData).toBeNull()
    expect(useAppStore.getState().precomputedTempoMap).toBeNull()
  })

  it('enters camera mode when a piece is loaded', () => {
    useAppStore.getState().addPiece({
      createdAt: Date.now(),
      filePath: 'C:/music/demo-piece.mid',
      id: 'piece-1',
      name: 'Demo Piece',
      type: 'midi',
    })
    useAppStore.setState({
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
    })

    render(<TopBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }))

    expect(useAppStore.getState().appMode).toBe('createCamera')
  })

  it('enters record mode from the record button', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Record' }))

    expect(useAppStore.getState().appMode).toBe('createRecord')
    expect(useAppStore.getState().activeSecondBarTab).toBe('pieces')
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}

function createProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
    tracks: [
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
    ],
  }
}

function createTempoMap() {
  return {
    segments: [
      {
        bpm: 120,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 500_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: 960,
      },
    ],
  }
}
