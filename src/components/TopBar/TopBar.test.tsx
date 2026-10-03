/*
INPUT: TopBar interactions and an isolated application store.
OUTPUT: Toolbar behavior coverage for the Create home and unified Record Mode entry.
PURPOSE: Ensures Transcription is reached through Record Mode while Create remains a stable visualizer action.
*/

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const { registerMidiPieceLoader } = await import('../../store/midiPieceLoaderAccess')
registerMidiPieceLoader({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
  warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback,
})

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
      openJsonFile: vi.fn(),
      openMidiFile: vi.fn(async () => 'C:/music/demo-piece.mid'),
      samplePieces: {
        list: vi.fn(async () => []),
        read: vi.fn(async () => new Uint8Array()),
      },
      shell: {
        openPath: vi.fn(),
      },
      showSaveDialog: vi.fn(),
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

  it('renders the Falling Keys tools and one wide Create recording action', () => {
    render(<TopBar />)

    const topBar = screen.getByTestId('top-bar')
    const createButton = screen.getByRole('button', { name: 'Create' })
    const clearButton = screen.getByRole('button', { name: 'Clear piece' })
    const settingsButton = screen.getByRole('button', { name: 'Settings' })
    const cameraButton = screen.getByRole('button', { name: 'Camera' })

    expect(topBar.style.backgroundColor).toBe('var(--color-bg)')
    expect(createButton.textContent).toBe('Create')
    expect(clearButton).toBeTruthy()
    expect(settingsButton).toBeTruthy()
    expect(cameraButton).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Piece' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Transcriptor' })).toBeNull()
    expect(clearButton.style.color).toBe('var(--color-icon-muted)')
    expect((clearButton as HTMLButtonElement).disabled).toBe(true)
    expect(clearButton.title).toBe('No piece loaded')
    expect(settingsButton.style.color).toBe('var(--color-icon)')
    expect(cameraButton.style.color).toBe('var(--color-icon-muted)')
    expect(createButton.style.color).toBe('var(--color-icon)')
    expect(clearButton.querySelector('svg.lucide-file-x-corner[fill="none"]')).toBeTruthy()
    expect(settingsButton.querySelector('svg.lucide-sliders-horizontal')).toBeTruthy()
    for (const button of [clearButton, settingsButton, cameraButton, createButton]) {
      expect(button.querySelector('svg')?.getAttribute('width')).toBe('20')
    }
  })

  it('uses the muted icon token when the camera button is unavailable', () => {
    render(<TopBar />)

    const cameraButton = screen.getByRole('button', { name: 'Camera' }) as HTMLButtonElement
    expect(cameraButton.disabled).toBe(true)
    expect(cameraButton.title).toBe('Load a piece first')
    expect(cameraButton.style.color).toBe('var(--color-icon-muted)')
    expect(cameraButton.style.opacity).toBe('')
  })

  it('toggles settings through the settings button props', () => {
    const toggleSettings = vi.fn()

    render(<TopBar isSettingsOpen={false} onToggleSettings={toggleSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(toggleSettings).toHaveBeenCalledTimes(1)
  })

  it('Clear piece clears the currently loaded piece state', () => {
    useAppStore.getState().loadProject(createProjectData(), createTempoMap())

    render(<TopBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear piece' }))

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

  it('opens the Performance and Transcription workspace from Create', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(useAppStore.getState().appMode).toBe('createRecord')
    expect(useAppStore.getState().activeSecondBarTab).toBe('camera')
  })

  it('keeps the selected recording workspace when Create is already open', () => {
    useAppStore.setState({ appMode: 'createRecord', recordModeView: 'transcription', transcriptionPhase: 'stopped' })
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(mockPlaybackPause).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().appMode).toBe('createRecord')
    expect(useAppStore.getState().recordModeView).toBe('transcription')
  })

  it('locks workflow switching while a transcription is being captured', () => {
    useAppStore.setState({ appMode: 'createRecord', recordModeView: 'transcription', transcriptionPhase: 'recording' })
    render(<TopBar />)

    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('locks every Create navigation exit while another recorder is busy', () => {
    useAppStore.setState({ isProjectLoaded: true })
    render(<TopBar isCreateNavigationLocked onToggleSettings={vi.fn()} />)

    for (const name of ['Clear piece', 'Settings', 'Camera', 'Create']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(button.title).toContain('Stop or cancel')
    }
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
