import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAppState, resetStore, useAppStore } from '../../store/store'
import { SongPage } from './SongPage'

const mockMidiInit = vi.hoisted(() => vi.fn(async () => undefined))
const mockMidiGetDevices = vi.hoisted(() => vi.fn(() => [
  { id: 'device-1', name: 'Lumina Keyboard' },
  { id: 'device-2', name: 'Studio Piano' },
]))
const mockMidiConnect = vi.hoisted(() => vi.fn())
const mockMidiTestConnection = vi.hoisted(() => vi.fn(async () => undefined))
const mockSetTempoMultiplier = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../../learn/MidiDeviceManager', () => ({
  default: {
    connect: mockMidiConnect,
    getDevices: mockMidiGetDevices,
    init: mockMidiInit,
    testConnection: mockMidiTestConnection,
  },
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    setTempoMultiplier: mockSetTempoMultiplier,
  },
}))

describe('SongPage', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.getState().setSelectedSong('song-1')
    useAppStore.getState().setAppMode('learnSong')
    window.electronAPI = createElectronApiMock()
    mockMidiInit.mockClear()
    mockMidiGetDevices.mockClear()
    mockMidiConnect.mockClear()
    mockMidiTestConnection.mockClear()
    mockSetTempoMultiplier.mockClear()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.restoreAllMocks()
  })

  it('renders song title and difficulty from store', async () => {
    render(<SongPage />)

    expect(await screen.findByText('Moonlight Sonata')).toBeTruthy()
    expect(screen.getByText('Advanced')).toBeTruthy()
  })

  it('renders all three cards with tempo slider and hand selector', async () => {
    render(<SongPage />)

    await screen.findByText('Moonlight Sonata')

    for (const label of ['Listen mode', 'Note by Note mode', 'Play Along mode']) {
      const card = screen.getByLabelText(label)
      expect(within(card).getByRole('slider')).toBeTruthy()
      expect(within(card).getByRole('button', { name: 'L' })).toBeTruthy()
      expect(within(card).getByRole('button', { name: 'R' })).toBeTruthy()
      expect(within(card).getByRole('button', { name: 'Both' })).toBeTruthy()
      expect(within(card).getByRole('button', { name: 'START' })).toBeTruthy()
    }
  })

  it('start on each card sets correct mode in store and navigates', async () => {
    useAppStore.getState().setConnectionStatus('connected')
    render(<SongPage />)
    await screen.findByText('Moonlight Sonata')

    fireEvent.click(within(screen.getByLabelText('Listen mode')).getByRole('button', { name: 'START' }))
    expect(getAppState().learnV3.sessionConfig.mode).toBe('listen')
    expect(getAppState().appMode).toBe('learnSession')

    useAppStore.getState().setAppMode('learnSong')
    fireEvent.click(within(screen.getByLabelText('Note by Note mode')).getByRole('button', { name: 'START' }))
    expect(getAppState().learnV3.sessionConfig.mode).toBe('noteByNote')
    expect(getAppState().appMode).toBe('learnSession')

    useAppStore.getState().setAppMode('learnSong')
    fireEvent.change(within(screen.getByLabelText('Play Along mode')).getByRole('slider'), {
      target: { value: '0.75' },
    })
    fireEvent.click(within(screen.getByLabelText('Play Along mode')).getByRole('button', { name: 'R' }))
    fireEvent.click(within(screen.getByLabelText('Play Along mode')).getByRole('button', { name: 'START' }))
    expect(getAppState().learnV3.sessionConfig).toEqual({
      hand: 'right',
      mode: 'playAlong',
      tempoMultiplier: 0.75,
    })
    expect(getAppState().appMode).toBe('learnSession')
    expect(mockSetTempoMultiplier).toHaveBeenCalledWith(0.75)
  })

  it('disables Note by Note and Play Along start buttons when MIDI is not connected', async () => {
    render(<SongPage />)
    await screen.findByText('Moonlight Sonata')

    const listenStart = within(screen.getByLabelText('Listen mode')).getByRole('button', { name: 'START' }) as HTMLButtonElement
    const noteByNoteStart = within(screen.getByLabelText('Note by Note mode')).getByRole('button', { name: 'START' }) as HTMLButtonElement
    const playAlongStart = within(screen.getByLabelText('Play Along mode')).getByRole('button', { name: 'START' }) as HTMLButtonElement

    expect(listenStart.disabled).toBe(false)
    expect(noteByNoteStart.disabled).toBe(true)
    expect(playAlongStart.disabled).toBe(true)
  })

  it('shows a warning message when no MIDI device is connected', async () => {
    render(<SongPage />)

    expect(await screen.findByText('Connect and test a MIDI device to start.')).toBeTruthy()
  })

  it('device dropdown change calls midiDeviceManager.connect', async () => {
    render(<SongPage />)

    await screen.findByText('Moonlight Sonata')
    fireEvent.change(screen.getByLabelText('MIDI device'), {
      target: { value: 'device-2' },
    })

    expect(mockMidiConnect).toHaveBeenCalledWith('device-2')
  })

  it('test connection resolves and shows connected', async () => {
    mockMidiTestConnection.mockImplementationOnce(async () => {
      useAppStore.getState().setConnectionStatus('connected')
    })

    render(<SongPage />)
    await screen.findByText('Moonlight Sonata')

    fireEvent.click(screen.getByRole('button', { name: 'TEST CONNECTION' }))

    await waitFor(() => {
      expect(screen.getByText('o CONNECTED')).toBeTruthy()
    })
  })

  it('test connection rejects and shows failed', async () => {
    mockMidiTestConnection.mockImplementationOnce(async () => {
      useAppStore.getState().setConnectionStatus('failed')
      throw 'timeout'
    })

    render(<SongPage />)
    await screen.findByText('Moonlight Sonata')

    fireEvent.click(screen.getByRole('button', { name: 'TEST CONNECTION' }))

    await waitFor(() => {
      expect(screen.getByText('o FAILED')).toBeTruthy()
    })
  })

  it('back arrow navigates to learn home', async () => {
    render(<SongPage />)
    await screen.findByText('Moonlight Sonata')

    fireEvent.click(screen.getByRole('button', { name: 'Back to learn home' }))

    expect(getAppState().appMode).toBe('learn')
  })

  it('keeps Listen mode start enabled regardless of MIDI status', async () => {
    render(<SongPage />)
    await screen.findByText('Moonlight Sonata')

    const listenStart = within(screen.getByLabelText('Listen mode')).getByRole('button', { name: 'START' }) as HTMLButtonElement
    expect(listenStart.disabled).toBe(false)

    fireEvent.click(listenStart)
    expect(getAppState().learnV3.sessionConfig.mode).toBe('listen')
    expect(getAppState().appMode).toBe('learnSession')
  })
})

function createElectronApiMock() {
  return {
    deleteSong: vi.fn(async () => undefined),
    openJsonFile: vi.fn(async () => null),
    openMidiFile: vi.fn(async () => null),
    showSaveDialog: vi.fn(),
    dialog: {
      getDefaultExportPath: vi.fn(),
      openMidiFile: vi.fn(),
      showSaveDialog: vi.fn(),
    },
    export: {
      getTempDir: vi.fn(),
      saveFile: vi.fn(),
    },
    ffmpeg: {
      run: vi.fn(),
    },
    getSongs: vi.fn(async () => [
      {
        composer: 'Ludwig van Beethoven',
        difficulty: 'advanced',
        file: 'moonlight.mid',
        id: 'song-1',
        source: 'built-in',
        title: 'Moonlight Sonata',
      },
    ]),
    library: {
      deleteUserSong: vi.fn(),
      getUserSongs: vi.fn(async () => []),
      saveUserSong: vi.fn(),
    },
    shell: {
      openPath: vi.fn(),
    },
    uploadSong: vi.fn(async () => null),
    window: {
      close: vi.fn(),
      maximize: vi.fn(),
      minimize: vi.fn(),
    },
  }
}
