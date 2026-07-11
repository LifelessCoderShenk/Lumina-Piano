import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from './store/store'

const mockPlaybackInit = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlaybackSeek = vi.hoisted(() => vi.fn())
const mockAudioSchedulerInit = vi.hoisted(() => vi.fn(async () => undefined))
const mockAudioSchedulerIsReady = vi.hoisted(() => vi.fn(() => true))
const mockRendererIsReady = vi.hoisted(() => vi.fn(() => false))
const mockRendererRenderFrame = vi.hoisted(() => vi.fn())
const mockRendererGetKeyX = vi.hoisted(() => vi.fn((pitch: number) => (pitch === 21 ? 100 : 900)))
const mockRendererGetKeyboardY = vi.hoisted(() => vi.fn(() => 120))
const mockRendererSetKeyboardOpacity = vi.hoisted(() => vi.fn())
const mockActiveVisualizerRenderer = vi.hoisted(() => ({
  current: null as null | {
    getKeyX: (pitch: number) => number
    getKeyboardY: () => number
    setKeyboardOpacity: (opacity: number) => void
  },
}))
const mockSpatialBuild = vi.hoisted(() => vi.fn())
const mockParseMidi = vi.hoisted(() => vi.fn())

vi.mock('./commands/useCommandShortcuts', () => ({
  useCommandShortcuts: () => undefined,
}))

vi.mock('./components/TitleBar/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar">Title Bar</div>,
}))

vi.mock('./components/MenuBar/MenuBar', () => ({
  MenuBar: () => <div data-testid="menu-bar">Menu Bar</div>,
}))

vi.mock('./components/TrackList/TrackList', () => ({
  TrackList: () => <div data-testid="track-list">Track List</div>,
}))

vi.mock('./components/CanvasArea/CanvasArea', () => ({
  CanvasArea: ({ engine }: { engine: 'pixi' | 'three' }) => (
    <div data-testid="canvas-area" data-engine={engine} style={{ flex: 1, width: '100%', height: '100%' }}>
      Canvas Area
    </div>
  ),
}))

vi.mock('./components/CameraMode/CameraMode', () => ({
  CAMERA_MODE_TIMELINE_HEIGHT_PX: 120,
  CameraMode: () => <div data-testid="camera-mode">Camera Mode</div>,
}))

vi.mock('./components/RecordMode/RecordMode', () => ({
  RecordMode: () => <div data-testid="record-mode">Record Mode</div>,
}))

vi.mock('./components/EditPanel/EditPanel', () => ({
  EditPanel: () => <div data-testid="edit-panel" style={{ width: '25%', flexBasis: '25%' }}>Edit Panel</div>,
}))

vi.mock('./components/StatusBar/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">Status Bar</div>,
}))

vi.mock('./components/ExportModal/ExportModal', () => ({
  ExportModal: () => null,
}))

vi.mock('./components/EndScreen/EndScreen', () => ({
  EndScreen: () => <div data-testid="end-screen">End Screen</div>,
}))

vi.mock('./components/LearnHome/LearnHome', () => ({
  LearnHome: () => <div data-testid="learn-home">Learn Home</div>,
}))

vi.mock('./components/LearnOptionsPanel/LearnOptionsPanel', () => ({
  LearnOptionsPanel: () => <div data-testid="learn-options-panel">Learn Options</div>,
}))

vi.mock('./components/LearnSession/ListenSession', () => ({
  ListenSession: () => <div data-testid="listen-session">Listen Session</div>,
}))

vi.mock('./components/LearnSession/NoteByNoteSession', () => ({
  NoteByNoteSession: () => <div data-testid="note-by-note-session">Note by Note Session</div>,
}))

vi.mock('./components/LearnSession/PlayAlongSession', () => ({
  PlayAlongSession: () => <div data-testid="play-along-session">Play Along Session</div>,
}))

vi.mock('./components/SongPage/SongPage', () => ({
  SongPage: () => <div data-testid="song-page">Song Page</div>,
}))

