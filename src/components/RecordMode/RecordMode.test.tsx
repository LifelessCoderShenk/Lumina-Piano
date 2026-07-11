import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'

interface MidiInputLike {
  id: string
  name?: string | null
  onmidimessage: ((event: { data?: number[] | Uint8Array | null }) => void) | null
}

const mockEnumerateDevices = vi.hoisted(() => vi.fn())
const mockGetUserMedia = vi.hoisted(() => vi.fn())
const mockRequestMIDIAccess = vi.hoisted(() => vi.fn())
const mockVideoPlay = vi.hoisted(() => vi.fn(async () => undefined))
const mockVideoPause = vi.hoisted(() => vi.fn())
const mockVideoLoad = vi.hoisted(() => vi.fn())
const mockTrackStop = vi.hoisted(() => vi.fn())
const mockWarmUp = vi.hoisted(() => vi.fn(async () => undefined))
const mockSetMuted = vi.hoisted(() => vi.fn())
const mockPlaybackSeek = vi.hoisted(() => vi.fn())
const mockPlayWithPreRoll = vi.hoisted(() => vi.fn())
const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlaybackGetCurrentTick = vi.hoisted(() => vi.fn(() => 0))
const mockCompositeExport = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererSetKeyboardOpacity = vi.hoisted(() => vi.fn())
const mockActiveVisualizerRenderer = vi.hoisted(() => ({
  current: null as null | {
    getKeyX: (pitch: number) => number
    getKeyboardY: () => number
    setKeyboardOpacity: (opacity: number) => void
  },
}))
const mockActiveVisualizerCanvas = vi.hoisted(() => ({
  current: null as HTMLCanvasElement | null,
}))

const midiInput: MidiInputLike = {
  id: 'midi-1',
  name: 'Stage Piano MIDI',
  onmidimessage: null,
}

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    setMuted: mockSetMuted,
    warmUp: mockWarmUp,
  },
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    getCurrentTick: mockPlaybackGetCurrentTick,
    pause: mockPlaybackPause,
    play: mockPlaybackPlay,
    playWithPreRoll: mockPlayWithPreRoll,
    seek: mockPlaybackSeek,
  },
}))

vi.mock('../../renderer/activeVisualizerRenderer', () => ({
  getActiveVisualizerRenderer: () => mockActiveVisualizerRenderer.current,
}))

vi.mock('../../renderer/activeCanvas', () => ({
  getActiveVisualizerCanvas: () => mockActiveVisualizerCanvas.current,
}))

vi.mock('../../utils/compositeExport', () => ({
  compositeExport: mockCompositeExport,
}))

vi.mock('../CanvasArea/CanvasArea', () => ({
  CanvasArea: ({ engine }: { engine: 'pixi' | 'three' }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

    React.useEffect(() => {
      mockActiveVisualizerCanvas.current = canvasRef.current

      return () => {
        if (mockActiveVisualizerCanvas.current === canvasRef.current) {
          mockActiveVisualizerCanvas.current = null
        }
      }
    }, [])

    return (
      <div data-testid="canvas-area" data-engine={engine}>
        <canvas ref={canvasRef} />
      </div>
    )
  },
}))

const { RecordMode } = await import('./RecordMode')

