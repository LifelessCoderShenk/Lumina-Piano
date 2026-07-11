import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'

const TIMELINE_HEIGHT_PX = 120
let createdVideoElements: HTMLVideoElement[] = []
let animationFrameCallbacks: FrameRequestCallback[] = []

const mockWarmUp = vi.hoisted(() => vi.fn(async () => undefined))
const mockSetMuted = vi.hoisted(() => vi.fn())
const mockRendererGetKeyX = vi.hoisted(() => vi.fn((pitch: number) => (pitch === 21 ? 100 : 900)))
const mockRendererGetKeyboardY = vi.hoisted(() => vi.fn(() => 120))
const mockRendererSetKeyboardOpacity = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlayWithPreRoll = vi.hoisted(() => vi.fn())
const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackGetCurrentTick = vi.hoisted(() => vi.fn(() => 0))
const mockPlaybackSeek = vi.hoisted(() => vi.fn())
const mockPlaybackListeners = vi.hoisted(() => new Map<string, Set<(...args: any[]) => void>>())
const mockPlaybackOn = vi.hoisted(() =>
  vi.fn((event: string, listener: (...args: any[]) => void) => {
    const listeners = mockPlaybackListeners.get(event) ?? new Set<(...args: any[]) => void>()
    listeners.add(listener)
    mockPlaybackListeners.set(event, listeners)
  }),
)
const mockPlaybackOff = vi.hoisted(() =>
  vi.fn((event: string, listener: (...args: any[]) => void) => {
    mockPlaybackListeners.get(event)?.delete(listener)
  }),
)
const mockGetUserMedia = vi.hoisted(() => vi.fn())
const mockTrackStop = vi.hoisted(() => vi.fn())
const mockVideoPlay = vi.hoisted(() => vi.fn(async () => undefined))
const mockVideoPause = vi.hoisted(() => vi.fn())
const mockVideoLoad = vi.hoisted(() => vi.fn())
const mockCanvasContext = vi.hoisted(() => ({
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '#000000',
  fillText: vi.fn(),
  font: '',
  lineTo: vi.fn(),
  lineWidth: 1,
  moveTo: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: '#2e65a2',
  textBaseline: 'alphabetic' as CanvasTextBaseline,
}))
const mockCaptureStream = vi.hoisted(() => vi.fn(() => ({ getTracks: () => [] })))
const mockMediaRecorderStart = vi.hoisted(() => vi.fn())
const mockMediaRecorderStop = vi.hoisted(() => vi.fn())
const mockCreateObjectURL = vi.hoisted(() => vi.fn(() => 'blob:camera-mode'))
const mockRevokeObjectURL = vi.hoisted(() => vi.fn())
const mockAnchorClick = vi.hoisted(() => vi.fn())
const mockDecodeAudioData = vi.hoisted(() => vi.fn())
const mockAudioContextClose = vi.hoisted(() => vi.fn(async () => undefined))
const mockActiveVisualizerCanvas = vi.hoisted(() => ({
  current: null as HTMLCanvasElement | null,
}))

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    setMuted: mockSetMuted,
    warmUp: mockWarmUp,
  },
}))

vi.mock('../../renderer/Renderer', () => ({
  renderer: {
    getKeyX: mockRendererGetKeyX,
    getKeyboardY: mockRendererGetKeyboardY,
    setKeyboardOpacity: mockRendererSetKeyboardOpacity,
  },
}))

vi.mock('../../renderer/activeCanvas', () => ({
  getActiveVisualizerCanvas: () => mockActiveVisualizerCanvas.current,
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    getCurrentTick: mockPlaybackGetCurrentTick,
    off: mockPlaybackOff,
    on: mockPlaybackOn,
    pause: mockPlaybackPause,
    play: mockPlaybackPlay,
    playWithPreRoll: mockPlayWithPreRoll,
    seek: mockPlaybackSeek,
  },
}))

const { CameraMode } = await import('./CameraMode')

