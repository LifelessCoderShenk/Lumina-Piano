import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'
import { LearnOptionsPanel } from './LearnOptionsPanel'

describe('LearnOptionsPanel', () => {
  beforeEach(() => {
    resetStore()
    window.electronAPI = createElectronApiMock()
    window.electronFS = createElectronFsMock()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.restoreAllMocks()
  })

  it('renders all controls', () => {
    render(<LearnOptionsPanel />)

    expect(screen.getByText('NOTE STYLE')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Color mode' })).toBeTruthy()
    expect(screen.getByLabelText('Note opacity')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'SAVE PRESET' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'LOAD PRESET' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Classic' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'High Contrast' })).toBeTruthy()
  })

  it('color mode segmented control shows and hides color pickers correctly', () => {
    render(<LearnOptionsPanel />)

    expect(screen.getByLabelText('Left hand color')).toBeTruthy()
    expect(screen.getByLabelText('Right hand color')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('Custom note color')).toBeTruthy()
    expect(screen.queryByLabelText('Left hand color')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'White' }))
    expect(screen.queryByLabelText('Custom note color')).toBeNull()
    expect(screen.queryByLabelText('Left hand color')).toBeNull()
  })

  it('built-in preset buttons apply correct values to the store', () => {
    render(<LearnOptionsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'High Contrast' }))
    expect(useAppStore.getState().learnVisuals).toEqual({
      fingerNumbersEnabled: true,
      glowEnabled: true,
      leftHandColor: '#ffffff',
      noteColor: 'white',
      noteLabelsEnabled: true,
      noteOpacity: 1,
      rightHandColor: '#ffffff',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(useAppStore.getState().learnVisuals).toEqual({
      fingerNumbersEnabled: false,
      glowEnabled: false,
      leftHandColor: '#166534',
      noteColor: 'perHand',
      noteLabelsEnabled: false,
      noteOpacity: 0.7,
      rightHandColor: '#1e3a5f',
    })
  })

  it('save preset calls showSaveDialog and writeFile', async () => {
    render(<LearnOptionsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'SAVE PRESET' }))

    await waitFor(() => {
      expect(window.electronAPI.showSaveDialog).toHaveBeenCalledTimes(1)
    })
    expect(window.electronFS.writeFile).toHaveBeenCalledTimes(1)

    const [, data] = vi.mocked(window.electronFS.writeFile).mock.calls[0]
    const payload = JSON.parse(new TextDecoder().decode(data))
    expect(payload).toEqual(useAppStore.getState().learnVisuals)
  })

  it('load preset calls openJsonFile and setLearnVisualsPreset', async () => {
    window.electronAPI.openJsonFile = vi.fn(async () => JSON.stringify({
      fingerNumbersEnabled: false,
      glowEnabled: true,
      leftHandColor: '#123456',
      noteColor: 'custom',
      noteLabelsEnabled: false,
      noteOpacity: 0.55,
      rightHandColor: '#abcdef',
    }))

    render(<LearnOptionsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PRESET' }))

    await waitFor(() => {
      expect(window.electronAPI.openJsonFile).toHaveBeenCalledTimes(1)
    })
    expect(useAppStore.getState().learnVisuals).toEqual({
      fingerNumbersEnabled: false,
      glowEnabled: true,
      leftHandColor: '#123456',
      noteColor: 'custom',
      noteLabelsEnabled: false,
      noteOpacity: 0.55,
      rightHandColor: '#abcdef',
    })
  })

  it('invalid JSON on load shows error message without crashing', async () => {
    window.electronAPI.openJsonFile = vi.fn(async () => '{not valid json')

    render(<LearnOptionsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PRESET' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Failed to load preset.')
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
    openJsonFile: vi.fn(async () => null),
    openMidiFile: vi.fn(async () => null),
    shell: {
      openPath: vi.fn(),
    },
    showSaveDialog: vi.fn(async () => 'C:/tmp/learn-visuals.json'),
    uploadSong: vi.fn(async () => null),
    window: {
      close: vi.fn(),
      maximize: vi.fn(),
      minimize: vi.fn(),
    },
  } as typeof window.electronAPI
}

function createElectronFsMock() {
  return {
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async () => new Uint8Array()),
    rm: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  } as typeof window.electronFS
}
