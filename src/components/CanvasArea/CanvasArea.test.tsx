import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPixiRendererCanvas = vi.hoisted(() => ({ current: null as HTMLCanvasElement | null }))
const mockPixiRendererDestroy = vi.hoisted(() => vi.fn(async () => {
  mockPixiRendererCanvas.current = null
}))
const mockPixiRendererInit = vi.hoisted(() => vi.fn(async (canvas: HTMLCanvasElement) => {
  mockPixiRendererCanvas.current = canvas
}))
const mockPixiRendererRenderFrame = vi.hoisted(() => vi.fn())
const mockPixiRendererResize = vi.hoisted(() => vi.fn())
const mockPixiRendererGetKeyX = vi.hoisted(() => vi.fn(() => 100))
const mockPixiRendererGetKeyboardY = vi.hoisted(() => vi.fn(() => 120))
const mockPixiRendererSetKeyboardOpacity = vi.hoisted(() => vi.fn())
const mockThreeRendererCanvas = vi.hoisted(() => ({ current: null as HTMLCanvasElement | null }))
const mockThreeRendererDestroy = vi.hoisted(() => vi.fn(async () => {
  mockThreeRendererCanvas.current = null
}))
const mockThreeRendererInit = vi.hoisted(() => vi.fn(async (canvas: HTMLCanvasElement) => {
  mockThreeRendererCanvas.current = canvas
}))
const mockThreeRendererRenderFrame = vi.hoisted(() => vi.fn())
const mockThreeRendererResize = vi.hoisted(() => vi.fn())
const mockThreeRendererGetKeyX = vi.hoisted(() => vi.fn(() => 200))
const mockThreeRendererGetKeyboardY = vi.hoisted(() => vi.fn(() => 220))
const mockThreeRendererSetKeyboardOpacity = vi.hoisted(() => vi.fn())
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
    destroy: mockPixiRendererDestroy,
    getCanvas: () => {
      if (mockPixiRendererCanvas.current == null) {
        throw new Error('Pixi renderer canvas was requested before initialization.')
      }

      return mockPixiRendererCanvas.current
    },
    init: mockPixiRendererInit,
    getKeyX: mockPixiRendererGetKeyX,
    getKeyboardY: mockPixiRendererGetKeyboardY,
    renderFrame: mockPixiRendererRenderFrame,
    resize: mockPixiRendererResize,
    setKeyboardOpacity: mockPixiRendererSetKeyboardOpacity,
  },
}))

