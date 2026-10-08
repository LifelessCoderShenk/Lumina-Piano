import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'
import type { PerformanceVideoExportOptions } from '../../export/PerformanceVideoExporter'

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
const mockPlayLiveNote = vi.hoisted(() => vi.fn(async () => undefined))
const mockSetMuted = vi.hoisted(() => vi.fn())
const mockPlaybackSeek = vi.hoisted(() => vi.fn())
const mockPlayWithPreRoll = vi.hoisted(() => vi.fn())
const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlaybackGetCurrentTick = vi.hoisted(() => vi.fn(() => 0))
const mockExportPerformanceVideo = vi.hoisted(() => vi.fn<(
  recordingBlob: Blob,
  visualizerCanvas: HTMLCanvasElement,
  options: PerformanceVideoExportOptions,
) => Promise<{ outputPath: string }>>())
const mockShowSaveDialog = vi.hoisted(() => vi.fn())
const mockOpenVideoFile = vi.hoisted(() => vi.fn())
const mockOpenAudioFile = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())
const mockProbeBlobDuration = vi.hoisted(() => vi.fn(async () => 12))
const mockHasRenderableMidiAudio = vi.hoisted(() => vi.fn(() => false))
const mockRenderOfflineMidiAudioBuffer = vi.hoisted(() => vi.fn<() => Promise<AudioBuffer | null>>())
const mockGetTempDir = vi.hoisted(() => vi.fn(async () => 'C:/Temp/lumina-record-export'))
const mockFfmpegRun = vi.hoisted(() => vi.fn(async () => undefined))
const mockMkdir = vi.hoisted(() => vi.fn(async () => undefined))
const mockRm = vi.hoisted(() => vi.fn(async () => undefined))
const mockRendererSetKeyboardOpacity = vi.hoisted(() => vi.fn())
const mockRendererSetActiveKeyPitches = vi.hoisted(() => vi.fn())
const mockRendererSetLiveMidiNotes = vi.hoisted(() => vi.fn())
const mockRendererSetLiveNoteSource = vi.hoisted(() => vi.fn())
const mockActiveVisualizerRenderer = vi.hoisted(() => ({
  current: null as null | {
    getKeyX: (pitch: number) => number
    getKeyboardY: () => number
    setActiveKeyPitches: (pitches: number[]) => void
    setKeyboardOpacity: (opacity: number) => void
    setLiveMidiNotes: (notes: Array<{ id: string; pitch: number; startedAtMs: number; velocity: number }>) => void
    setLiveNoteSource: (sourceId: string, notes: Array<{ id: string; pitch: number; startedAtMs: number; velocity: number }>) => void
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
    playLiveNote: mockPlayLiveNote,
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
  getCompositePreviewLayout: () => ({ visualizerHeight: 360, visualizerWidth: 640 }),
  resolveCompositeVisualizerSize: () => ({ height: 360, width: 640 }),
}))

vi.mock('../../export/PerformanceVideoExporter', () => ({
  exportPerformanceVideoDeterministically: mockExportPerformanceVideo,
}))

vi.mock('../../utils/blobDuration', () => ({
  probeBlobDuration: mockProbeBlobDuration,
}))

vi.mock('../../audio/renderOfflineMidiAudio', () => ({
  hasRenderableMidiAudio: mockHasRenderableMidiAudio,
  renderOfflineMidiAudioBuffer: mockRenderOfflineMidiAudioBuffer,
}))

vi.mock('../CanvasArea/CanvasArea', () => ({
  CanvasArea: ({ engine, keyboardOnly = false }: { engine: 'pixi' | 'three'; keyboardOnly?: boolean }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

    React.useEffect(() => {
      const canvas = canvasRef.current
      mockActiveVisualizerCanvas.current = canvas

      return () => {
        if (mockActiveVisualizerCanvas.current === canvas) {
          mockActiveVisualizerCanvas.current = null
        }
      }
    }, [])

    return (
      <div data-testid="canvas-area" data-engine={engine} data-keyboard-only={String(keyboardOnly)}>
        <canvas ref={canvasRef} />
      </div>
    )
  },
}))

vi.mock('../TranscriptorMode/TranscriptorMode', () => ({
  TranscriptorMode: () => <div data-testid="record-mode-transcription">Transcription workspace</div>,
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
    mockExportPerformanceVideo.mockReset()
    mockExportPerformanceVideo.mockImplementation(async () => ({
      outputPath: 'C:/Videos/my-recording.webm',
    }))
    mockShowSaveDialog.mockReset()
    mockShowSaveDialog.mockResolvedValue('C:/Videos/my-recording.webm')
    mockOpenVideoFile.mockReset()
    mockOpenVideoFile.mockResolvedValue('C:/Videos/piano-performance.mp4')
    mockOpenAudioFile.mockReset()
    mockOpenAudioFile.mockResolvedValue('C:/Audio/piano-master.wav')
    mockReadFile.mockReset()
    mockReadFile.mockResolvedValue(new Uint8Array([0, 0, 0, 24]))
    mockProbeBlobDuration.mockReset()
    mockProbeBlobDuration.mockResolvedValue(12)
    mockHasRenderableMidiAudio.mockReset()
    mockHasRenderableMidiAudio.mockReturnValue(false)
    mockRenderOfflineMidiAudioBuffer.mockReset()
    mockRenderOfflineMidiAudioBuffer.mockResolvedValue(null)
    mockGetTempDir.mockClear()
    mockFfmpegRun.mockClear()
    mockMkdir.mockClear()
    mockRm.mockClear()
    mockRendererSetKeyboardOpacity.mockReset()
    mockRendererSetActiveKeyPitches.mockReset()
    mockRendererSetLiveMidiNotes.mockReset()
    mockRendererSetLiveNoteSource.mockReset()
    mockActiveVisualizerRenderer.current = {
      getKeyX: () => 0,
      getKeyboardY: () => 0,
      setActiveKeyPitches: mockRendererSetActiveKeyPitches,
      setKeyboardOpacity: mockRendererSetKeyboardOpacity,
      setLiveMidiNotes: mockRendererSetLiveMidiNotes,
      setLiveNoteSource: mockRendererSetLiveNoteSource,
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

    window.electronAPI = {
      dialog: { openAudioFile: mockOpenAudioFile, openVideoFile: mockOpenVideoFile, showSaveDialog: mockShowSaveDialog },
      export: { getTempDir: mockGetTempDir },
      ffmpeg: { run: mockFfmpegRun },
    } as unknown as typeof window.electronAPI
    window.electronFS = {
      mkdir: mockMkdir,
      readFile: mockReadFile,
      rm: mockRm,
      writeFile: vi.fn(async () => undefined),
    } as unknown as typeof window.electronFS

    class MockMediaRecorder {
      state: 'inactive' | 'recording' = 'inactive'
      ondataavailable: null | ((event: { data: Blob }) => void) = null
      onstop: null | (() => void) = null

      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

      start(timeslice?: number) {
        this.state = 'recording'
        mediaRecorderStartSpy(timeslice)
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

  it('switches between Performance video and Transcription inside Record Mode', async () => {
    render(<RecordMode />)

    expect(screen.getByTestId('record-mode-video')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Transcription/i }))

    expect(useAppStore.getState().appMode).toBe('createRecord')
    expect(useAppStore.getState().recordModeView).toBe('transcription')
    expect(screen.getByTestId('record-mode-transcription')).toBeTruthy()
    expect(screen.queryByTestId('record-mode-video')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /Performance video/i }))

    expect(useAppStore.getState().recordModeView).toBe('video')
    expect(screen.getByTestId('record-mode-video')).toBeTruthy()
  })

  it('toggles the transcription setup sidebar from the persistent header', () => {
    const onCollapsedChange = vi.fn()
    useAppStore.setState({ appMode: 'createRecord', recordModeView: 'transcription' })
    const view = render(<RecordMode isTranscriptionSidebarCollapsed={false} onTranscriptionSidebarCollapsedChange={onCollapsedChange} />)

    const hide = screen.getByRole('button', { name: 'Hide setup' })
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(hide)
    expect(onCollapsedChange).toHaveBeenCalledWith(true)

    view.rerender(<RecordMode isTranscriptionSidebarCollapsed onTranscriptionSidebarCollapsedChange={onCollapsedChange} />)
    const show = screen.getByRole('button', { name: 'Show setup' })
    expect(show.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(show)
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false)
  })

  it('returns to Falling Keys from the recording workspace', () => {
    render(<RecordMode />)

    fireEvent.click(screen.getByRole('button', { name: /Falling Keys/i }))

    expect(useAppStore.getState().appMode).toBe('create')
  })

  it('keeps the keyboard visible below the compact setup and adds input audio to the piano mix automatically', async () => {
    render(<RecordMode />)

    expect(screen.getByTestId('record-mode-input-setup')).toBeTruthy()
    expect(screen.getByTestId('canvas-area').getAttribute('data-keyboard-only')).toBe('true')
    expect(screen.getByText('Piano audio included')).toBeTruthy()
    const frameSelect = screen.getByRole('combobox', { name: 'Performance frame' }) as HTMLSelectElement
    fireEvent.change(frameSelect, { target: { value: '9:16' } })
    expect(useAppStore.getState().visualizerSettings.aspectRatio).toBe('9:16')
    const audioSelect = await screen.findByTestId('record-mode-audio-select') as HTMLSelectElement
    expect(audioSelect.value).toBe('')
    fireEvent.change(audioSelect, { target: { value: 'audio-1' } })
    expect(useAppStore.getState().recordModeConfig).toMatchObject({ audioSourceDeviceId: 'audio-1', useMic: true, useMidiAudio: true })
  })

  it('locks the Record hub navigation while transcription capture is active', () => {
    useAppStore.setState({
      appMode: 'createRecord',
      recordModeView: 'transcription',
      transcriptionPhase: 'recording',
    })

    render(<RecordMode />)

    expect((screen.getByRole('button', { name: /Falling Keys/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('tab', { name: /Performance video/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('tab', { name: /Transcription/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls getUserMedia with the selected camera and audio device ids when RECORD is clicked', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({
      audioDeviceId: 'audio-1',
      cameraDeviceId: 'camera-2',
    })
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
          frameRate: { ideal: 30, max: 30 },
          height: { ideal: 1080 },
          width: { ideal: 1920 },
        },
      })
    })
  })

  it('replaces the setup preview stream when the selected camera changes', async () => {
    const firstTrackStop = vi.fn()
    const secondTrackStop = vi.fn()
    const firstStream = {
      getTracks: () => [{ stop: firstTrackStop }],
    } as unknown as MediaStream
    const secondStream = {
      getTracks: () => [{ stop: secondTrackStop }],
    } as unknown as MediaStream
    mockGetUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const deviceId = (constraints.video as MediaTrackConstraints)?.deviceId as ConstrainDOMStringParameters
      return deviceId?.exact === 'camera-2' ? secondStream : firstStream
    })

    render(<RecordMode />)
    const { cameraSelect } = await waitForRecordModeInputs()
    const preview = screen.getByTestId('record-mode-camera-preview') as HTMLVideoElement

    fireEvent.change(cameraSelect, { target: { value: 'camera-1' } })
    await waitFor(() => expect(preview.srcObject).toBe(firstStream))

    fireEvent.change(cameraSelect, { target: { value: 'camera-2' } })
    await waitFor(() => expect(preview.srcObject).toBe(secondStream))

    expect(firstTrackStop).toHaveBeenCalled()
    expect(mockGetUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({
      video: expect.objectContaining({ deviceId: { exact: 'camera-2' } }),
    }))
  })

  it('imports existing footage directly into the shared review and export workflow', async () => {
    render(<RecordMode />)

    expect((screen.getByTestId('record-mode-record-button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('record-mode-import-video'))

    expect(await screen.findByTestId('record-mode-review-layout')).toBeTruthy()
    expect(mockOpenVideoFile).toHaveBeenCalledTimes(1)
    expect(mockReadFile).toHaveBeenCalledWith('C:/Videos/piano-performance.mp4')
    expect(screen.getByRole('button', { name: 'Change imported video' })).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockExportPerformanceVideo.mock.calls[0]?.[2]).toMatchObject({
      includeCameraAudio: true,
      midiAudioSourceTimeAtExportStartSeconds: 0,
    })
  })

  it('stays in setup when importing video is canceled', async () => {
    mockOpenVideoFile.mockResolvedValueOnce(null)
    render(<RecordMode />)

    fireEvent.click(screen.getByTestId('record-mode-import-video'))

    await waitFor(() => expect(mockOpenVideoFile).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('record-mode-content')).toBeTruthy()
    expect(screen.queryByTestId('record-mode-review-layout')).toBeNull()
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('adds a separately recorded soundtrack with independent timeline sync and export', async () => {
    render(<RecordMode />)
    fireEvent.click(screen.getByTestId('record-mode-import-video'))
    expect(await screen.findByTestId('record-mode-review-layout')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add soundtrack' }))

    expect(await screen.findByTestId('record-mode-soundtrack')).toBeTruthy()
    expect(mockOpenAudioFile).toHaveBeenCalledTimes(1)
    expect(mockReadFile).toHaveBeenLastCalledWith('C:/Audio/piano-master.wav')
    expect(screen.getByTestId('record-mode-timeline')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-performanceAudio')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Soundtrack offset'), { target: { value: '750' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockExportPerformanceVideo.mock.calls[0]?.[2]).toMatchObject({
      soundtrackBlob: expect.any(Blob),
      soundtrackSourceTimeAtExportStartSeconds: -0.75,
    })
  })

  it('shows crop and orientation changes in the setup camera preview', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(180)
    useAppStore.getState().setCameraOverlay({ cropLeft: 120, flipHorizontal: true })

    render(<RecordMode />)
    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })

    const preview = screen.getByTestId('record-mode-camera-preview') as HTMLVideoElement
    Object.defineProperty(preview, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(preview, 'videoHeight', { configurable: true, value: 1080 })
    fireEvent(preview, new Event('loadedmetadata'))

    const cropFrame = screen.getByTestId('record-mode-setup-crop-frame')
    await waitFor(() => {
      expect(screen.getByTestId('record-mode-setup-feed-orientation').style.transform)
        .toBe('rotate(0deg) scaleX(-1) scaleY(1)')
      expect(cropFrame.style.transform).not.toBe('translate3d(0, 0, 0) scale(1)')
    })
    const firstCropTransform = cropFrame.style.transform

    act(() => {
      useAppStore.getState().setCameraOverlay({ cropLeft: 260, rotation: 90 })
    })

    await waitFor(() => {
      expect(screen.getByTestId('record-mode-setup-feed-orientation').style.transform)
        .toBe('rotate(90deg) scaleX(-1) scaleY(1)')
      expect(cropFrame.style.transform).not.toBe(firstCropTransform)
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

  it('cancels the countdown without starting a late MediaRecorder', async () => {
    const onBusyChange = vi.fn()
    render(<RecordMode onBusyChange={onBusyChange} />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await flushAsyncWork()
    expect(onBusyChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel countdown' }))
    await flushAsyncWork()
    expect(screen.getByTestId('record-mode-content')).toBeTruthy()
    expect(screen.queryByTestId('record-mode-countdown')).toBeNull()
    expect(mockPlaybackPause).toHaveBeenCalled()
    expect(onBusyChange).toHaveBeenLastCalledWith(false)

    await advanceCountdown(5_000)
    expect(mediaRecorderStartSpy).not.toHaveBeenCalled()
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
    expect(mediaRecorderStartSpy).toHaveBeenCalledWith(1000)
  })

  it('can switch directly from a finished performance to Transcription', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    const transcriptionTab = screen.getByRole('tab', { name: /Transcription/i }) as HTMLButtonElement
    expect(transcriptionTab.disabled).toBe(false)
    fireEvent.click(transcriptionTab)
    expect(useAppStore.getState().recordModeView).toBe('transcription')
    expect(screen.getByTestId('record-mode-transcription')).toBeTruthy()
  })

  it('opens the shared four-row timeline during review', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    vi.useRealTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(screen.getByTestId('record-mode-timeline')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-midiAudio')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-midiVideo')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-cameraAudio')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-cameraVideo')).toBeTruthy()
    expect((screen.getByLabelText('Camera Audio offset') as HTMLInputElement).disabled).toBe(true)
  })

  it('applies the shared X/Y/scale overlay transform to the Three review visualizer', async () => {
    useAppStore.getState().setCameraOverlay({
      offsetX: 36,
      offsetY: -24,
      scale: 1.25,
      flipHorizontal: true,
      flipVertical: true,
      rotation: 180,
    })

    window.electronAPI = {
      dialog: {
        showSaveDialog: mockShowSaveDialog,
      },
    } as typeof window.electronAPI
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    const visualizer = screen.getByTestId('record-mode-review-visualizer')
    expect(visualizer.style.transform).toBe('translate3d(36px, -24px, 0) scale(1.25)')
    expect(visualizer.style.transformOrigin).toBe('top left')
    expect(screen.getByTestId('record-mode-feed-orientation').style.transform).toBe('rotate(180deg) scaleX(-1) scaleY(-1)')
  })

  it('does not render duplicate inline camera transform controls after recording', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))

    expect(screen.queryByTestId('record-mode-enabled-controls')).toBeNull()
    expect(screen.queryByTestId('record-mode-disabled-controls')).toBeNull()
    expect(screen.queryByLabelText('Move X')).toBeNull()
    expect(screen.queryByLabelText('Move Y')).toBeNull()
    expect(screen.queryByLabelText('Scale')).toBeNull()
    expect(screen.queryByLabelText('Crop Top')).toBeNull()
    expect(screen.queryByRole('button', { name: 'ALIGN' })).toBeNull()
  })

  it('re-record resets back to the setup panel while preserving selected devices', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({
      audioDeviceId: 'audio-1',
      cameraDeviceId: 'camera-2',
      midiDeviceId: 'midi-1',
    })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard and re-record' }))

    expect(screen.getByTestId('record-mode-content')).toBeTruthy()
    expect((screen.getByTestId('record-mode-audio-select') as HTMLSelectElement).value).toBe('audio-1')
    expect((screen.getByTestId('record-mode-camera-select') as HTMLSelectElement).value).toBe('camera-2')
    expect((screen.getByTestId('record-mode-midi-select') as HTMLSelectElement).value).toBe('midi-1')
    expect(useAppStore.getState().recordModeConfig.useMic).toBe(true)
  })

  it('forwards live MIDI note events to the Three renderer without changing the loaded project', async () => {
    const projectBefore = useAppStore.getState().projectData
    render(<RecordMode />)

    await selectRecordModeDevices({
      cameraDeviceId: 'camera-1',
      midiDeviceId: 'midi-1',
    })
    fireEvent.click(screen.getByTestId('record-mode-record-button'))

    expect(await screen.findByTestId('record-mode-live-view')).toBeTruthy()
    expect(screen.getByTestId('record-mode-live-visualizer')).toBeTruthy()
    expect(screen.getByTestId('canvas-area').getAttribute('data-engine')).toBe('three')

    await waitFor(() => {
      expect(midiInput.onmidimessage).not.toBeNull()
    })

    await act(async () => {
      midiInput.onmidimessage?.({ data: [0x90, 60, 100] })
    })

    expect(mockRendererSetLiveNoteSource).toHaveBeenLastCalledWith('record-midi', [
      expect.objectContaining({ id: '0:60', pitch: 60, velocity: 100 }),
    ])
    expect(mockPlayLiveNote).toHaveBeenCalledWith(60, 100)
    expect(useAppStore.getState().projectData).toBe(projectBefore)

    await act(async () => {
      midiInput.onmidimessage?.({ data: [0x80, 60, 0] })
    })

    expect(mockRendererSetLiveNoteSource).toHaveBeenLastCalledWith('record-midi', [])
    expect(useAppStore.getState().projectData).toBe(projectBefore)
  })

  it('keeps a repeated MIDI pitch active until its matching final note-off', async () => {
    render(<RecordMode />)
    await selectRecordModeDevices({ cameraDeviceId: 'camera-1', midiDeviceId: 'midi-1' })
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    expect(await screen.findByTestId('record-mode-live-view')).toBeTruthy()
    await waitFor(() => expect(midiInput.onmidimessage).not.toBeNull())

    await act(async () => {
      midiInput.onmidimessage?.({ data: [0x90, 60, 90] })
      midiInput.onmidimessage?.({ data: [0x90, 60, 110] })
      midiInput.onmidimessage?.({ data: [0x80, 60, 0] })
    })

    expect(mockRendererSetLiveNoteSource).toHaveBeenLastCalledWith('record-midi', [expect.objectContaining({ pitch: 60, velocity: 110 })])
    await act(async () => { midiInput.onmidimessage?.({ data: [0x80, 60, 0] }) })
    expect(mockRendererSetLiveNoteSource).toHaveBeenLastCalledWith('record-midi', [])
  })

  it('keeps physical MIDI notes audible while recording when Piano Audio is enabled', async () => {
    render(<RecordMode />)

    await selectRecordModeDevices({
      cameraDeviceId: 'camera-1',
      midiDeviceId: 'midi-1',
    })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await advanceCountdown(3000)

    await act(async () => {
      midiInput.onmidimessage?.({ data: [0x90, 64, 96] })
    })

    expect(mockSetMuted).toHaveBeenCalledWith(false)
    expect(mockPlayLiveNote).toHaveBeenCalledWith(64, 96)
  })

  it('refreshes MIDI inputs after a hot-plug without remounting and clears a disconnected selection', async () => {
    const hotPlugMidiInput: MidiInputLike = {
      id: 'midi-hot-plug',
      name: 'Hot-plug Keyboard',
      onmidimessage: null,
    }
    const midiInputs = new Map<string, MidiInputLike>()
    const midiAccess = {
      inputs: {
        get: (id: string) => midiInputs.get(id),
        values: () => midiInputs.values(),
      },
      onstatechange: null as (() => void) | null,
    }
    mockRequestMIDIAccess.mockResolvedValueOnce(midiAccess)

    render(<RecordMode />)

    const midiSelect = await screen.findByTestId('record-mode-midi-select') as HTMLSelectElement
    await waitFor(() => {
      expect(midiSelect.options).toHaveLength(1)
    })

    midiInputs.set(hotPlugMidiInput.id, hotPlugMidiInput)
    await act(async () => {
      midiAccess.onstatechange?.()
    })

    await waitFor(() => {
      expect(midiSelect.options).toHaveLength(2)
      expect(midiSelect.options[1].textContent).toBe('Hot-plug Keyboard')
    })

    fireEvent.change(midiSelect, { target: { value: hotPlugMidiInput.id } })
    fireEvent.click(screen.getByRole('button', { name: 'TEST' }))
    expect(hotPlugMidiInput.onmidimessage).not.toBeNull()

    await act(async () => {
      hotPlugMidiInput.onmidimessage?.({ data: [0x90, 60, 100] })
    })
    expect(screen.getByTestId('record-mode-midi-test-status').querySelector('.lucide-check')).toBeTruthy()

    midiInputs.clear()
    await act(async () => {
      midiAccess.onstatechange?.()
    })

    await waitFor(() => {
      expect(midiSelect.value).toBe('')
      expect(screen.getByTestId('record-mode-midi-test-status').textContent).toBe('')
    })
  })

  it('clears disconnected camera and audio selections instead of recording from an unintended default', async () => {
    useAppStore.getState().setRecordModeConfig({
      cameraDeviceId: 'missing-camera',
      audioSourceDeviceId: 'missing-audio',
      useMic: true,
    })

    render(<RecordMode />)

    await waitFor(() => expect(useAppStore.getState().recordModeConfig).toMatchObject({
      cameraDeviceId: null,
      audioSourceDeviceId: null,
      useMic: false,
    }))
    expect(screen.getByText('The selected camera and audio input disconnected. Choose the available devices again.')).toBeTruthy()
    expect((screen.getByTestId('record-mode-record-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('uses deterministic frame export from Export', async () => {
    useAppStore.getState().setVisualizerSettings({ aspectRatio: '9:16', resolution: '1080p' })
    useAppStore.getState().setCameraOverlay({
      cropBottom: 40,
      cropLeft: 10,
      cropRight: 30,
      cropTop: 20,
      flipHorizontal: true,
      offsetX: 36,
      offsetY: -24,
      rotation: 90,
      scale: 1.25,
    })
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

    expect(mockExportPerformanceVideo).toHaveBeenCalledTimes(1)
    const exportOptions = mockExportPerformanceVideo.mock.calls[0]?.[2]
    expect(exportOptions).toMatchObject({
      cameraOverlay: {
        cropBottom: 40,
        cropLeft: 10,
        cropRight: 30,
        cropTop: 20,
        flipHorizontal: true,
        flipVertical: false,
        offsetX: 36,
        offsetY: -24,
        rotation: 90,
        scale: 1.25,
      },
      previewLayout: { visualizerHeight: 360, visualizerWidth: 640 },
      outputPath: 'C:/Videos/my-recording.webm',
      outputResolution: { height: 1920, width: 1080 },
      expectedDurationSeconds: 12,
      frameRate: 60,
      includeCameraAudio: false,
    })
    expect(exportOptions).not.toHaveProperty('offsetX')
    expect(exportOptions).not.toHaveProperty('offsetY')
    expect(exportOptions).not.toHaveProperty('scale')
    expect(exportOptions).not.toHaveProperty('flipHorizontal')
    expect(exportOptions).not.toHaveProperty('flipVertical')
    expect(exportOptions).not.toHaveProperty('rotation')
  })

  it('exports captured microphone audio, rendered MIDI audio, and the selected framerate', async () => {
    const renderedMidiAudio = {} as AudioBuffer
    mockGetUserMedia.mockResolvedValue({
      getAudioTracks: () => [{} as MediaStreamTrack],
      getTracks: () => [{ stop: mockTrackStop }],
    })
    mockHasRenderableMidiAudio.mockReturnValue(true)
    mockRenderOfflineMidiAudioBuffer.mockResolvedValue(renderedMidiAudio)
    useAppStore.getState().setRecordModeConfig({ useMic: true, useMidiAudio: true })
    useAppStore.getState().setVisualizerSettings({ framerate: 30 })

    render(<RecordMode />)
    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    fireEvent.change(screen.getByLabelText('Camera Video offset'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('MIDI Audio offset'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('MIDI Visuals offset'), { target: { value: '-250' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockRenderOfflineMidiAudioBuffer).toHaveBeenCalledWith(
      expect.anything(),
      12,
      3,
    )
    expect(mockExportPerformanceVideo.mock.calls[0]?.[2]).toMatchObject({
      expectedDurationSeconds: 12,
      frameRate: 30,
      includeCameraAudio: true,
      midiAudioBuffer: renderedMidiAudio,
      midiAudioSourceTimeAtExportStartSeconds: 0.5,
    })
    expect(mockExportPerformanceVideo.mock.calls[0]?.[2]?.onBeforeDrawFrame).toEqual(expect.any(Function))
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
      filePath: 'C:/Videos/my-recording.webm',
      name: 'Moonlight Take 1',
      type: 'recording',
    })
  })

  it('passes the selected MP4 destination to deterministic export', async () => {
    mockShowSaveDialog.mockResolvedValue('C:/Videos/piano-take.mp4')
    render(<RecordMode />)

    await selectRecordModeDevices({ cameraDeviceId: 'camera-1' })
    vi.useFakeTimers()
    fireEvent.click(screen.getByTestId('record-mode-record-button'))
    await advanceCountdown(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Performance export format' }), { target: { value: 'mp4' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockExportPerformanceVideo.mock.calls[0]?.[2]).toMatchObject({
      outputPath: 'C:/Videos/piano-take.mp4',
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
