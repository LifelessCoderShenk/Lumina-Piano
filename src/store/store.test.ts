import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ProjectData, Track } from '../midi/types'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import {
  getAppState,
  resetStore,
  StoreError,
  subscribeToStore,
  useAppStore,
  usePlaybackState,
  useSelection,
} from './store'

beforeEach(() => {
  resetStore()
})

describe('initial state', () => {
  it('uses the expected defaults', () => {
    const state = getAppState()

    expect(state.projectData).toBeNull()
    expect(state.precomputedTempoMap).toBeNull()
    expect(state.isProjectLoaded).toBe(false)
    expect(state.currentTick).toBe(0)
    expect(state.isPlaying).toBe(false)
    expect(state.worldZoom).toBe(1)
    expect(state.selectedNoteIds).toBeInstanceOf(Set)
    expect(state.selectedNoteIds.size).toBe(0)
    expect(state.hoveredNoteId).toBeNull()
    expect(state.trackColors).toEqual({})
    expect(state.isExporting).toBe(false)
    expect(state.errorMessage).toBeNull()
    expect(state.loadPieceError).toBeNull()
    expect(state.cameraOverlay).toEqual({
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    })
    expect(state.recordModeConfig).toEqual({
      audioSourceDeviceId: null,
      cameraDeviceId: null,
      midiDeviceId: null,
      useMic: false,
      useMidiAudio: true,
    })
    expect(state.createNoteColors).toEqual({
      mode: 'single',
      pitchClassColors: {
        0: '#f74f4f',
        1: '#f7674f',
        2: '#f7a44f',
        3: '#f7d44f',
        4: '#a4f74f',
        5: '#4ff77a',
        6: '#4ff7a0',
        7: '#4ff7f0',
        8: '#4fa4f7',
        9: '#4f8ef7',
        10: '#7a4ff7',
        11: '#f74ff0',
      },
      singleColor: '#2e65a2',
    })
  })
})

describe('loadProject', () => {
  it('initializes project state, resets playback/selection/export state, and seeds track defaults', () => {
    const projectData = createProjectData(3)
    const tempoMap = createTempoMap()

    useAppStore.getState().setCurrentTick(999)
    useAppStore.getState().setIsPlaying(true)
    useAppStore.getState().selectNotes(['note-a'])
    useAppStore.getState().setHoveredNote('note-a')
    useAppStore.getState().setExportProgress(0.75, 75, 100, 15)
    useAppStore.getState().setIsExporting(true)

    useAppStore.getState().loadProject(projectData, tempoMap)

    const state = getAppState()
    expect(state.projectData).toBe(projectData)
    expect(state.precomputedTempoMap).toBe(tempoMap)
    expect(state.isProjectLoaded).toBe(true)
    expect(state.currentTick).toBe(0)
    expect(state.isPlaying).toBe(false)
    expect(state.loopEnabled).toBe(false)
    expect(state.selectedNoteIds.size).toBe(0)
    expect(state.hoveredNoteId).toBeNull()
    expect(state.isExporting).toBe(false)
    expect(state.exportProgress).toBe(0)
    expect(state.trackColors).toEqual({
      'track-1': '#4f8ef7',
      'track-2': '#f7674f',
      'track-3': '#4ff7a0',
    })
    expect(state.trackMuted).toEqual({
      'track-1': false,
      'track-2': false,
      'track-3': false,
    })
    expect(state.trackSoloed).toEqual({
      'track-1': false,
      'track-2': false,
      'track-3': false,
    })
  })

  it('throws StoreError for invalid project input', () => {
    expect(() => {
      useAppStore.getState().loadProject(null as unknown as ProjectData, createTempoMap())
    }).toThrowError(StoreError)

    try {
      useAppStore.getState().loadProject(null as unknown as ProjectData, createTempoMap())
    } catch (error: unknown) {
      expect((error as StoreError).code).toBe('INVALID_PROJECT')
    }
  })
})

