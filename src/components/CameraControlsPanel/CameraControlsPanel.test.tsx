import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'

const mockSetKeyboardOpacity = vi.hoisted(() => vi.fn())

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    setKeyboardOpacity: mockSetKeyboardOpacity,
  },
}))

const { CameraControlsPanel } = await import('./CameraControlsPanel')

describe('CameraControlsPanel', () => {
  beforeEach(() => {
    resetStore()
    mockSetKeyboardOpacity.mockReset()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders all sliders and inputs with the expected defaults', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    expect((screen.getByLabelText('Move X') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('Move Y') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('Scale') as HTMLInputElement).value).toBe('1')
    expect((screen.getByLabelText('Crop Top') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('Crop Right') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('Crop Bottom') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('Crop Left') as HTMLInputElement).value).toBe('0')
  })

  it('shows the Move Y label without the old upward hint', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    expect(screen.getByText('MOVE Y')).toBeTruthy()
    expect(screen.queryByText('MOVE Y (+ = up)')).toBeNull()
  })

  it('uses 5px steps for all crop inputs', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    expect((screen.getByLabelText('Crop Top') as HTMLInputElement).step).toBe('5')
    expect((screen.getByLabelText('Crop Right') as HTMLInputElement).step).toBe('5')
    expect((screen.getByLabelText('Crop Bottom') as HTMLInputElement).step).toBe('5')
    expect((screen.getByLabelText('Crop Left') as HTMLInputElement).step).toBe('5')
  })

  it('updates the camera overlay state when Move X changes', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Move X'), {
      target: { value: '120' },
    })

    expect(useAppStore.getState().cameraOverlay.offsetX).toBe(120)
  })

  it('starts the align flow and shows the lowest-A instruction', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'ALIGN' }))

    expect(mockSetKeyboardOpacity).toHaveBeenCalledWith(0.3)
    expect(useAppStore.getState().alignStep).toBe('waiting-low-a')
    expect(screen.getByText('Click the lowest A key on your piano in the camera feed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('shows the second-step instruction and completed message from shared align state', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    act(() => {
      useAppStore.getState().setAlignStep('waiting-high-c')
      useAppStore.getState().setLowAPoint({ x: 200, y: 260 })
    })
    expect(screen.getByText('Now click the highest C key on your piano in the camera feed')).toBeTruthy()

    act(() => {
      useAppStore.getState().setHighCPoint({ x: 1000, y: 300 })
      useAppStore.getState().setAlignStep('complete')
    })
    expect(screen.getByText('Aligned - adjust with Move X/Y if needed')).toBeTruthy()
  })

  it('cancels alignment and restores keyboard opacity', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'ALIGN' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockSetKeyboardOpacity).toHaveBeenLastCalledWith(1)
    expect(useAppStore.getState().alignStep).toBe('idle')
    expect(screen.queryByText('Click the lowest A key on your piano in the camera feed')).toBeNull()
  })

  it('switches back to the pieces tab from the back button', () => {
    render(<CameraControlsPanelHarness />)

    expect(screen.getByTestId('camera-controls-panel')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← Pieces' }))
    expect(screen.getByTestId('pieces-tab-view')).toBeTruthy()
  })
})

function CameraControlsPanelHarness() {
  const [showPanel, setShowPanel] = React.useState(true)

  if (!showPanel) {
    return <div data-testid="pieces-tab-view">Pieces</div>
  }

  return (
    <CameraControlsPanel
      onBack={() => {
        setShowPanel(false)
      }}
    />
  )
}