describe('RecordMode', () => {
  beforeEach(() => {
    resetStore()
    applyDesignTokens()
    vi.useRealTimers()
    mockEnumerateDevices.mockReset()
    mockEnumerateDevices.mockResolvedValue([
      { deviceId: 'audio-1', kind: 'audioinput', label: 'USB Audio Interface' },
      { deviceId: 'camera-1', kind: 'videoinput', label: 'Front Camera' },
      { deviceId: 'camera-2', kind: 'videoinput', label: 'Desk Camera' },
    ])
    mockGetUserMedia.mockReset()
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: mockTrackStop }],
    })
    mockRequestMIDIAccess.mockReset()
    mockRequestMIDIAccess.mockResolvedValue({
      inputs: {
        get: (id: string) => (id === midiInput.id ? midiInput : undefined),
        values: () => [midiInput].values(),
      },
    })
    mockVideoPlay.mockReset()
    mockVideoPause.mockReset()
    mockVideoLoad.mockReset()
    mockTrackStop.mockReset()
    mockWarmUp.mockReset()
    mockWarmUp.mockImplementation(async () => undefined)
    mockSetMuted.mockReset()
    mockPlaybackSeek.mockReset()
    mockPlayWithPreRoll.mockReset()
    mockPlaybackPause.mockReset()
    mockPlaybackPlay.mockReset()
    mockPlaybackGetCurrentTick.mockReset()
    mockPlaybackGetCurrentTick.mockReturnValue(0)
    mockCompositeExport.mockReset()
    mockCompositeExport.mockImplementation(async () => undefined)
    mockRendererSetKeyboardOpacity.mockReset()
    mockActiveVisualizerRenderer.current = {
      getKeyX: () => 0,
      getKeyboardY: () => 0,
      setKeyboardOpacity: mockRendererSetKeyboardOpacity,
    }
    mockActiveVisualizerCanvas.current = null
    mediaRecorderStartSpy.mockReset()
    mediaRecorderStopSpy.mockReset()
    midiInput.onmidimessage = null

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: mockEnumerateDevices,
        getUserMedia: mockGetUserMedia,
      },
    })

    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: mockRequestMIDIAccess,
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

    Object.defineProperty(window, 'prompt', {
      configurable: true,
      value: vi.fn(() => 'My Recording'),
    })

    class MockMediaRecorder {
      state: 'inactive' | 'recording' = 'inactive'
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null

      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

      start() {
        this.state = 'recording'
        mediaRecorderStartSpy()
      }

      stop() {
        this.state = 'inactive'
        mediaRecorderStopSpy()
        this.ondataavailable?.({ data: new Blob(['recording']) })
        this.onstop?.()
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:record-mode'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calls getUserMedia with the selected camera and audio device ids when RECORD is clicked', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({
      audioDeviceId: 'audio-1',
      cameraDeviceId: 'camera-2',
    })
    fireEvent.click(screen.getByRole('button', { name: 'MIC' }))
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenLastCalledWith({
        audio: {
          deviceId: {
            exact: 'audio-1',
          },
        },
        video: {
          deviceId: {
            exact: 'camera-2',
          },
        },
      })
    })
  })

  it('renders the 3→2→1 countdown before recording starts', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await flushAsyncWork()

    expect(screen.getByTestId('record-mode-countdown').textContent).toBe('3')

    await advanceCountdown(1000)
    expect(screen.getByTestId('record-mode-countdown').textContent).toBe('2')

    await advanceCountdown(1000)
    expect(screen.getByTestId('record-mode-countdown').textContent).toBe('1')
  })

  it('starts playback on countdown begin and starts the MediaRecorder after countdown completes', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await flushAsyncWork()
    await flushAsyncWork()

    expect(mockPlaybackSeek).toHaveBeenCalledWith(0)
    expect(mockPlayWithPreRoll).toHaveBeenCalledWith(3)
    expect(mockWarmUp).toHaveBeenCalledTimes(1)
    expect(mediaRecorderStartSpy).not.toHaveBeenCalled()

    await advanceCountdown(3000)

    expect(mediaRecorderStartSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('record-mode-countdown')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy()
  })

  it('stops the MediaRecorder and playback when STOP is clicked', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await flushAsyncWork()
    await advanceCountdown(3000)

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(mediaRecorderStopSpy).toHaveBeenCalledTimes(1)
    expect(mockPlaybackPause).toHaveBeenCalled()
    expect(mockPlaybackSeek).toHaveBeenLastCalledWith(0)
    expect(mockSetMuted).toHaveBeenCalledWith(false)
  })

  it('renders the post-record review layout with CanvasArea, recorded video, and control bar', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(screen.getByTestId('record-mode-review-layout')).toBeTruthy()
    expect(screen.getByTestId('canvas-area')).toBeTruthy()
    expect(screen.getByTestId('canvas-area').getAttribute('data-engine')).toBe('three')
    expect(screen.getByTestId('record-mode-review-video')).toBeTruthy()
    expect(screen.getByTestId('record-mode-control-bar')).toBeTruthy()
  })

  it('activates the adjustment controls after a recording exists', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(screen.getByTestId('record-mode-enabled-controls')).toBeTruthy()
    expect((screen.getByLabelText('Move X') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Move Y') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Scale') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Crop Top') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'ALIGN' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('re-record resets back to the setup panel while preserving selected devices', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({
      audioDeviceId: 'audio-1',
      cameraDeviceId: 'camera-2',
      midiDeviceId: 'midi-1',
    })
    fireEvent.click(screen.getByRole('button', { name: 'MIC' }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    fireEvent.click(screen.getByRole('button', { name: 'Re-record' }))

    expect(screen.getByTestId('record-mode-content')).toBeTruthy()
    expect((screen.getByTestId('record-mode-audio-select') as HTMLSelectElement).value).toBe('audio-1')
    expect((screen.getByTestId('record-mode-camera-select') as HTMLSelectElement).value).toBe('camera-2')
    expect((screen.getByTestId('record-mode-midi-select') as HTMLSelectElement).value).toBe('midi-1')
    expect(useAppStore.getState().recordModeConfig.useMic).toBe(true)
  })

  it('calls the shared compositeExport utility from Export', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCompositeExport).toHaveBeenCalledTimes(1)
  })

  it('adds a recording piece to the store after export with the prompted name', async () => {
    ;(window.prompt as unknown as ReturnType<typeof vi.fn>).mockReturnValue('Moonlight Take 1')
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(useAppStore.getState().pieces).toHaveLength(1)
    expect(useAppStore.getState().pieces[0]).toMatchObject({
      filePath: null,
      name: 'Moonlight Take 1',
      type: 'recording',
    })
  })
})