describe('unloadProject', () => {
  it('fully resets state with no stale values remaining', () => {
    const projectData = createProjectData(2)
    const tempoMap = createTempoMap()

    useAppStore.getState().loadProject(projectData, tempoMap)
    useAppStore.getState().setCurrentTick(120)
    useAppStore.getState().setIsPlaying(true)
    useAppStore.getState().setPan(50, 75)
    useAppStore.getState().selectNotes(['note-a'])
    useAppStore.getState().setTrackMuted('track-1', true)
    useAppStore.getState().setActivePanel('export')
    useAppStore.getState().setErrorMessage('problem')
    useAppStore.getState().batchUpdate((state) => {
      state.loadPieceError = 'piece problem'
    })

    useAppStore.getState().unloadProject()

    const state = getAppState()
    expect(state.projectData).toBeNull()
    expect(state.precomputedTempoMap).toBeNull()
    expect(state.isProjectLoaded).toBe(false)
    expect(state.currentTick).toBe(0)
    expect(state.isPlaying).toBe(false)
    expect(state.panX).toBe(0)
    expect(state.panY).toBe(0)
    expect(state.selectedNoteIds.size).toBe(0)
    expect(state.trackColors).toEqual({})
    expect(state.trackMuted).toEqual({})
    expect(state.activePanel).toBeNull()
    expect(state.errorMessage).toBeNull()
    expect(state.loadPieceError).toBeNull()
  })
})

describe('setCurrentTick', () => {
  it('clamps against loaded project totalTicks', () => {
    useAppStore.getState().loadProject(createProjectData(1, 960), createTempoMap())

    useAppStore.getState().setCurrentTick(-50)
    expect(getAppState().currentTick).toBe(0)

    useAppStore.getState().setCurrentTick(1_500)
    expect(getAppState().currentTick).toBe(960)
  })

  it('never throws and clamps to zero or above without a loaded project', () => {
    expect(() => useAppStore.getState().setCurrentTick(-10)).not.toThrow()
    expect(() => useAppStore.getState().setCurrentTick(Number.NaN)).not.toThrow()
    expect(getAppState().currentTick).toBe(0)

    useAppStore.getState().setCurrentTick(250)
    expect(getAppState().currentTick).toBe(250)
  })
})

describe('setZoom', () => {
  it('clamps zoom into the supported range', () => {
    useAppStore.getState().setZoom(0.01)
    expect(getAppState().worldZoom).toBe(0.1)

    useAppStore.getState().setZoom(40)
    expect(getAppState().worldZoom).toBe(20)

    useAppStore.getState().setZoom(1.75)
    expect(getAppState().worldZoom).toBe(1.75)
  })
})

describe('selection actions', () => {
  it('uses Set semantics and avoids duplicates', () => {
    useAppStore.getState().selectNotes(['note-a', 'note-b'])
    useAppStore.getState().addToSelection(['note-b', 'note-c'])

    expect([...getAppState().selectedNoteIds]).toEqual(['note-a', 'note-b', 'note-c'])
  })

  it('clears selection and updates hovered note state', () => {
    useAppStore.getState().selectNotes(['note-a'])
    useAppStore.getState().setHoveredNote('note-a')

    expect(getAppState().hoveredNoteId).toBe('note-a')

    useAppStore.getState().clearSelection()
    useAppStore.getState().setHoveredNote(null)

    expect(getAppState().selectedNoteIds.size).toBe(0)
    expect(getAppState().hoveredNoteId).toBeNull()
  })
})

describe('track actions', () => {
  it('accepts valid hex colors and rejects invalid ones', () => {
    useAppStore.getState().setTrackColor('track-1', '#fff')
    useAppStore.getState().setTrackColor('track-2', '#abcdef')

    expect(getAppState().trackColors['track-1']).toBe('#fff')
    expect(getAppState().trackColors['track-2']).toBe('#abcdef')

    expect(() => useAppStore.getState().setTrackColor('track-3', 'red')).toThrowError(StoreError)
    expect(() => useAppStore.getState().setTrackColor('track-3', 'ffffff')).toThrowError(StoreError)
    expect(() => useAppStore.getState().setTrackColor('track-3', '')).toThrowError(StoreError)
  })

  it('cycles the default palette across many tracks', () => {
    const tracks = createTracks(10)
    useAppStore.getState().initTrackDefaults(tracks)

    const colors = getAppState().trackColors
    expect(colors['track-1']).toBe('#4f8ef7')
    expect(colors['track-8']).toBe('#f7674f')
    expect(colors['track-9']).toBe('#4f8ef7')
    expect(colors['track-10']).toBe('#f7674f')
  })

  it('updates muted and soloed states', () => {
    useAppStore.getState().setTrackMuted('track-1', true)
    useAppStore.getState().setTrackSoloed('track-1', true)

    expect(getAppState().trackMuted['track-1']).toBe(true)
    expect(getAppState().trackSoloed['track-1']).toBe(true)
  })
})