describe('CameraMode', () => {
  beforeEach(() => {
    resetStore()
    applyDesignTokens()
    vi.useRealTimers()
    mockWarmUp.mockReset()
    mockWarmUp.mockImplementation(async () => undefined)
    mockSetMuted.mockReset()
    mockRendererGetKeyX.mockClear()
    mockRendererGetKeyboardY.mockClear()
    mockRendererSetKeyboardOpacity.mockReset()
    mockPlaybackPlay.mockReset()
    mockPlayWithPreRoll.mockReset()
    mockPlaybackPause.mockReset()
    mockPlaybackGetCurrentTick.mockReset()
    mockPlaybackGetCurrentTick.mockReturnValue(0)
    mockPlaybackSeek.mockReset()
    mockPlaybackOn.mockClear()
    mockPlaybackOff.mockClear()
    mockPlaybackListeners.clear()
    mockGetUserMedia.mockReset()
    mockTrackStop.mockReset()
    mockVideoPlay.mockReset()
    mockVideoPlay.mockImplementation(async () => undefined)
    mockVideoPause.mockReset()
    mockVideoLoad.mockReset()
    mockCanvasContext.beginPath.mockReset()
    mockCanvasContext.clearRect.mockReset()
    mockCanvasContext.drawImage.mockReset()
    mockCanvasContext.fillRect.mockReset()
    mockCanvasContext.fillText.mockReset()
    mockCanvasContext.lineTo.mockReset()
    mockCanvasContext.moveTo.mockReset()
    mockCanvasContext.stroke.mockReset()
    mockCaptureStream.mockReset()
    mockCaptureStream.mockImplementation(() => ({ getTracks: () => [] }))
    mockMediaRecorderStart.mockReset()
    mockMediaRecorderStop.mockReset()
    mockCreateObjectURL.mockReset()
    mockCreateObjectURL.mockReturnValue('blob:camera-mode')
    mockRevokeObjectURL.mockReset()
    mockAnchorClick.mockReset()
    mockDecodeAudioData.mockReset()
    mockDecodeAudioData.mockResolvedValue({
      getChannelData: () => new Float32Array([0, 0.25, 0.5, 0.75, 1]),
    })
    mockAudioContextClose.mockReset()
    mockAudioContextClose.mockImplementation(async () => undefined)
    mockActiveVisualizerCanvas.current = null
    createdVideoElements = []
    animationFrameCallbacks = []

    useAppStore.getState().addPiece({
      createdAt: Date.now(),
      filePath: 'C:/pieces/nocturne.mid',
      id: 'piece-1',
      name: 'Nocturne',
      type: 'midi',
    })
    useAppStore.setState({
      appMode: 'createCamera',
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
      projectData: {
        ticksPerQuarter: 480,
        totalTicks: 1920,
        tracks: [],
      },
      precomputedTempoMap: {
        segments: [{
          bpm: 120,
          endTick: Number.POSITIVE_INFINITY,
          microsecondsPerBeat: 500000,
          startSeconds: 0,
          startTick: 0,
          ticksPerSecond: 960,
        }],
      },
    })

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 1200
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 800
      },
    })

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: mockVideoPlay,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: mockVideoPause,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: mockVideoLoad,
    })

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => mockCanvasContext),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: mockCaptureStream,
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: mockGetUserMedia.mockResolvedValue({
          getTracks: () => [{ stop: mockTrackStop }],
        }),
      },
    })

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName.toLowerCase() === 'video') {
        Object.defineProperty(element, 'readyState', {
          configurable: true,
          get: () => HTMLMediaElement.HAVE_METADATA,
        })
        Object.defineProperty(element, 'duration', {
          configurable: true,
          get: () => 5,
        })
        Object.defineProperty(element, 'videoWidth', {
          configurable: true,
          get: () => 1280,
        })
        Object.defineProperty(element, 'videoHeight', {
          configurable: true,
          get: () => 720,
        })
        createdVideoElements.push(element as HTMLVideoElement)
      }
      if (tagName.toLowerCase() === 'a') {
        element.click = mockAnchorClick
      }
      return element
    })

    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    })

    class MockAudioContext {
      decodeAudioData = mockDecodeAudioData
      close = mockAudioContextClose
    }

    vi.stubGlobal('AudioContext', MockAudioContext)

    class MockMediaRecorder {
      state: 'inactive' | 'recording' = 'inactive'
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null

      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

      start() {
        this.state = 'recording'
        mockMediaRecorderStart()
      }

      stop() {
        this.state = 'inactive'
        mockMediaRecorderStop()
        this.ondataavailable?.({ data: new Blob(['recording']) })
        this.onstop?.()
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the visualizer in the top 60% and the webcam in the bottom 40%', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledTimes(1)
    })
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true, video: true })

    expect(screen.getByTestId('camera-visualizer-slot').style.height).toBe('60%')
    expect(screen.getByTestId('camera-mode-panel-slot').style.height).toBe('40%')
    expect(screen.getByTestId('camera-mode-video')).toBeTruthy()
    expect(screen.queryByTestId('camera-mode-preview-video')).toBeNull()
    expect(mockPlaybackSeek).toHaveBeenCalledWith(0)
    expect(mockPlayWithPreRoll).toHaveBeenCalledWith(3)
  })

  it('applies crop styles to the live webcam crop frame from camera overlay settings', async () => {
    useAppStore.getState().setCameraOverlay({
      cropBottom: 16,
      cropLeft: 18,
      cropRight: 14,
      cropTop: 12,
    })

    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('camera-mode-video')).toBeTruthy()
    const cropFrame = screen.getByTestId('camera-mode-crop-frame') as HTMLDivElement
    expect(cropFrame.style.top).toBe('-12px')
    expect(cropFrame.style.left).toBe('-18px')
    expect(cropFrame.style.right).toBe('')
    expect(cropFrame.style.bottom).toBe('')
    expect(cropFrame.style.width).toBe('calc(100% + 32px)')
    expect(cropFrame.style.height).toBe('calc(100% + 28px)')
  })

  it('applies crop styles to the preview crop frame after recording stops', async () => {
    useAppStore.getState().setCameraOverlay({
      cropBottom: 10,
      cropLeft: 8,
      cropRight: 6,
      cropTop: 4,
    })

    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    animationFrameCallbacks = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(screen.getByTestId('camera-mode-preview-video')).toBeTruthy()
    const cropFrame = screen.getByTestId('camera-mode-crop-frame') as HTMLDivElement
    expect(cropFrame.style.top).toBe('-4px')
    expect(cropFrame.style.left).toBe('-8px')
    expect(cropFrame.style.right).toBe('')
    expect(cropFrame.style.bottom).toBe('')
    expect(cropFrame.style.width).toBe('calc(100% + 14px)')
    expect(cropFrame.style.height).toBe('calc(100% + 14px)')
  })

  it('renders an alignment click overlay over the live camera view and forwards clicks', async () => {
    useAppStore.getState().setAlignStep('waiting-low-a')
    const onAlignClick = vi.fn()

    render(<CameraModeHarness onAlignClick={onAlignClick} />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    const overlay = screen.getByTestId('camera-align-click-overlay')
    fireEvent.click(overlay, { clientX: 170, clientY: 290 })
    expect(onAlignClick).toHaveBeenCalledTimes(1)
  })

  it('keeps the alignment click overlay available over the preview video', async () => {
    useAppStore.getState().setAlignStep('waiting-low-a')
    const onAlignClick = vi.fn()

    render(<CameraModeHarness onAlignClick={onAlignClick} />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    animationFrameCallbacks = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(screen.getByTestId('camera-mode-preview-video')).toBeTruthy()
    const overlay = screen.getByTestId('camera-align-click-overlay')
    fireEvent.click(overlay, { clientX: 200, clientY: 240 })
    expect(onAlignClick).toHaveBeenCalled()
  })

  it('starts the webcam stream on mount and stops all tracks on unmount', async () => {
    const view = render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    view.unmount()

    expect(mockTrackStop).toHaveBeenCalledTimes(1)
  })

  it('shows an error state when camera access fails', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('denied'))

    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('camera-error-state')).toBeTruthy()
    })
  })

  it('starts recording at the beginning of the 3 second countdown and aligns playback pre-roll', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    mockWarmUp.mockClear()
    mockPlaybackSeek.mockClear()
    mockPlayWithPreRoll.mockClear()
    mockMediaRecorderStart.mockClear()

    const backButton = screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement
    const recordButton = screen.getByRole('button', { name: 'Start recording' }) as HTMLButtonElement

    fireEvent.click(recordButton)

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockWarmUp).toHaveBeenCalledTimes(1)
    expect(mockSetMuted).toHaveBeenCalledWith(true)
    expect(mockMediaRecorderStart).toHaveBeenCalledTimes(1)
    expect(mockPlaybackSeek).toHaveBeenCalledWith(0)
    expect(mockPlayWithPreRoll).toHaveBeenCalledWith(3)
    expect(screen.getByTestId('camera-countdown').textContent).toBe('3')
    expect(backButton.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Recording countdown' }).textContent).toBe('3')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByTestId('camera-countdown').textContent).toBe('2')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByTestId('camera-countdown').textContent).toBe('1')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('camera-countdown')).toBeNull()
    expect(mockMediaRecorderStart).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Stop recording' }) as HTMLButtonElement).disabled).toBe(false)
    expect(backButton.disabled).toBe(true)
  })

  it('stops recording and resets playback to the beginning', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(mockMediaRecorderStop).toHaveBeenCalledTimes(1)
    expect(mockTrackStop).toHaveBeenCalledTimes(1)
    expect(mockPlaybackPause).toHaveBeenCalled()
    expect(mockPlaybackSeek).toHaveBeenLastCalledWith(0)
    expect(screen.queryByTestId('camera-mode-video')).toBeNull()
    expect(screen.getByTestId('camera-mode-preview-video')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('automatically stops recording when the visualizer finishes', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })

    await act(async () => {
      for (const listener of mockPlaybackListeners.get('onEnded') ?? []) {
        listener()
      }
      await Promise.resolve()
    })

    expect(mockMediaRecorderStop).toHaveBeenCalledTimes(1)
    expect(mockTrackStop).toHaveBeenCalledTimes(1)
    expect(mockPlaybackPause).toHaveBeenCalled()
    expect(mockPlaybackSeek).toHaveBeenLastCalledWith(0)
    expect(screen.queryByTestId('camera-countdown')).toBeNull()
    expect(screen.getByTestId('camera-mode-preview-video')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('plays and pauses the recorded preview after recording stops', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    vi.useRealTimers()
    mockVideoPlay.mockClear()
    mockPlaybackPlay.mockClear()
    mockPlayWithPreRoll.mockClear()
    mockPlaybackPause.mockClear()
    mockPlaybackSeek.mockClear()
    let performanceNow = 1000
    const performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => performanceNow)

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    expect(mockSetMuted).toHaveBeenCalledWith(false)
    expect(mockPlayWithPreRoll).toHaveBeenCalledWith(3)
    expect(mockPlaybackSeek).not.toHaveBeenCalled()

    const previewVideo = screen.getByTestId('camera-mode-preview-video') as HTMLVideoElement
    fireEvent(previewVideo, new Event('play'))
    expect(screen.getByRole('button', { name: 'Pause preview' })).toBeTruthy()

    previewVideo.currentTime = 4.5
    fireEvent(previewVideo, new Event('timeupdate'))
    expect(mockPlaybackSeek).not.toHaveBeenCalled()

    performanceNow = 3500
    fireEvent(previewVideo, new Event('timeupdate'))
    expect(mockPlaybackSeek).toHaveBeenLastCalledWith(1440)

    fireEvent.click(screen.getByRole('button', { name: 'Pause preview' }))

    expect(mockVideoPause).toHaveBeenCalled()
    expect(mockPlaybackPause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeTruthy()
  })

  it('toggles MIDI mute from the control bar', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    const muteButton = screen.getByRole('button', { name: 'Mute MIDI' })
    fireEvent.click(muteButton)
    expect(mockSetMuted).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('button', { name: 'Unmute MIDI' }).textContent).toBe('🔇')

    fireEvent.click(screen.getByRole('button', { name: 'Unmute MIDI' }))
    expect(mockSetMuted).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: 'Mute MIDI' }).textContent).toBe('🎹')
  })

  it('plays preview video without visualizer sync when no project is loaded', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    vi.useRealTimers()
    useAppStore.setState({ isProjectLoaded: false, projectData: null, precomputedTempoMap: null })
    mockVideoPlay.mockClear()
    mockPlayWithPreRoll.mockClear()
    mockPlaybackSeek.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    expect(mockPlayWithPreRoll).not.toHaveBeenCalled()
    expect(mockPlaybackSeek).not.toHaveBeenCalled()
  })

  it('keeps track and export disabled until a recording exists', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    const trackButton = screen.getByRole('button', { name: 'Track' }) as HTMLButtonElement
    const exportButton = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement

    expect(trackButton.disabled).toBe(true)
    expect(exportButton.disabled).toBe(true)

    fireEvent.click(trackButton)
    expect(screen.queryByTestId('camera-mode-timeline')).toBeNull()

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect((screen.getByRole('button', { name: 'Track' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect((screen.getByRole('button', { name: 'Track' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('composites the visualizer on export and disables controls while exporting', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    const createdVideoCountBeforeExport = createdVideoElements.length
    mockVideoPlay.mockClear()
    mockCreateObjectURL.mockClear()
    mockRevokeObjectURL.mockClear()
    mockAnchorClick.mockClear()
    mockMediaRecorderStart.mockClear()
    mockMediaRecorderStop.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Exporting' }).textContent).toBe('EXPORTING...')
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Track' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mockMediaRecorderStart).toHaveBeenCalledTimes(1)
    expect(mockVideoPlay).toHaveBeenCalledTimes(1)

    const exportVideo = createdVideoElements[createdVideoCountBeforeExport]
    expect(exportVideo).toBeTruthy()
    fireEvent(exportVideo, new Event('ended'))

    expect(mockMediaRecorderStop).toHaveBeenCalledTimes(1)
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(2)
    expect(mockAnchorClick).toHaveBeenCalledTimes(1)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:camera-mode')
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Export' }).textContent).toBe('EXPORT')
  })

  it('still exports successfully when camera crop values are set', async () => {
    useAppStore.getState().setCameraOverlay({
      cropBottom: 40,
      cropLeft: 10,
      cropRight: 30,
      cropTop: 20,
    })

    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    mockMediaRecorderStart.mockClear()
    mockVideoPlay.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockMediaRecorderStart).toHaveBeenCalledTimes(1)
    expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Exporting' }).textContent).toBe('EXPORTING...')
  })

  it('shows the interactive timeline after recording and draws the waveform', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))
    await waitFor(() => {
      expect(mockCanvasContext.beginPath).toHaveBeenCalled()
    })

    expect(screen.getByTestId('camera-mode-timeline')).toBeTruthy()
    expect(screen.getByTestId('camera-mode-preview-video')).toBeTruthy()
    expect(screen.getByTestId('camera-track-row-audio')).toBeTruthy()
    expect(screen.getByTestId('camera-track-row-video')).toBeTruthy()
    expect(screen.getByTestId('camera-track-row-visualization')).toBeTruthy()
    expect(screen.getByTestId('camera-audio-waveform')).toBeTruthy()
    expect(mockDecodeAudioData).toHaveBeenCalledTimes(1)
    expect(mockCanvasContext.stroke).toHaveBeenCalled()
    expect(screen.getByTestId('camera-visualizer-slot').style.height).toBe(
      `calc(60% - ${TIMELINE_HEIGHT_PX}px)`,
    )
    expect(screen.getByTestId('camera-mode-panel-slot').style.height).toBe(`calc(40% + ${TIMELINE_HEIGHT_PX}px)`)
    const webcamSection = screen.getByTestId('camera-mode-video-section')
    const timelineSection = screen.getByTestId('camera-mode-timeline')
    expect(webcamSection.compareDocumentPosition(timelineSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Track' }))
    expect(screen.queryByTestId('camera-mode-timeline')).toBeNull()
  })

  it('draws a flat fallback waveform when audio decoding fails', async () => {
    mockDecodeAudioData.mockRejectedValueOnce(new Error('decode failed'))

    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    vi.useRealTimers()
    mockCanvasContext.moveTo.mockClear()
    mockCanvasContext.lineTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    await waitFor(() => {
      expect(mockCanvasContext.moveTo).toHaveBeenCalledWith(0, 400)
    })
    expect(mockCanvasContext.lineTo).toHaveBeenCalledWith(1200, 400)
  })

  it('supports dragging track offsets and trim handles', async () => {
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    const videoTrack = screen.getByTestId('camera-track-content-video')
    fireEvent.mouseDown(videoTrack, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 140 })
    fireEvent.mouseUp(document)
    expect(videoTrack.style.transform).toBe('translateX(40px)')

    const startHandle = screen.getByTestId('camera-track-handle-start-video')
    fireEvent.mouseDown(startHandle, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 130 })
    fireEvent.mouseUp(document)
    expect(videoTrack.style.left).toBe('30px')

    const endHandle = screen.getByTestId('camera-track-handle-end-video')
    fireEvent.mouseDown(endHandle, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 160 })
    fireEvent.mouseUp(document)
    expect(videoTrack.style.right).toBe('40px')
  })

  it('returns to Create Mode and pauses playback from the back button', async () => {
    useAppStore.setState({ activeSecondBarTab: 'camera' })
    render(<CameraModeHarness />)

    await waitFor(() => {
      expect(mockVideoPlay).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(mockPlaybackPause).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().appMode).toBe('create')
    expect(useAppStore.getState().activeSecondBarTab).toBe('pieces')
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}

function CameraModeHarness({
  onAlignClick,
}: {
  onAlignClick?: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const visualizerCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [isTimelineVisible, setIsTimelineVisible] = React.useState(false)
  const visualizerHeight = isTimelineVisible
    ? `calc(60% - ${TIMELINE_HEIGHT_PX}px)`
    : '60%'
  const cameraModeHeight = isTimelineVisible
    ? `calc(40% + ${TIMELINE_HEIGHT_PX}px)`
    : '40%'

  React.useEffect(() => {
    mockActiveVisualizerCanvas.current = visualizerCanvasRef.current

    return () => {
      if (mockActiveVisualizerCanvas.current === visualizerCanvasRef.current) {
        mockActiveVisualizerCanvas.current = null
      }
    }
  }, [])

  return (
    <div data-testid="camera-layout" style={{ width: '100%', height: '100%' }}>
      <div data-testid="camera-visualizer-slot" style={{ height: visualizerHeight }}>
        <canvas ref={visualizerCanvasRef} data-testid="pixi-canvas" />
      </div>
      <div data-testid="camera-mode-panel-slot" style={{ height: cameraModeHeight }}>
        <CameraMode
          isTimelineVisible={isTimelineVisible}
          onAlignClick={onAlignClick}
          onTimelineVisibilityChange={setIsTimelineVisible}
        />
      </div>
    </div>
  )
}
