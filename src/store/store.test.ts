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
      useAppStore.getState().setShowBloom(false)
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
