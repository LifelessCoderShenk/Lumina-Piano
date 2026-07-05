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
const mockResizeObserverCallback = vi.hoisted(() => ({ current: null as null | ResizeObserverCallback }))
const mockWindowMaximize = vi.hoisted(() => vi.fn(async () => undefined))
const mockClientSize = vi.hoisted(() => ({ height: 600, width: 800 }))
const mockStoreState = vi.hoisted(() => ({
  appMode: 'create' as const,
  currentTick: 0,
  isProjectLoaded: false,
  projectData: null as null,
  visualizerSettings: {
    aspectRatio: 'fit' as const,
  },
}))

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

vi.mock('../../store/store', () => ({
  getAppState: () => mockStoreState,
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

const { CanvasArea } = await import('./CanvasArea')

describe('CanvasArea', () => {
  beforeEach(() => {
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
    mockStoreState.appMode = 'create'
    mockStoreState.visualizerSettings.aspectRatio = 'fit'
    mockWindowMaximize.mockReset()
    mockWindowMaximize.mockImplementation(async () => undefined)
    mockClientSize.width = 800
    mockClientSize.height = 600

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(16)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    mockResizeObserverCallback.current = null
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        mockResizeObserverCallback.current = callback
      }

      observe() {}
      disconnect() {}
    })

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return mockClientSize.width
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return mockClientSize.height
      },
    })

    window.electronAPI = {
      window: {
        close: vi.fn(async () => undefined),
        maximize: mockWindowMaximize,
        minimize: vi.fn(async () => undefined),
      },
    } as typeof window.electronAPI
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

    expect(mockRendererDestroy).toHaveBeenCalledTimes(3)
    expect(mockRendererDestroy.mock.invocationCallOrder[2]).toBeLessThan(mockRendererInit.mock.invocationCallOrder[1])
  })

  it('cancels a pending init if the component unmounts before destroy resolves', async () => {
    let resolveDestroy: (() => void) | null = null
    mockRendererDestroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDestroy = resolve
        }),
    )

    const view = render(<CanvasArea />)

    view.unmount()
    resolveDestroy?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockRendererInit).not.toHaveBeenCalled()
  })

  it('rapid mount/unmount/mount cycles only initialize the last active mount', async () => {
    let resolveFirstDestroy: (() => void) | null = null
    mockRendererDestroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstDestroy = resolve
        }),
    )

    const firstView = render(<CanvasArea />)
    firstView.unmount()

    render(<CanvasArea />)
    resolveFirstDestroy?.()

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(mockRendererDestroy).toHaveBeenCalledTimes(3)
    expect(mockRendererDestroy.mock.invocationCallOrder[1]).toBeLessThan(mockRendererInit.mock.invocationCallOrder[0])
  })

  it('initializes once the canvas area gains non-zero dimensions after mounting at 0x0', async () => {
    mockClientSize.width = 0
    mockClientSize.height = 0

    render(<CanvasArea />)

    await Promise.resolve()
    expect(mockRendererInit).not.toHaveBeenCalled()

    mockClientSize.width = 800
    mockClientSize.height = 600
    mockResizeObserverCallback.current?.([], {} as ResizeObserver)

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })
  })

  it('fills the available space with a full-size canvas container', async () => {
    render(<CanvasArea />)

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })

    const canvasArea = screen.getByTestId('canvas-area')
    expect(canvasArea.style.flex).toBe('1 1 100%')
    expect(canvasArea.style.width).toBe('100%')
    expect(canvasArea.style.height).toBe('100%')
    expect(canvasArea.style.margin).toBe('0px')
    expect(canvasArea.style.padding).toBe('0px')
    expect(canvasArea.style.overflow).toBe('hidden')
    expect(screen.getByTestId('canvas-available-area')).toBeTruthy()
    expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('800px')
    expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('600px')
  })

  it('renders a window expand button in Create Mode', async () => {
    render(<CanvasArea />)

    await waitFor(() => {
      expect(mockRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: 'Expand window' })).toBeTruthy()
  })

  it('resizes the renderer to the container clientWidth and clientHeight with no offsets', async () => {
    mockRendererIsReady.mockReturnValueOnce(false).mockReturnValue(true)

    render(<CanvasArea />)

    await waitFor(() => {
      expect(mockRendererResize).toHaveBeenCalledWith(800, 600)
    })
  })

  it('uses the top-right button to maximize the app window instead of entering fullscreen', async () => {
    render(<CanvasArea />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand window' }))

    await waitFor(() => {
      expect(mockWindowMaximize).toHaveBeenCalledTimes(1)
    })
  })

  it('re-renders on visibility restore even when no project is loaded', async () => {
    mockRendererIsReady.mockReturnValue(true)

    render(<CanvasArea />)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(mockRendererRenderFrame).toHaveBeenCalledWith(0)
    })
  })

  it('recomputes constrained dimensions when the aspect ratio changes', async () => {
    mockRendererIsReady.mockReturnValue(true)
    mockCameraIsInitialized.mockReturnValue(true)

    const view = render(<CanvasArea />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('800px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('600px')
    })

    mockStoreState.visualizerSettings.aspectRatio = '16:9'
    view.rerender(<CanvasArea />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('800px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('450px')
      expect(mockRendererResize).toHaveBeenCalledWith(800, 450)
    })

    mockStoreState.visualizerSettings.aspectRatio = '1:1'
    view.rerender(<CanvasArea />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('600px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('600px')
      expect(mockRendererResize).toHaveBeenCalledWith(600, 600)
    })
  })
})