describe('export state', () => {
  it('updates export progress atomically and toggles exporting', () => {
    useAppStore.getState().setIsExporting(true)
    useAppStore.getState().setExportProgress(0.5, 120, 240, 18)

    const state = getAppState()
    expect(state.isExporting).toBe(true)
    expect(state.exportProgress).toBe(0.5)
    expect(state.exportFramesRendered).toBe(120)
    expect(state.exportTotalFrames).toBe(240)
    expect(state.exportEstimatedSecondsRemaining).toBe(18)

    useAppStore.getState().setIsExporting(false)
    expect(getAppState().isExporting).toBe(false)
  })
})

describe('create camera mode', () => {
  it('only enters camera mode when a loaded piece exists and switches to the camera tab', () => {
    useAppStore.getState().enterCameraMode()
    expect(getAppState().appMode).toBe('create')
    expect(getAppState().activeSecondBarTab).toBe('pieces')

    useAppStore.getState().addPiece({
      createdAt: Date.now(),
      filePath: 'C:/pieces/demo.mid',
      id: 'piece-1',
      name: 'Demo Piece',
      type: 'midi',
    })

    useAppStore.setState({
      currentPieceId: 'piece-1',
      isProjectLoaded: true,
    })

    useAppStore.getState().enterCameraMode()
    expect(getAppState().appMode).toBe('createCamera')
    expect(getAppState().activeSecondBarTab).toBe('camera')
  })
})

describe('create record mode', () => {
  it('enters record mode and resets the second bar to pieces', () => {
    useAppStore.setState({
      activeSecondBarTab: 'camera',
      alignStep: 'waiting-high-c',
      appMode: 'createCamera',
      highCPoint: { x: 20, y: 30 },
      lowAPoint: { x: 10, y: 15 },
    })

    useAppStore.getState().enterRecordMode()

    expect(getAppState().appMode).toBe('createRecord')
    expect(getAppState().activeSecondBarTab).toBe('pieces')
    expect(getAppState().alignStep).toBe('idle')
    expect(getAppState().lowAPoint).toBeNull()
    expect(getAppState().highCPoint).toBeNull()
  })

  it('updates the record mode config through setRecordModeConfig', () => {
    useAppStore.getState().setRecordModeConfig({
      audioSourceDeviceId: 'audio-1',
      cameraDeviceId: 'camera-1',
      midiDeviceId: 'midi-1',
      useMic: true,
    })

    expect(getAppState().recordModeConfig).toEqual({
      audioSourceDeviceId: 'audio-1',
      cameraDeviceId: 'camera-1',
      midiDeviceId: 'midi-1',
      useMic: true,
      useMidiAudio: true,
    })
  })
})

describe('create note colors', () => {
  it('updates the Create Mode note color mode and values', () => {
    useAppStore.getState().setCreateNoteColorMode('pitchClass')
    useAppStore.getState().setCreateSingleNoteColor('#123456')
    useAppStore.getState().setCreatePitchClassColor(9, '#abcdef')

    expect(getAppState().createNoteColors).toEqual({
      mode: 'pitchClass',
      pitchClassColors: expect.objectContaining({
        9: '#abcdef',
      }),
      singleColor: '#123456',
    })
  })

  it('validates Create Mode colors and pitch classes', () => {
    expect(() => useAppStore.getState().setCreateSingleNoteColor('red')).toThrowError(StoreError)
    expect(() => useAppStore.getState().setCreatePitchClassColor(12, '#ffffff')).toThrowError(StoreError)
  })

  it('does not replace Create Mode color state for identical values', () => {
    const initialColors = getAppState().createNoteColors

    useAppStore.getState().setCreateNoteColorMode(initialColors.mode)
    useAppStore.getState().setCreateSingleNoteColor(initialColors.singleColor)
    useAppStore.getState().setCreatePitchClassColor(0, initialColors.pitchClassColors[0])

    expect(getAppState().createNoteColors).toBe(initialColors)
  })
})

