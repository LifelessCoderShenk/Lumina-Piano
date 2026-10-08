import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))
const mockLoadMidiBytes = vi.hoisted(() => vi.fn(async () => true))
const mockWarmUpAudioAndStartPlayback = vi.hoisted(() => vi.fn(async () => undefined))
const mockLoadLuminaProject = vi.hoisted(() => vi.fn(async () => ({ filePath: 'C:/pieces/night.lumina', name: 'Night' })))
const mockLoadMusicXml = vi.hoisted(() => vi.fn(async () => ({ filePath: 'C:/pieces/score.musicxml', name: 'Score' })))

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiBytes: mockLoadMidiBytes,
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
  warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback,
}))
vi.mock('../../project/luminaProject', () => ({ loadLuminaProjectFileFromPath: mockLoadLuminaProject }))
vi.mock('../../musicxml/loadMusicXmlProject', () => ({ loadMusicXmlFileFromPath: mockLoadMusicXml }))

const { registerMidiPieceLoader } = await import('../../store/midiPieceLoaderAccess')
registerMidiPieceLoader({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
  warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback,
})

const { PiecesColumn } = await import('./PiecesColumn')
const { resetStore, useAppStore } = await import('../../store/store')

describe('PiecesColumn', () => {
  beforeEach(() => {
    resetStore()
    mockLoadMidiFileFromPath.mockReset()
    mockLoadMidiFileFromPath.mockImplementation(async () => true)
    mockLoadMidiBytes.mockReset()
    mockLoadMidiBytes.mockImplementation(async () => true)
    mockWarmUpAudioAndStartPlayback.mockReset()
    mockWarmUpAudioAndStartPlayback.mockImplementation(async () => undefined)
    mockLoadLuminaProject.mockClear()
    mockLoadMusicXml.mockClear()
    applyDesignTokens()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders user pieces without fictional sample placeholders', () => {
    window.electronAPI = {} as typeof window.electronAPI
    useAppStore.getState().addPiece(createUserPiece())

    render(<PiecesColumn />)

    const userPiece = screen.getByRole('button', { name: 'My First Piece' }) as HTMLButtonElement

    expect(screen.getByTestId('pieces-column').style.backgroundColor).toBe('var(--color-bg)')
    expect((screen.getByRole('heading', { name: 'All pieces' }) as HTMLHeadingElement).style.color).toBe('var(--color-text-header)')
    expect(screen.queryByRole('button', { name: /Sample Piece [12]/ })).toBeNull()
    expect(userPiece).toBeTruthy()
    expect(userPiece.style.color).toBe('var(--color-text-body)')
    expect(userPiece.style.pointerEvents).toBe('auto')
    expect(userPiece.style.cursor).toBe('pointer')
    expect(userPiece.style.opacity).toBe('1')
    expect(userPiece.style.minHeight).toBe('40px')
    expect(userPiece.style.width).toBe('100%')
  })

  it('clicking a user MIDI piece uses the same paused loading state as sample pieces and highlights it', async () => {
    useAppStore.getState().addPiece(createUserPiece())

    render(<PiecesColumn />)
    const userPiece = screen.getByRole('button', { name: 'My First Piece' })
    fireEvent.mouseDown(userPiece)
    fireEvent.click(userPiece)

    await waitFor(() => {
      expect(mockLoadMidiFileFromPath).toHaveBeenCalledWith('C:/pieces/my-first-piece.mid')
    })

    expect(mockWarmUpAudioAndStartPlayback).not.toHaveBeenCalled()

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'My First Piece' }) as HTMLButtonElement).style.backgroundColor).toBe('var(--color-icon)')
    })
  })

  it('does not render the old Record New button', () => {
    render(<PiecesColumn />)

    expect(screen.queryByRole('button', { name: 'Record New' })).toBeNull()
  })

  it('shows real sample titles and loads the named MIDI file', async () => {
    window.electronAPI = {
      samplePieces: {
        list: vi.fn(async () => ['Etude-in-C-Minor-Opus-10-Nr-12.mid', 'Pirates of the Caribbean.mid', 'third.mid']),
        read: vi.fn(async () => Uint8Array.from([1, 2, 3])),
      },
    } as typeof window.electronAPI

    render(<PiecesColumn />)

    const samplePieceOne = await screen.findByRole('button', { name: 'Etude In C Minor Opus 10 Nr 12' })
    const samplePieceTwo = screen.getByRole('button', { name: 'Pirates Of The Caribbean' })
    expect(samplePieceOne.title).toBe('Load Etude In C Minor Opus 10 Nr 12')
    expect(samplePieceTwo.title).toBe('Load Pirates Of The Caribbean')
    expect(screen.queryByRole('button', { name: 'Third' })).toBeNull()

    await waitFor(() => {
      expect((samplePieceOne as HTMLButtonElement).disabled).toBe(false)
      expect((samplePieceTwo as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(samplePieceTwo)

    await waitFor(() => {
      expect(window.electronAPI.samplePieces.read).toHaveBeenCalledWith('Pirates of the Caribbean.mid')
      expect(mockLoadMidiBytes).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]))
    })

    expect(useAppStore.getState().createNoteColors.mode).toBe('pitchClass')
    expect(useAppStore.getState().createNoteColors.pitchClassColors).toEqual({
      0: '#f74fb1',
      1: '#f74f8e',
      2: '#f74f70',
      3: '#f7674f',
      4: '#f7834f',
      5: '#f7a44f',
      6: '#f7c74f',
      7: '#f7d44f',
      8: '#f79a4f',
      9: '#f76e4f',
      10: '#f74f63',
      11: '#f74f8a',
    })
  })

  it('replaces placeholders and user pieces with the bundled sample-piece list', async () => {
    useAppStore.getState().addPiece(createUserPiece())
    window.electronAPI = {
      samplePieces: {
        list: vi.fn(async () => ['moonlight-sonata.mid', 'twinkle_twinkle.midi']),
        read: vi.fn(async () => Uint8Array.from([1, 2, 3])),
      },
    } as typeof window.electronAPI

    render(<PiecesColumn showSamplePieces />)

    expect(await screen.findByRole('button', { name: 'Moonlight Sonata' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Twinkle Twinkle' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sample Piece 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'My First Piece' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Moonlight Sonata' }))

    await waitFor(() => {
      expect(window.electronAPI.samplePieces.read).toHaveBeenCalledWith('moonlight-sonata.mid')
      expect(mockLoadMidiBytes).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]))
    })
  })

  it('opens recording pieces in the system media player instead of trying to load them as MIDI', async () => {
    const openRecording = vi.fn(async () => undefined)
    window.electronAPI = {
      shell: { openPath: openRecording },
    } as typeof window.electronAPI
    useAppStore.getState().addPiece(createRecordingPiece())

    render(<PiecesColumn />)
    const recordingPiece = screen.getByRole('button', { name: 'Practice Take' }) as HTMLButtonElement

    await act(async () => {
      fireEvent.click(recordingPiece)
      await Promise.resolve()
    })

    expect(mockLoadMidiFileFromPath).not.toHaveBeenCalled()
    expect(mockWarmUpAudioAndStartPlayback).not.toHaveBeenCalled()
    expect(openRecording).toHaveBeenCalledWith('C:/pieces/practice-take.mp4')
    expect(recordingPiece.style.fontStyle).toBe('italic')
    expect(recordingPiece.style.opacity).toBe('0.65')
    expect(screen.getByText('REC')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reopens project pieces as editable workspaces', async () => {
    useAppStore.getState().addPiece({
      createdAt: Date.now(), filePath: 'C:/pieces/night.lumina', id: 'project-1', name: 'Night', type: 'project',
    })
    render(<PiecesColumn />)

    fireEvent.click(screen.getByRole('button', { name: 'Night' }))

    await waitFor(() => expect(mockLoadLuminaProject).toHaveBeenCalledWith('C:/pieces/night.lumina'))
    expect(mockLoadMidiFileFromPath).not.toHaveBeenCalled()
    expect(useAppStore.getState().currentPieceId).toBe('project-1')
    expect(screen.getByText('PROJECT')).toBeTruthy()
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}

function createUserPiece() {
  return {
    createdAt: Date.now(),
    filePath: 'C:/pieces/my-first-piece.mid',
    id: 'user-piece-1',
    name: 'My First Piece',
    type: 'midi' as const,
  }
}

function createRecordingPiece() {
  return {
    createdAt: Date.now(),
    filePath: 'C:/pieces/practice-take.mp4',
    id: 'recording-piece-1',
    name: 'Practice Take',
    type: 'recording' as const,
  }
}
