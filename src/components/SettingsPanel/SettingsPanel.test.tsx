import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRendererDestroy = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererCanvas = vi.hoisted(() => ({ current: null as HTMLCanvasElement | null }))
const mockRendererInit = vi.hoisted(() => vi.fn(async (canvas: HTMLCanvasElement) => {
  mockRendererCanvas.current = canvas
}))
const mockRendererRenderFrame = vi.hoisted(() => vi.fn())
const mockRendererResize = vi.hoisted(() => vi.fn())
const mockCameraInit = vi.hoisted(() => vi.fn())
const mockCameraIsInitialized = vi.hoisted(() => vi.fn(() => false))
const mockCameraSetViewportSize = vi.hoisted(() => vi.fn())

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    destroy: mockRendererDestroy,
    getCanvas: () => {
      if (mockRendererCanvas.current == null) {
        throw new Error('Renderer canvas requested before initialization.')
      }

      return mockRendererCanvas.current
    },
    init: mockRendererInit,
    renderFrame: mockRendererRenderFrame,
    resize: mockRendererResize,
  },
}))

vi.mock('../../camera/CameraSystem', () => ({
  cameraSystem: {
    init: mockCameraInit,
    isInitialized: mockCameraIsInitialized,
    setViewportSize: mockCameraSetViewportSize,
  },
}))

const { CanvasArea } = await import('../CanvasArea/CanvasArea')
const { EditPanel } = await import('../EditPanel/EditPanel')
const { SettingsPanel } = await import('./SettingsPanel')
const { resetStore, useAppStore, visualizerSettingsInitial } = await import('../../store/store')

