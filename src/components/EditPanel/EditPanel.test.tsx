import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { EditPanel } = await import('./EditPanel')
const { resetStore, useAppStore } = await import('../../store/store')

describe('EditPanel', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders at a compact default width with TopBar, SecondBar, and the split body', () => {
    render(<EditPanel />)

    const panel = screen.getByTestId('edit-panel')
    expect(panel.style.width).toBe('360px')
    expect(panel.style.flexBasis).toBe('360px')
    expect(screen.getByRole('separator', { name: 'Resize edit panel' })).toBeTruthy()
    expect(screen.getByTestId('top-bar')).toBeTruthy()
    expect(screen.getByTestId('second-bar')).toBeTruthy()
    expect(screen.getByTestId('edit-panel-body')).toBeTruthy()
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
    expect(screen.getByTestId('pieces-column')).toBeTruthy()
    expect(screen.getByTestId('edit-panel-divider')).toBeTruthy()
  })

  it('resizes from the Create shell edge and clamps the panel width', () => {
    render(<EditPanel />)

    const panel = screen.getByTestId('edit-panel')
    const handle = screen.getByRole('separator', { name: 'Resize edit panel' })
    const createShell = panel.parentElement
    if (createShell == null) {
      throw new Error('Expected EditPanel to have a parent container.')
    }

    vi.spyOn(createShell, 'getBoundingClientRect').mockReturnValue({ left: 100 } as DOMRect)
    Object.defineProperties(handle, {
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
      setPointerCapture: { value: vi.fn() },
    })

    fireEvent.pointerDown(handle, { clientX: 450, pointerId: 1 })
    expect(panel.style.width).toBe('350px')

    fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 })
    expect(panel.style.width).toBe('520px')

    fireEvent.pointerMove(handle, { clientX: 250, pointerId: 1 })
    expect(panel.style.width).toBe('340px')
    fireEvent.pointerUp(handle, { pointerId: 1 })
  })

  it('collapses without leaving hidden controls in the tab order', () => {
    render(<EditPanel isCollapsed />)

    const panel = screen.getByTestId('edit-panel')
    expect(panel.style.width).toBe('0px')
    expect(panel.style.flexBasis).toBe('0px')
    expect(panel.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByTestId('top-bar')).toBeNull()
    expect(screen.queryByRole('separator', { name: 'Resize edit panel' })).toBeNull()
  })

  it('switches the body when tabs change', () => {
    render(<EditPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Particles' }))
    expect(screen.getByTestId('particles-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Color Picker' }))
    expect(screen.getByTestId('color-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pieces' }))
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
    expect(screen.getByTestId('pieces-column')).toBeTruthy()
  })

  it('uses the shared Camera Transform panel in Camera and Record Modes', () => {
    useAppStore.setState({ appMode: 'createCamera' })
    const view = render(<EditPanel />)

    fireEvent.click(screen.getByTestId('camera-tab-icon').closest('button') as HTMLButtonElement)
    expect(screen.getByTestId('camera-controls-panel')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Move X'), { target: { value: '120' } })
    expect(useAppStore.getState().cameraOverlay.offsetX).toBe(120)

    useAppStore.setState({ appMode: 'createRecord' })
    view.rerender(<EditPanel />)
    expect(screen.getByTestId('camera-tab-icon')).toBeTruthy()
    expect(screen.getByTestId('camera-controls-panel')).toBeTruthy()
  })

  it('switches the right Pieces column to sample pieces', async () => {
    window.electronAPI = {
      samplePieces: {
        list: vi.fn(async () => ['moonlight-sonata.mid']),
        read: vi.fn(async () => Uint8Array.from([1, 2, 3])),
      },
    } as unknown as typeof window.electronAPI

    render(<EditPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Samples' }))

    expect(await screen.findByRole('button', { name: 'Moonlight Sonata' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sample Piece 1' })).toBeNull()
  })

  it('shows and hides the settings panel from the top bar', () => {
    render(<EditPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByTestId('settings-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByTestId('settings-panel')).toBeNull()
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
  })

  it('replaces Falling Keys tabs with the Transcription workspace host', () => {
    useAppStore.setState({ appMode: 'createRecord', recordModeView: 'transcription' })
    render(<EditPanel />)

    expect(screen.getByTestId('transcription-sidebar')).toBeTruthy()
    expect(screen.queryByTestId('second-bar')).toBeNull()
    expect(screen.queryByTestId('piece-files-column')).toBeNull()
  })

  it('shows camera controls automatically in Camera Mode and returns to pieces on back', () => {
    useAppStore.setState({ activeSecondBarTab: 'camera', appMode: 'createCamera' })

    render(<EditPanel />)

    expect(screen.getByTestId('camera-controls-panel')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Camera' })[1]?.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getAllByRole('button', { name: 'Pieces' }).at(-1) as HTMLButtonElement)
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
    expect(useAppStore.getState().activeSecondBarTab).toBe('pieces')
  })
})
