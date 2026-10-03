import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadMidiFileFromPath = vi.hoisted(() => vi.fn(async () => true))
const mockWarmUpAudioAndStartPlayback = vi.hoisted(() => vi.fn(async () => undefined))
const mockChooseAndLoadProject = vi.hoisted(() => vi.fn())
const mockSaveProject = vi.hoisted(() => vi.fn())
const mockOpenMusicXml = vi.hoisted(() => vi.fn())
vi.mock('../../midi/loadMidiProject', () => ({
  isMidiFilePath: (path: string) => /\.(mid|midi)$/i.test(path),
  loadMidiFileFromPath: mockLoadMidiFileFromPath,
  warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback,
}))
vi.mock('../../project/luminaProject', () => ({
  chooseAndLoadLuminaProject: mockChooseAndLoadProject,
  saveCurrentLuminaProject: mockSaveProject,
}))
vi.mock('../../musicxml/loadMusicXmlProject', () => ({ openAndLoadMusicXmlFile: mockOpenMusicXml }))
const { registerMidiPieceLoader } = await import('../../store/midiPieceLoaderAccess')
registerMidiPieceLoader({ loadMidiFileFromPath: mockLoadMidiFileFromPath, warmUpAudioAndStartPlayback: mockWarmUpAudioAndStartPlayback })
const { PieceFilesColumn } = await import('./PieceFilesColumn')
const { resetStore, useAppStore } = await import('../../store/store')

describe('PieceFilesColumn', () => {
  beforeEach(() => {
    resetStore()
    mockLoadMidiFileFromPath.mockClear()
    mockWarmUpAudioAndStartPlayback.mockClear()
    mockChooseAndLoadProject.mockReset()
    mockSaveProject.mockReset()
    mockOpenMusicXml.mockReset()
    applyDesignTokens()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders All pieces as active and enables Samples', () => {
    render(<PieceFilesColumn />)

    const column = screen.getByTestId('piece-files-column')
    const heading = screen.getByRole('heading', { name: 'Library' })
    const activeButton = screen.getByRole('button', { name: 'All pieces' })
    const sampleButton = screen.getByRole('button', { name: 'Samples' })

    expect(column.style.backgroundColor).toBe('var(--color-bg)')
    expect(heading.style.color).toBe('var(--color-text-header)')
    expect(activeButton.getAttribute('aria-pressed')).toBe('true')
    expect(activeButton.style.backgroundColor).toBe('var(--color-icon)')
    expect(activeButton.style.color).toBe('var(--color-text-body)')
    expect(sampleButton.getAttribute('aria-disabled')).toBeNull()
    expect(sampleButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('selects the sample-piece source through its parent callback', () => {
    const onSelectPieceSource = vi.fn()

    render(<PieceFilesColumn onSelectPieceSource={onSelectPieceSource} />)

    fireEvent.click(screen.getByRole('button', { name: 'Samples' }))

    expect(onSelectPieceSource).toHaveBeenCalledWith('samples')
  })

  it('adds MIDI from the Pieces panel without starting playback', async () => {
    window.electronAPI = { openMidiFile: vi.fn(async () => 'C:/music/demo.mid') } as unknown as typeof window.electronAPI
    render(<PieceFilesColumn />)

    fireEvent.click(screen.getByRole('button', { name: 'Add MIDI' }))

    await waitFor(() => expect(mockLoadMidiFileFromPath).toHaveBeenCalledWith('C:/music/demo.mid'))
    expect(mockWarmUpAudioAndStartPlayback).not.toHaveBeenCalled()
    expect(useAppStore.getState().pieces).toHaveLength(1)
    expect(useAppStore.getState().pieces[0]).toMatchObject({ name: 'demo', filePath: 'C:/music/demo.mid' })
  })

  it('opens editable projects and remembers them in the library', async () => {
    mockChooseAndLoadProject.mockResolvedValue({ filePath: 'C:/music/night.lumina', name: 'Night' })
    render(<PieceFilesColumn />)

    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))

    await waitFor(() => expect(useAppStore.getState().pieces[0]).toMatchObject({
      filePath: 'C:/music/night.lumina', name: 'Night', type: 'project',
    }))
    expect(useAppStore.getState().currentPieceId).toBe(useAppStore.getState().pieces[0].id)
    expect(screen.getByRole('status').textContent).toContain('Project opened')
  })

  it('only enables project saving when an editable performance is loaded', async () => {
    const { rerender } = render(<PieceFilesColumn />)
    expect(screen.getByRole('button', { name: 'Save project' }).hasAttribute('disabled')).toBe(true)

    useAppStore.setState({ isProjectLoaded: true })
    mockSaveProject.mockResolvedValue({ filePath: 'C:/music/Untitled Project.lumina', name: 'Untitled Project' })
    rerender(<PieceFilesColumn />)
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }))

    await waitFor(() => expect(mockSaveProject).toHaveBeenCalledWith('Untitled Project'))
    expect(screen.getByRole('status').textContent).toContain('Project saved')
  })

  it('imports a MusicXML score into the editable library', async () => {
    mockOpenMusicXml.mockResolvedValue({ filePath: 'C:/music/nocturne.musicxml', name: 'nocturne' })
    render(<PieceFilesColumn />)
    fireEvent.click(screen.getByRole('button', { name: 'Add score' }))
    await waitFor(() => expect(useAppStore.getState().pieces[0]).toMatchObject({ type: 'musicxml', name: 'nocturne' }))
    expect(screen.getByRole('status').textContent).toContain('Score imported')
  })

})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}