describe('SettingsPanel', () => {
  beforeEach(() => {
    resetStore()
    applyDesignTokens()
    mockRendererCanvas.current = null
    mockRendererDestroy.mockReset()
    mockRendererDestroy.mockImplementation(async () => {
      mockRendererCanvas.current = null
    })
    mockRendererInit.mockReset()
    mockRendererInit.mockImplementation(async (canvas: HTMLCanvasElement) => {
      mockRendererCanvas.current = canvas
    })
    mockRendererRenderFrame.mockReset()
    mockRendererResize.mockReset()
    mockCameraInit.mockReset()
    mockCameraIsInitialized.mockReset()
    mockCameraIsInitialized.mockReturnValue(false)
    mockCameraSetViewportSize.mockReset()

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(16)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      disconnect() {}
    })

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 800
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 600
      },
    })

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    })
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(async () => undefined),
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(async () => undefined),
    })
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders all three segmented controls with the correct options and default selections', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    expect(screen.getByText('ASPECT RATIO')).toBeTruthy()
    expect(screen.getByText('RESOLUTION')).toBeTruthy()
    expect(screen.getByText('FRAMERATE')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fit' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '16:9' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '9:16' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1:1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4:3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1080p' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '720p' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4K' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '60' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '30' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1440p' })).toBeNull()
    expect(screen.queryByRole('button', { name: '24' })).toBeNull()
    expect(useAppStore.getState().visualizerSettings).toEqual(visualizerSettingsInitial)
  })

  it('selecting aspect ratio updates the store and changes the canvas preview dimensions', async () => {
    render(
      <>
        <SettingsPanel onClose={() => undefined} />
        <CanvasArea engine="pixi" />
      </>,
    )

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: '1:1' }))

    expect(useAppStore.getState().visualizerSettings.aspectRatio).toBe('1:1')

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('600px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('600px')
    })
  })

  it('selects a vertical social frame without normalizing it back to fit', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '9:16' }))

    expect(useAppStore.getState().visualizerSettings.aspectRatio).toBe('9:16')
  })

  it('selecting resolution and framerate updates the store', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    fireEvent.click(screen.getByRole('button', { name: '30' }))

    expect(useAppStore.getState().visualizerSettings.resolution).toBe('4K')
    expect(useAppStore.getState().visualizerSettings.framerate).toBe(30)
  })

  it('updates the visualizer background and independently toggles note names on notes and keys', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Visualizer background'), { target: { value: '#303030' } })
    fireEvent.click(screen.getByLabelText('Show note names on falling notes'))

    expect(useAppStore.getState().backgroundColor).toBe('#303030')
    expect(useAppStore.getState().noteLabelsOnNotes).toBe(false)
    expect(useAppStore.getState().noteLabelsOnKeys).toBe(false)

    fireEvent.click(screen.getByLabelText('Show note names on keyboard keys'))
    expect(useAppStore.getState().noteLabelsOnKeys).toBe(true)
  })

  it('adds, previews, replaces, and removes a custom background image', async () => {
    render(<SettingsPanel onClose={() => undefined} />)

    const file = new File(['custom-background'], 'concert.webp', { type: 'image/webp' })
    fireEvent.change(screen.getByLabelText('Choose background image file'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(useAppStore.getState().backgroundImage).toMatch(/^data:image\/webp;base64,/)
    })
    expect(screen.getByAltText('Custom background preview')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plain' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Background image blur'), { target: { value: '35' } })
    fireEvent.change(screen.getByLabelText('Background image dim'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('Background image color'), { target: { value: '118' } })
    fireEvent.change(screen.getByLabelText('Background image vignette'), { target: { value: '55' } })
    expect(useAppStore.getState().backgroundImageTreatment).toEqual({
      blur: 35,
      dim: 42,
      saturation: 118,
      vignette: 55,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove background image' }))

    expect(useAppStore.getState().backgroundImage).toBeNull()
    expect(screen.getByRole('button', { name: 'Add image' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plain' })).toBeTruthy()
  })

  it('rejects unsupported background files without changing the visualizer', async () => {
    render(<SettingsPanel onClose={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Choose background image file'), {
      target: { files: [new File(['svg'], 'background.svg', { type: 'image/svg+xml' })] },
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Choose a PNG, JPG, or WebP image.')
    expect(useAppStore.getState().backgroundImage).toBeNull()
  })

  it('switches falling-note material and adjusts note glow', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Sculpted' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Saber' }))
    fireEvent.change(screen.getByLabelText('Fall speed'), { target: { value: '140' } })
    fireEvent.change(screen.getByLabelText('Note width'), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText('Note opacity'), { target: { value: '72' } })
    fireEvent.change(screen.getByLabelText('Note glow'), { target: { value: '160' } })
    fireEvent.change(screen.getByLabelText('Reactive lighting'), { target: { value: '70' } })

    expect(useAppStore.getState().noteStyle).toBe('saber')
    expect(useAppStore.getState().fallSpeed).toBe(140)
    expect(useAppStore.getState().noteWidth).toBe(80)
    expect(useAppStore.getState().noteOpacity).toBe(72)
    expect(useAppStore.getState().noteGlow).toBe(160)
    expect(useAppStore.getState().lightingIntensity).toBe(70)
    expect(screen.getByText('160%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Outline' }))
    expect(useAppStore.getState().noteStyle).toBe('outline')

    fireEvent.click(screen.getByRole('button', { name: 'Crystal' }))
    expect(useAppStore.getState().noteStyle).toBe('crystal')

    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))
    expect(useAppStore.getState().noteStyle).toBe('gem')
  })

  it('enables keyboard beams without changing the falling-note style', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    expect((screen.getByLabelText('Show keyboard beams') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByLabelText('Show keyboard beams'))

    expect(useAppStore.getState().keyboardSaber).toBe(true)
    expect(useAppStore.getState().noteStyle).toBe('gradient')
  })

  it('keeps ghost hands off by default and reveals one opacity control when enabled', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    expect((screen.getByLabelText('Show ghost hands') as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByLabelText('Ghost hands opacity')).toBeNull()

    fireEvent.click(screen.getByLabelText('Show ghost hands'))

    expect(useAppStore.getState().handVisualization.enabled).toBe(true)
    expect((screen.getByLabelText('Ghost hands opacity') as HTMLInputElement).value).toBe('35')

    fireEvent.change(screen.getByLabelText('Ghost hands opacity'), { target: { value: '56' } })

    expect(useAppStore.getState().handVisualization.opacity).toBe(56)
    expect(screen.getByText('56%')).toBeTruthy()
  })

  it('switches the live background scene', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Plain' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Studio' }))

    expect(useAppStore.getState().backgroundStyle).toBe('studio')
    expect(screen.getByRole('button', { name: 'Studio' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Stage' }))
    expect(useAppStore.getState().backgroundStyle).toBe('stage')
  })

  it('opens and closes via the top bar settings button', () => {
    render(<EditPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByTestId('settings-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByTestId('settings-panel')).toBeNull()
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}
