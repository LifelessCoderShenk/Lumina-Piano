import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SongMetadata } from '../../learn/types'
import { getAppState, resetStore } from '../../store/store'
import { LearnHome } from './LearnHome'

describe('LearnHome', () => {
  beforeEach(() => {
    resetStore()
    window.electronAPI = createElectronApiMock()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.restoreAllMocks()
  })

  it('renders loading state initially', () => {
    let resolveSongs: ((songs: SongMetadata[]) => void) | null = null
    window.electronAPI.getSongs = vi.fn(
      () =>
        new Promise<SongMetadata[]>((resolve) => {
          resolveSongs = resolve
        }),
    )

    render(<LearnHome />)

    expect(screen.getByText('Loading songs...')).toBeTruthy()
    resolveSongs?.([])
  })

  it('renders cards when songs load', async () => {
    window.electronAPI.getSongs = vi.fn(async () => [
      createSong('song-1', 'Clair de Lune', 'advanced'),
      createSong('song-2', 'Ode to Joy', 'beginner'),
    ])

    render(<LearnHome />)

    expect(await screen.findByText('Clair de Lune')).toBeTruthy()
    expect(screen.getByText('Ode to Joy')).toBeTruthy()
    expect(screen.getByText('Advanced')).toBeTruthy()
    expect(screen.getByText('Beginner')).toBeTruthy()
  })

  it('renders empty state when the song list is empty', async () => {
    window.electronAPI.getSongs = vi.fn(async () => [])

    render(<LearnHome />)

    expect(await screen.findByText('No songs in your library yet.')).toBeTruthy()
  })

  it('clicking a card selects the song and navigates', async () => {
    window.electronAPI.getSongs = vi.fn(async () => [
      createSong('song-1', 'Moonlight Sonata', 'advanced'),
    ])

    render(<LearnHome />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open Moonlight Sonata' }))

    expect(getAppState().learnV3.selectedSongId).toBe('song-1')
    expect(getAppState().appMode).toBe('learnSong')
  })

  it('delete button calls deleteSong after confirm', async () => {
    window.electronAPI.getSongs = vi
      .fn<() => Promise<SongMetadata[]>>()
      .mockResolvedValueOnce([createSong('song-1', 'Nocturne', 'intermediate')])
      .mockResolvedValueOnce([])
    window.electronAPI.deleteSong = vi.fn(async () => undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<LearnHome />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Nocturne' }))

    await waitFor(() => {
      expect(window.electronAPI.deleteSong).toHaveBeenCalledWith('song-1')
    })
    expect(window.electronAPI.getSongs).toHaveBeenCalledTimes(2)
  })

  it('upload button calls uploadSong and refreshes the list', async () => {
    window.electronAPI.getSongs = vi
      .fn<() => Promise<SongMetadata[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createSong('song-2', 'Arabesque', 'intermediate')])
    window.electronAPI.uploadSong = vi.fn(async () =>
      createSong('song-2', 'Arabesque', 'intermediate'))

    render(<LearnHome />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add MIDI' }))

    await waitFor(() => {
      expect(window.electronAPI.uploadSong).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Arabesque')).toBeTruthy()
    expect(window.electronAPI.getSongs).toHaveBeenCalledTimes(2)
  })

  it('shows an inline error message when getSongs fails', async () => {
    window.electronAPI.getSongs = vi.fn(async () => Promise.reject(new Error('boom')))

    render(<LearnHome />)

    expect((await screen.findByRole('alert')).textContent).toContain('Failed to load song library.')
  })
})

function createElectronApiMock() {
  return {
    deleteSong: vi.fn(async () => undefined),
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
    getSongs: vi.fn(async () => []),
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

function createSong(
  id: string,
  title: string,
  difficulty: SongMetadata['difficulty'],
): SongMetadata {
  return {
    composer: 'Composer',
    difficulty,
    file: `${id}.mid`,
    id,
    source: 'built-in',
    title,
  }
}
