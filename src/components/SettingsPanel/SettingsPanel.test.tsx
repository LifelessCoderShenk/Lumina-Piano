import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRendererDestroy = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererInit = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererIsReady = vi.hoisted(() => vi.fn(() => false))
const mockRendererIsInitialized = vi.hoisted(() => ({ value: true }))
const mockRendererRenderFrame = vi.hoisted(() => vi.fn())
const mockRendererResize = vi.hoisted(() => vi.fn())
const mockCameraInit = vi.hoisted(() => vi.fn())
const mockCameraIsInitialized = vi.hoisted(() => vi.fn(() => false))
const mockCameraSetViewportSize = vi.hoisted(() => vi.fn())

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    destroy: mockRendererDestroy,
    init: mockRendererInit,
    get isInitialized() {
      return mockRendererIsInitialized.value
    },
    isReady: mockRendererIsReady,
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
    mockRendererDestroy.mockReset()
    mockRendererDestroy.mockImplementation(async () => undefined)
    mockRendererInit.mockReset()
    mockRendererInit.mockImplementation(async () => undefined)
    mockRendererIsReady.mockReset()
    mockRendererIsReady.mockReturnValue(false)
    mockRendererIsInitialized.value = true
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
    vi.unstubAllGlobals()
  })

  it('renders all three segmented controls with the correct options and default selections', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    expect(screen.getByText('ASPECT RATIO')).toBeTruthy()
    expect(screen.getByText('RESOLUTION')).toBeTruthy()
    expect(screen.getByText('FRAMERATE')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fit' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '16:9' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1:1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4:3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1080p' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '720p' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1440p' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4K' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '60' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '24' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '30' })).toBeTruthy()
    expect(useAppStore.getState().visualizerSettings).toEqual(visualizerSettingsInitial)
  })

  it('selecting aspect ratio updates the store and changes the canvas preview dimensions', async () => {
    render(
      <>
        <SettingsPanel onClose={() => undefined} />
        <CanvasArea />
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

  it('selecting resolution and framerate updates the store', () => {
    render(<SettingsPanel onClose={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    fireEvent.click(screen.getByRole('button', { name: '24' }))

    expect(useAppStore.getState().visualizerSettings.resolution).toBe('4K')
    expect(useAppStore.getState().visualizerSettings.framerate).toBe(24)
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
