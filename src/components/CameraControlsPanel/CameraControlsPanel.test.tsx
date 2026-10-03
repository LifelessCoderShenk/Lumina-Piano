import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'

const mockSetKeyboardOpacity = vi.hoisted(() => vi.fn())
const mockActiveRenderer = vi.hoisted(() => ({
  current: null as null | {
    getKeyX: (pitch: number) => number
    getKeyboardY: () => number
    setKeyboardOpacity: (opacity: number) => void
  },
}))

vi.mock('../../renderer/activeVisualizerRenderer', () => ({
  getActiveVisualizerRenderer: () => mockActiveRenderer.current,
}))

const { CameraControlsPanel } = await import('./CameraControlsPanel')

describe('CameraControlsPanel', () => {
  beforeEach(() => {
    resetStore()
    mockSetKeyboardOpacity.mockReset()
    mockActiveRenderer.current = {
      getKeyX: () => 0,
      getKeyboardY: () => 0,
      setKeyboardOpacity: mockSetKeyboardOpacity,
    }
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
    expect(screen.getByRole('button', { name: 'Flip Horizontal' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Flip Vertical' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByLabelText('Rotation').textContent).toContain('0')
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

  it('resets every crop edge in one action', () => {
    useAppStore.getState().setCameraOverlay({
      cropBottom: 40,
      cropLeft: 10,
      cropRight: 30,
      cropTop: 20,
    })
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset Crop' }))

    expect(useAppStore.getState().cameraOverlay).toMatchObject({
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
    })
  })

  it('coalesces crop edits to one animation-frame store update and clamps them to source dimensions', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const setCameraOverlay = vi.spyOn(useAppStore.getState(), 'setCameraOverlay')
    render(<CameraControlsPanel onBack={() => undefined} sourceVideoDimensions={{ height: 100, width: 100 }} />)

    fireEvent.change(screen.getByLabelText('Crop Left'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Crop Left'), { target: { value: '200' } })

    expect(callbacks).toHaveLength(1)
    expect(useAppStore.getState().cameraOverlay.cropLeft).toBe(0)
    act(() => callbacks[0](0))
    expect(useAppStore.getState().cameraOverlay.cropLeft).toBe(99)
    expect(setCameraOverlay).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('uses a conservative pre-metadata crop cap instead of allowing arbitrary input', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Crop Top'), { target: { value: '999999' } })
    expect((screen.getByLabelText('Crop Top') as HTMLInputElement).value).toBe('4096')
    act(() => callbacks[0](0))
    expect(useAppStore.getState().cameraOverlay.cropTop).toBe(4096)
    vi.unstubAllGlobals()
  })

  it('starts the align flow and shows the lowest-A instruction', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'ALIGN' }))

    expect(mockSetKeyboardOpacity).toHaveBeenCalledWith(0.3)
    expect(useAppStore.getState().alignStep).toBe('waiting-low-a')
    expect(screen.getByText('Click the lowest A key on your piano in the camera feed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('updates flip state and rotates in 90-degree steps', () => {
    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Flip Horizontal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flip Vertical' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Right' }))

    expect(useAppStore.getState().cameraOverlay).toMatchObject({
      flipHorizontal: true,
      flipVertical: true,
      rotation: 90,
    })
    expect(screen.getByRole('button', { name: 'Flip Horizontal' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Flip Vertical' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Rotation').textContent).toContain('90')

    fireEvent.click(screen.getByRole('button', { name: 'Rotate Left' }))
    expect(useAppStore.getState().cameraOverlay.rotation).toBe(0)
  })

  it('still starts alignment safely when no active visualizer renderer is mounted', () => {
    mockActiveRenderer.current = null

    render(<CameraControlsPanel onBack={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'ALIGN' }))

    expect(mockSetKeyboardOpacity).not.toHaveBeenCalled()
    expect(useAppStore.getState().alignStep).toBe('waiting-low-a')
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
    fireEvent.click(screen.getByRole('button', { name: 'Pieces' }))
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