vi.mock('./audio/AudioScheduler', () => ({
  audioScheduler: {
    init: mockAudioSchedulerInit,
    isReady: mockAudioSchedulerIsReady,
  },
}))

vi.mock('./renderer/Renderer', () => ({
  renderer: {
    getKeyX: mockRendererGetKeyX,
    getKeyboardY: mockRendererGetKeyboardY,
    isReady: mockRendererIsReady,
    renderFrame: mockRendererRenderFrame,
    setKeyboardOpacity: mockRendererSetKeyboardOpacity,
  },
}))

vi.mock('./renderer/activeVisualizerRenderer', () => ({
  getActiveVisualizerRenderer: () => mockActiveVisualizerRenderer.current,
}))

vi.mock('./spatial/SpatialIndex', () => ({
  spatialIndex: {
    build: mockSpatialBuild,
  },
}))

vi.mock('./midi/parser', () => ({
  parseMidi: mockParseMidi,
}))

vi.mock('./playback/PlaybackEngine', () => {
  class PlaybackEngineError extends Error {
    code: string

    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }

  return {
    PlaybackEngineError,
    playbackEngine: {
      init: mockPlaybackInit,
      play: mockPlaybackPlay,
      seek: mockPlaybackSeek,
    },
  }
})

const { App } = await import('./App')