vi.mock('../../renderer/ThreeRenderer', () => ({
  threeRenderer: {
    destroy: mockThreeRendererDestroy,
    getCanvas: () => {
      if (mockThreeRendererCanvas.current == null) {
        throw new Error('Three renderer canvas was requested before initialization.')
      }

      return mockThreeRendererCanvas.current
    },
    init: mockThreeRendererInit,
    getKeyX: mockThreeRendererGetKeyX,
    getKeyboardY: mockThreeRendererGetKeyboardY,
    renderFrame: mockThreeRendererRenderFrame,
    resize: mockThreeRendererResize,
    setKeyboardOpacity: mockThreeRendererSetKeyboardOpacity,
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
const { getActiveVisualizerRenderer } = await import('../../renderer/activeVisualizerRenderer')

describe('CanvasArea', () => {
  beforeEach(() => {
    mockPixiRendererCanvas.current = null
    mockPixiRendererDestroy.mockReset()
    mockPixiRendererDestroy.mockImplementation(async () => {
      mockPixiRendererCanvas.current = null
    })
    mockPixiRendererInit.mockReset()
    mockPixiRendererInit.mockImplementation(async (canvas: HTMLCanvasElement) => {
      mockPixiRendererCanvas.current = canvas
    })
    mockPixiRendererRenderFrame.mockReset()
    mockPixiRendererResize.mockReset()
    mockPixiRendererGetKeyX.mockReset()
    mockPixiRendererGetKeyboardY.mockReset()
    mockPixiRendererSetKeyboardOpacity.mockReset()
    mockThreeRendererCanvas.current = null
    mockThreeRendererDestroy.mockReset()
    mockThreeRendererDestroy.mockImplementation(async () => {
      mockThreeRendererCanvas.current = null
    })
    mockThreeRendererInit.mockReset()
    mockThreeRendererInit.mockImplementation(async (canvas: HTMLCanvasElement) => {
      mockThreeRendererCanvas.current = canvas
    })
    mockThreeRendererRenderFrame.mockReset()
    mockThreeRendererResize.mockReset()
    mockThreeRendererGetKeyX.mockReset()
    mockThreeRendererGetKeyboardY.mockReset()
    mockThreeRendererSetKeyboardOpacity.mockReset()
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
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('always calls destroy() before init() on mount', async () => {
    render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(mockPixiRendererDestroy).toHaveBeenCalledTimes(1)
    expect(mockPixiRendererDestroy.mock.invocationCallOrder[0]).toBeLessThan(mockPixiRendererInit.mock.invocationCallOrder[0])
  })

  it('tears down and re-initializes again on remount', async () => {
    const firstRender = render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    firstRender.unmount()

    render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(2)
    })

    expect(mockPixiRendererDestroy).toHaveBeenCalledTimes(3)
    expect(mockPixiRendererDestroy.mock.invocationCallOrder[2]).toBeLessThan(mockPixiRendererInit.mock.invocationCallOrder[1])
  })

  it('cancels a pending init if the component unmounts before destroy resolves', async () => {
    let resolveDestroy: (() => void) | null = null
    mockPixiRendererDestroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDestroy = resolve
        }),
    )

    const view = render(<CanvasArea engine="pixi" />)

    view.unmount()
    resolveDestroy?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPixiRendererInit).not.toHaveBeenCalled()
  })

  it('rapid mount/unmount/mount cycles only initialize the last active mount', async () => {
    let resolveFirstDestroy: (() => void) | null = null
    mockPixiRendererDestroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstDestroy = resolve
        }),
    )

    const firstView = render(<CanvasArea engine="pixi" />)
    firstView.unmount()

    render(<CanvasArea engine="pixi" />)
    resolveFirstDestroy?.()

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(mockPixiRendererDestroy).toHaveBeenCalledTimes(3)
    expect(mockPixiRendererDestroy.mock.invocationCallOrder[1]).toBeLessThan(mockPixiRendererInit.mock.invocationCallOrder[0])
  })

  it('initializes once the canvas area gains non-zero dimensions after mounting at 0x0', async () => {
    mockClientSize.width = 0
    mockClientSize.height = 0

    render(<CanvasArea engine="pixi" />)

    await Promise.resolve()
    expect(mockPixiRendererInit).not.toHaveBeenCalled()

    mockClientSize.width = 800
    mockClientSize.height = 600
    mockResizeObserverCallback.current?.([], {} as ResizeObserver)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })
  })

  it('fills the available space with a full-size canvas container', async () => {
    render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
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
    render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: 'Expand window' })).toBeTruthy()
  })

  it('resizes the renderer to the container clientWidth and clientHeight with no offsets', async () => {
    render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererResize).toHaveBeenCalledWith(800, 600)
    })
  })

  it('uses the top-right button to maximize the app window instead of entering fullscreen', async () => {
    render(<CanvasArea engine="pixi" />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand window' }))

    await waitFor(() => {
      expect(mockWindowMaximize).toHaveBeenCalledTimes(1)
    })
  })

  it('re-renders on visibility restore even when no project is loaded', async () => {
    render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(mockPixiRendererRenderFrame).toHaveBeenCalledWith(0)
    })
  })

  it('recomputes constrained dimensions when the aspect ratio changes', async () => {
    mockCameraIsInitialized.mockReturnValue(true)

    const view = render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('800px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('600px')
    })

    mockStoreState.visualizerSettings.aspectRatio = '16:9'
    view.rerender(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('800px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('450px')
      expect(mockPixiRendererResize).toHaveBeenCalledWith(800, 450)
    })

    mockStoreState.visualizerSettings.aspectRatio = '1:1'
    view.rerender(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-preview-frame').style.width).toBe('600px')
      expect(screen.getByTestId('canvas-preview-frame').style.height).toBe('600px')
      expect(mockPixiRendererResize).toHaveBeenCalledWith(600, 600)
    })
  })

  it('drives the three renderer when engine is set to three', async () => {
    render(<CanvasArea engine="three" />)

    await waitFor(() => {
      expect(mockThreeRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(mockPixiRendererInit).not.toHaveBeenCalled()
    expect(mockThreeRendererDestroy).toHaveBeenCalledTimes(1)
    expect(mockThreeRendererResize).toHaveBeenCalledWith(800, 600)
    expect(mockThreeRendererCanvas.current).toBeInstanceOf(HTMLCanvasElement)
    expect(getActiveVisualizerRenderer()?.setKeyboardOpacity).toBe(mockThreeRendererSetKeyboardOpacity)
  })

  it('re-initializes with the other engine when the prop changes on the same mount', async () => {
    const view = render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    view.rerender(<CanvasArea engine="three" />)

    await waitFor(() => {
      expect(mockThreeRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(mockPixiRendererDestroy).toHaveBeenCalled()
    expect(getActiveVisualizerRenderer()?.setKeyboardOpacity).toBe(mockThreeRendererSetKeyboardOpacity)
  })

  it('registers the active renderer on mount and clears it on unmount', async () => {
    const view = render(<CanvasArea engine="pixi" />)

    await waitFor(() => {
      expect(mockPixiRendererInit).toHaveBeenCalledTimes(1)
    })

    expect(getActiveVisualizerRenderer()?.setKeyboardOpacity).toBe(mockPixiRendererSetKeyboardOpacity)

    view.unmount()

    expect(getActiveVisualizerRenderer()).toBeNull()
  })
})
