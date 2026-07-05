import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))
const mockWarmUpAudioAndStartPlayback = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../../midi/loadMidiProject', () => ({
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
  warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback,
}))

const { PiecesColumn } = await import('./PiecesColumn')
const { resetStore, useAppStore } = await import('../../store/store')

describe('PiecesColumn', () => {
  beforeEach(() => {
    resetStore()
    mockLoadMidiFileFromPath.mockReset()
    mockLoadMidiFileFromPath.mockImplementation(async () => true)
    mockWarmUpAudioAndStartPlayback.mockReset()
    mockWarmUpAudioAndStartPlayback.mockImplementation(async () => undefined)
    applyDesignTokens()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
  })

  it('renders 2 default placeholder pieces plus user pieces from the store', () => {
    useAppStore.getState().addPiece(createUserPiece())

    render(<PiecesColumn />)

    const samplePieceOne = screen.getByRole('button', { name: 'Sample Piece 1' }) as HTMLButtonElement
    const samplePieceTwo = screen.getByRole('button', { name: 'Sample Piece 2' }) as HTMLButtonElement
    const userPiece = screen.getByRole('button', { name: 'My First Piece' }) as HTMLButtonElement

    expect(screen.getByTestId('pieces-column').style.backgroundColor).toBe('var(--color-bg)')
    expect((screen.getByRole('heading', { name: 'Pieces' }) as HTMLHeadingElement).style.color).toBe('var(--color-text-header)')
    expect(samplePieceOne.getAttribute('aria-disabled')).toBe('true')
    expect(samplePieceTwo.getAttribute('aria-disabled')).toBe('true')
    expect(userPiece).toBeTruthy()
    expect(samplePieceOne.style.color).toBe('var(--color-text-body)')
    expect(samplePieceOne.style.pointerEvents).toBe('none')
    expect(samplePieceOne.style.opacity).toBe('0.4')
    expect(samplePieceOne.style.minHeight).toBe('40px')
    expect(samplePieceOne.style.width).toBe('100%')
    expect(userPiece.style.color).toBe('var(--color-text-body)')
    expect(userPiece.style.pointerEvents).toBe('auto')
    expect(userPiece.style.cursor).toBe('pointer')
    expect(userPiece.style.opacity).toBe('1')
    expect(userPiece.style.minHeight).toBe('40px')
    expect(userPiece.style.width).toBe('100%')
  })

  it('clicking a user MIDI piece loads it through the existing pipeline and highlights the selected piece', async () => {
    useAppStore.getState().addPiece(createUserPiece())

    render(<PiecesColumn />)
    const userPiece = screen.getByRole('button', { name: 'My First Piece' })
    fireEvent.mouseDown(userPiece)
    fireEvent.click(userPiece)

    await waitFor(() => {
      expect(mockLoadMidiFileFromPath).toHaveBeenCalledWith('C:/pieces/my-first-piece.mid')
    })

    await waitFor(() => {
      expect(mockWarmUpAudioAndStartPlayback).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'My First Piece' }) as HTMLButtonElement).style.backgroundColor).toBe('var(--color-icon)')
    })
  })

  it('does not render the old Record New button', () => {
    render(<PiecesColumn />)

    expect(screen.queryByRole('button', { name: 'Record New' })).toBeNull()
  })

  it('skips the MIDI pipeline for mp4 pieces, shows a temporary error, and renders a REC badge', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    useAppStore.getState().addPiece(createRecordingPiece())

    render(<PiecesColumn />)
    const recordingPiece = screen.getByRole('button', { name: 'Practice Take' }) as HTMLButtonElement

    await act(async () => {
      fireEvent.click(recordingPiece)
      await Promise.resolve()
    })

    expect(mockLoadMidiFileFromPath).not.toHaveBeenCalled()
    expect(mockWarmUpAudioAndStartPlayback).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith('[loadPiece] Skipping non-MIDI file:', 'C:/pieces/practice-take.mp4')
    expect(recordingPiece.style.fontStyle).toBe('italic')
    expect(recordingPiece.style.opacity).toBe('0.65')
    expect(screen.getByText('REC')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'MP4 recording pieces cannot be loaded yet. This feature is coming in a future update.',
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByRole('alert')).toBeNull()

    warnSpy.mockRestore()
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
