import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRendererDestroy = vi.hoisted(() => vi.fn())
const mockRendererInit = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererIsReady = vi.hoisted(() => vi.fn(() => false))
const mockRendererRenderFrame = vi.hoisted(() => vi.fn())
const mockRendererResize = vi.hoisted(() => vi.fn())
const mockCameraInit = vi.hoisted(() => vi.fn())
const mockCameraIsInitialized = vi.hoisted(() => vi.fn(() => false))
const mockCameraSetViewportSize = vi.hoisted(() => vi.fn())

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    destroy: mockRendererDestroy,
    init: mockRendererInit,
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

vi.mock('../../store/store', () => ({
  getAppState: () => ({
    currentTick: 0,
    isProjectLoaded: true,
    projectData: null,
  }),
}))

const { CanvasArea } = await import('./CanvasArea')

describe('CanvasArea', () => {
  beforeEach(() => {
    mockRendererDestroy.mockReset()
    mockRendererInit.mockReset()
    mockRendererInit.mockImplementation(async () => undefined)
    mockRendererIsReady.mockReset()
    mockRendererIsReady.mockReturnValue(false)
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
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('always calls destroy() before init() on mount', async () => {
    render(<CanvasArea />)

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(mockRendererDestroy).toHaveBeenCalledTimes(1)
    expect(mockRendererDestroy.mock.invocationCallOrder[0]).toBeLessThan(mockRendererInit.mock.invocationCallOrder[0])
  })

  it('tears down and re-initializes again on remount', async () => {
    const firstRender = render(<CanvasArea />)

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })

    firstRender.unmount()

    render(<CanvasArea />)

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(2)
    })

    expect(mockRendererDestroy).toHaveBeenCalledTimes(2)
    expect(mockRendererDestroy.mock.invocationCallOrder[1]).toBeLessThan(mockRendererInit.mock.invocationCallOrder[1])
  })
})