describe('camera overlay settings', () => {
  it('updates the overlay transform and crop values through setCameraOverlay', () => {
    useAppStore.getState().setCameraOverlay({
      cropLeft: 12,
      cropTop: 24,
      offsetX: 100,
      offsetY: -50,
      scale: 1.5,
    })

    expect(getAppState().cameraOverlay).toEqual({
      cropBottom: 0,
      cropLeft: 12,
      cropRight: 0,
      cropTop: 24,
      offsetX: 100,
      offsetY: -50,
      scale: 1.5,
    })
  })
})

describe('selector hooks', () => {
  it('avoids playback rerenders on unrelated store updates', () => {
    let renderCount = 0

    const { result } = renderHook(() => {
      renderCount += 1
      return usePlaybackState()
    })

    const initialValue = result.current

    act(() => {
      useAppStore.getState().setErrorMessage('ui-only')
    })

    expect(renderCount).toBe(1)
    expect(result.current).toBe(initialValue)

    act(() => {
      useAppStore.getState().setCurrentTick(42)
    })

    expect(renderCount).toBe(2)
    expect(result.current.currentTick).toBe(42)
  })

  it('avoids selection rerenders on unrelated updates', () => {
    let renderCount = 0

    const { result } = renderHook(() => {
      renderCount += 1
      return useSelection()
    })

    const initialSelection = result.current

    act(() => {
      useAppStore.getState().setErrorMessage('still unrelated')
    })

    expect(renderCount).toBe(1)
    expect(result.current).toBe(initialSelection)

    act(() => {
      useAppStore.getState().selectNotes(['note-a'])
    })

    expect(renderCount).toBe(2)
    expect(result.current.selectedNoteIds.has('note-a')).toBe(true)
  })
})

describe('non-React access', () => {
  it('returns live state through getAppState', () => {
    useAppStore.getState().setCurrentTick(321)
    expect(getAppState().currentTick).toBe(321)
  })

  it('supports subscriptions and unsubscribe stops callbacks', () => {
    let callCount = 0
    const unsubscribe = subscribeToStore(() => {
      callCount += 1
    })

    useAppStore.getState().setCurrentTick(5)
    expect(callCount).toBe(1)

    unsubscribe()

    useAppStore.getState().setCurrentTick(10)
    expect(callCount).toBe(1)
  })
})

describe('resetStore', () => {
  it('fully resets the Zustand store', () => {
    useAppStore.getState().loadProject(createProjectData(2), createTempoMap())
    useAppStore.getState().setCurrentTick(900)
    useAppStore.getState().setZoom(3)
    useAppStore.getState().selectNotes(['note-a'])

    resetStore()

    const state = getAppState()
    expect(state.projectData).toBeNull()
    expect(state.currentTick).toBe(0)
    expect(state.worldZoom).toBe(1)
    expect(state.selectedNoteIds.size).toBe(0)
  })
})

describe('batchUpdate', () => {
  it('updates multiple fields atomically and fires subscribers once', () => {
    let callCount = 0
    const unsubscribe = subscribeToStore(() => {
      callCount += 1
    })

    useAppStore.getState().batchUpdate((state) => {
      state.currentTick = 144
      state.isPlaying = true
      state.errorMessage = 'batched'
    })

    const state = getAppState()
    expect(state.currentTick).toBe(144)
    expect(state.isPlaying).toBe(true)
    expect(state.errorMessage).toBe('batched')
    expect(callCount).toBe(1)

    unsubscribe()
  })
})

function createProjectData(trackCount: number, totalTicks = 1_920): ProjectData {
  return {
    tempoMap: [
      {
        bpm: 120,
        microsecondsPerBeat: 500_000,
        tick: 0,
      },
    ],
    ticksPerQuarter: 480,
    timeSignatures: [
      {
        denominator: 4,
        numerator: 4,
        tick: 0,
      },
    ],
    totalTicks,
    tracks: createTracks(trackCount),
  }
}

function createTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, index) => ({
    channel: index % 16,
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    notes: [
      {
        endTick: 480,
        id: `note-${index + 1}`,
        pitch: 60 + index,
        startTick: 0,
        velocity: 100,
        visualEndTick: 480,
      },
    ],
  }))
}

function createTempoMap(): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 120,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 500_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: 960,
      },
    ],
  }
}