describe('App Create Mode shell', () => {
  beforeEach(() => {
    resetStore()
    applyDesignTokens()
    mockPlaybackInit.mockReset()
    mockPlaybackPlay.mockReset()
    mockPlaybackSeek.mockReset()
    mockAudioSchedulerInit.mockReset()
    mockAudioSchedulerInit.mockImplementation(async () => undefined)
    mockAudioSchedulerIsReady.mockReset()
    mockAudioSchedulerIsReady.mockReturnValue(true)
    mockRendererIsReady.mockReset()
    mockRendererIsReady.mockReturnValue(false)
    mockRendererRenderFrame.mockReset()
    mockRendererGetKeyX.mockClear()
    mockRendererGetKeyboardY.mockClear()
    mockRendererSetKeyboardOpacity.mockReset()
    mockActiveVisualizerRenderer.current = {
      getKeyX: mockRendererGetKeyX,
      getKeyboardY: mockRendererGetKeyboardY,
      setKeyboardOpacity: mockRendererSetKeyboardOpacity,
    }
    mockSpatialBuild.mockReset()
    mockParseMidi.mockReset()
    mockParseMidi.mockReturnValue({
      tempoMap: [
        {
          bpm: 120,
          microsecondsPerBeat: 500_000,
          tick: 0,
        },
      ],
      ticksPerQuarter: 480,
      totalTicks: 480,
      tracks: [
        {
          channel: 0,
          id: 'track-1',
          name: 'Track 1',
          notes: [
            {
              endTick: 480,
              id: 'note-1',
              pitch: 60,
              startTick: 0,
              velocity: 100,
              visualEndTick: 480,
            },
          ],
        },
      ],
    })

    window.electronAPI = {
      deleteSong: vi.fn(),
      dialog: {
        getDefaultExportPath: vi.fn(async () => null),
        openMidiFile: vi.fn(async () => null),
        showSaveDialog: vi.fn(async () => null),
      },
      export: {
        getTempDir: vi.fn(async () => 'C:/tmp'),
        saveFile: vi.fn(async () => undefined),
      },
      ffmpeg: {
        run: vi.fn(async () => undefined),
      },
      getSongs: vi.fn(async () => []),
      library: {
        deleteUserSong: vi.fn(async () => undefined),
        getUserSongs: vi.fn(async () => []),
        saveUserSong: vi.fn(async () => ({
          composer: 'User',
          difficulty: 'beginner',
          file: 'demo.mid',
          filePath: 'C:/music/demo.mid',
          id: 'song-1',
          source: 'user',
          title: 'Demo',
        })),
      },
      openJsonFile: vi.fn(async () => null),
      openMidiFile: vi.fn(async () => 'C:/music/demo.mid'),
      shell: {
        openPath: vi.fn(async () => undefined),
      },
      showSaveDialog: vi.fn(async () => null),
      uploadSong: vi.fn(async () => null),
      window: {
        close: vi.fn(async () => undefined),
        maximize: vi.fn(async () => undefined),
        minimize: vi.fn(async () => undefined),
      },
    }

    window.electronFS = {
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => new Uint8Array([0x4d, 0x54, 0x68, 0x64])),
      rm: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render transport, track list, or menu bar in Create Mode and shows the new shell', () => {
    const { container } = render(<App />)

    expect(screen.queryByTestId('menu-bar')).toBeNull()
    expect(screen.queryByTestId('track-list')).toBeNull()
    expect(screen.queryByTestId('mode-selector')).toBeNull()
    expect(screen.getByTestId('edit-panel').style.width).toBe('25%')
    expect(screen.getByTestId('edit-panel').style.flexBasis).toBe('25%')
    expect(screen.getByTestId('create-visualizer-area').style.width).toBe('75%')
    expect(screen.getByTestId('create-visualizer-area').style.flexBasis).toBe('75%')
    expect(screen.getByTestId('canvas-area')).toBeTruthy()
    expect(screen.getByTestId('canvas-area').getAttribute('data-engine')).toBe('three')
    expect((container.firstElementChild as HTMLElement).style.fontFamily).toBe('var(--font-family-base)')
    expect(document.documentElement.style.getPropertyValue('--font-family-base')).toBe('Arial, sans-serif')
  })

  it('keeps Learn Mode rendering and navigation intact', async () => {
    render(<App />)

    expect(screen.getByTestId('edit-panel')).toBeTruthy()
    expect(screen.queryByTestId('mode-selector')).toBeNull()

    await act(async () => {
      useAppStore.getState().setAppMode('learn')
    })

    await waitFor(() => {
      expect(screen.getByTestId('learn-home')).toBeTruthy()
    })

    expect(screen.getByTestId('menu-bar')).toBeTruthy()
    expect(screen.getByTestId('track-list')).toBeTruthy()
    expect(screen.getByTestId('status-bar')).toBeTruthy()
    expect(screen.queryByTestId('edit-panel')).toBeNull()
  })

  it('renders Camera Mode in the right 75% panel when createCamera is active', () => {
    useAppStore.setState({
      appMode: 'createCamera',
      cameraOverlay: {
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        offsetX: 0,
        offsetY: 48,
        scale: 1,
      },
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
      pieces: [
        {
          createdAt: Date.now(),
          filePath: 'C:/music/demo.mid',
          id: 'piece-1',
          name: 'Demo',
          type: 'midi',
        },
      ],
    })

    render(<App />)

    expect(screen.getByTestId('edit-panel')).toBeTruthy()
    expect(screen.getByTestId('create-visualizer-area').style.width).toBe('75%')
    expect(screen.getByTestId('canvas-area')).toBeTruthy()
    expect(screen.getByTestId('canvas-area').getAttribute('data-engine')).toBe('three')
    expect(screen.getByTestId('camera-visualizer-slot')).toBeTruthy()
    expect(screen.getByTestId('camera-visualizer-slot').style.transform).toBe('translate3d(0px, 48px, 0)')
    expect(screen.getByTestId('camera-mode')).toBeTruthy()
  })

  it('renders Record Mode in the right 75% panel when createRecord is active', () => {
    useAppStore.getState().setAppMode('createRecord')

    render(<App />)

    expect(screen.getByTestId('edit-panel')).toBeTruthy()
    expect(screen.getByTestId('create-visualizer-area').style.width).toBe('75%')
    expect(screen.getByTestId('record-mode')).toBeTruthy()
    expect(screen.queryByTestId('canvas-area')).toBeNull()
  })

  it('keeps CanvasArea mounted when switching from Create Mode into Camera Mode', async () => {
    useAppStore.getState().setAppMode('create')
    useAppStore.setState({
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
      pieces: [
        {
          createdAt: Date.now(),
          filePath: 'C:/music/demo.mid',
          id: 'piece-1',
          name: 'Demo',
          type: 'midi',
        },
      ],
    })

    render(<App />)

    const originalCanvasArea = screen.getByTestId('canvas-area')

    await act(async () => {
      useAppStore.getState().setAppMode('createCamera')
    })

    expect(screen.getByTestId('canvas-area')).toBe(originalCanvasArea)
    expect(screen.getByTestId('canvas-area').getAttribute('data-engine')).toBe('three')
    expect(screen.getByTestId('camera-mode')).toBeTruthy()
  })

  it('uses the Pixi canvas path for Learn session visualizer mounts', () => {
    useAppStore.setState({
      appMode: 'learnSession',
      learnV3: {
        ...useAppStore.getState().learnV3,
        sessionConfig: {
          ...useAppStore.getState().learnV3.sessionConfig,
          mode: 'listen',
        },
      },
    })

    render(<App />)

    expect(screen.getByTestId('canvas-area').getAttribute('data-engine')).toBe('pixi')
    expect(screen.getByTestId('listen-session')).toBeTruthy()
  })

  it('captures alignment clicks across the full right panel in Camera Mode', () => {
    useAppStore.setState({
      alignStep: 'waiting-low-a',
      appMode: 'createCamera',
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
      pieces: [
        {
          createdAt: Date.now(),
          filePath: 'C:/music/demo.mid',
          id: 'piece-1',
          name: 'Demo',
          type: 'midi',
        },
      ],
    })

    render(<App />)

    const rightPanel = screen.getByTestId('create-visualizer-area')
    vi.spyOn(rightPanel, 'getBoundingClientRect').mockReturnValue({
      bottom: 720,
      height: 700,
      left: 300,
      right: 1200,
      toJSON: () => undefined,
      top: 20,
      width: 900,
      x: 300,
      y: 20,
    })

    const overlay = screen.getByTestId('full-panel-align-overlay')

    fireEvent.click(overlay, { clientX: 450, clientY: 120 })

    expect(useAppStore.getState().lowAPoint).toEqual({ x: 150, y: 100 })
    expect(useAppStore.getState().alignStep).toBe('waiting-high-c')

    fireEvent.click(overlay, { clientX: 1250, clientY: 130 })

    expect(useAppStore.getState().highCPoint).toEqual({ x: 950, y: 110 })
    expect(useAppStore.getState().alignStep).toBe('complete')
    expect(useAppStore.getState().cameraOverlay.offsetX).toBe(50)
    expect(useAppStore.getState().cameraOverlay.offsetY).toBe(-20)
    expect(useAppStore.getState().cameraOverlay.scale).toBe(1)
    expect(mockRendererSetKeyboardOpacity).toHaveBeenCalledWith(1)
  })

  it('keeps alignment in progress when no active visualizer renderer is mounted', () => {
    useAppStore.setState({
      alignStep: 'waiting-low-a',
      appMode: 'createCamera',
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
      pieces: [
        {
          createdAt: Date.now(),
          filePath: 'C:/music/demo.mid',
          id: 'piece-1',
          name: 'Demo',
          type: 'midi',
        },
      ],
    })
    mockActiveVisualizerRenderer.current = null

    render(<App />)

    const rightPanel = screen.getByTestId('create-visualizer-area')
    vi.spyOn(rightPanel, 'getBoundingClientRect').mockReturnValue({
      bottom: 720,
      height: 700,
      left: 300,
      right: 1200,
      toJSON: () => undefined,
      top: 20,
      width: 900,
      x: 300,
      y: 20,
    })

    const overlay = screen.getByTestId('full-panel-align-overlay')

    fireEvent.click(overlay, { clientX: 450, clientY: 120 })

    expect(useAppStore.getState().lowAPoint).toEqual({ x: 150, y: 100 })
    expect(useAppStore.getState().alignStep).toBe('waiting-high-c')

    fireEvent.click(overlay, { clientX: 1250, clientY: 130 })

    expect(useAppStore.getState().highCPoint).toBeNull()
    expect(useAppStore.getState().alignStep).toBe('waiting-high-c')
    expect(mockRendererSetKeyboardOpacity).not.toHaveBeenCalled()
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}