const mediaRecorderStartSpy = vi.fn()
const mediaRecorderStopSpy = vi.fn()

async function advanceCountdown(ms: number) {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(ms)
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function waitForRecordModeInputs() {
  const audioSelect = await screen.findByTestId('record-mode-audio-select') as HTMLSelectElement
  const cameraSelect = screen.getByTestId('record-mode-camera-select') as HTMLSelectElement
  const midiSelect = screen.getByTestId('record-mode-midi-select') as HTMLSelectElement

  await waitFor(() => {
    expect(audioSelect.options.length).toBeGreaterThan(1)
    expect(cameraSelect.options.length).toBeGreaterThan(2)
    expect(midiSelect.options.length).toBeGreaterThan(1)
  })

  return {
    audioSelect,
    cameraSelect,
    midiSelect,
    recordButton: screen.getByTestId('record-mode-record-button') as HTMLButtonElement,
  }
}

async function selectRecordModeDevices({
  audioDeviceId,
  cameraDeviceId,
  midiDeviceId,
}: {
  audioDeviceId?: string
  cameraDeviceId?: string
  midiDeviceId?: string
}) {
  const { audioSelect, cameraSelect, midiSelect, recordButton } = await waitForRecordModeInputs()

  if (audioDeviceId != null) {
    fireEvent.change(audioSelect, {
      target: { value: audioDeviceId },
    })
    await waitFor(() => {
      expect(audioSelect.value).toBe(audioDeviceId)
    })
  }

  if (cameraDeviceId != null) {
    fireEvent.change(cameraSelect, {
      target: { value: cameraDeviceId },
    })
    await waitFor(() => {
      expect(cameraSelect.value).toBe(cameraDeviceId)
      expect(recordButton.disabled).toBe(false)
    })
  }

  if (midiDeviceId != null) {
    fireEvent.change(midiSelect, {
      target: { value: midiDeviceId },
    })
    await waitFor(() => {
      expect(midiSelect.value).toBe(midiDeviceId)
    })
  }
}

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}
