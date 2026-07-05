import { describe, expect, it } from 'vitest'

import type { CameraViewport } from '../camera/CameraSystem'
import type { Note, ProjectData, Track } from '../midi/types'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { SpatialIndex, SpatialIndexError } from './SpatialIndex'

describe('SpatialIndex', () => {
  it('builds an empty index for empty project data without throwing', () => {
    const index = createManualIndex()

    expect(() => index.build(createProjectData([]))).not.toThrow()
    expect(index.getTotalNoteCount()).toBe(0)
    expect(index.getIndexedTrackCount()).toBe(0)
    expect(index.getVisibleNotes(createViewport())).toEqual([])
  })

  it('indexes notes across tracks and reports correct totals', () => {
    const index = createManualIndex()
    const project = createProjectData([
      createTrack('track-1', createLinearNotes(10, 0, 60)),
      createTrack('track-2', createLinearNotes(10, 10, 61)),
      createTrack('track-3', createLinearNotes(10, 20, 62)),
    ])

    index.build(project)

    expect(index.getTotalNoteCount()).toBe(30)
    expect(index.getIndexedTrackCount()).toBe(3)
  })

  it('stores notes sorted by startTick ascending after build', () => {
    const index = createManualIndex()
    index.build(
      createProjectData([
        createTrack('track-1', [
          createNote('a', 60, 300, 400),
          createNote('b', 61, 100, 200),
          createNote('c', 62, 200, 300),
        ]),
      ]),
    )

    const results = index.getNotesInRegion(0, 0, 127, 1_000)
    expect(results.map((entry) => entry.note.startTick)).toEqual([100, 200, 300])
  })

  it('build called twice replaces the previous index', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', createLinearNotes(5, 0, 60))]))
    index.build(createProjectData([createTrack('track-2', createLinearNotes(2, 0, 72))]))

    expect(index.getTotalNoteCount()).toBe(2)
    expect(index.getIndexedTrackCount()).toBe(1)
    expect(index.getNotesInRegion(0, 0, 127, 1_000).map((entry) => entry.trackId)).toEqual([
      'track-2',
      'track-2',
    ])
  })

  it('clear resets the index to empty state', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', createLinearNotes(5, 0, 60))]))

    index.clear()

    expect(index.getTotalNoteCount()).toBe(0)
    expect(index.getIndexedTrackCount()).toBe(0)
    expect(index.getVisibleNotes(createViewport())).toEqual([])
  })

  it('returns visible notes overlapping the viewport tick range and pitch range', () => {
    const index = createManualIndex()
    index.build(
      createProjectData([
        createTrack('track-1', [
          createNote('before', 60, 50, 90),
          createNote('extends-in', 61, 80, 130),
          createNote('inside', 62, 120, 180),
          createNote('extends-out', 63, 180, 260),
          createNote('after', 64, 210, 260),
          createNote('wrong-pitch', 70, 120, 160),
        ]),
      ]),
    )

    const visible = index.getVisibleNotes(
      createViewport({
        maxPitch: 63,
        maxTick: 200,
        minPitch: 60,
        minTick: 100,
      }),
    )

    expect(visible.map((entry) => entry.note.id)).toEqual(['extends-in', 'inside', 'extends-out'])
  })

  it('includes notes on exact pitch boundaries', () => {
    const index = createManualIndex()
    index.build(
      createProjectData([
        createTrack('track-1', [
          createNote('left', 60, 100, 150),
          createNote('right', 62, 100, 150),
        ]),
      ]),
    )

    const visible = index.getVisibleNotes(
      createViewport({
        maxPitch: 62,
        maxTick: 200,
        minPitch: 60,
        minTick: 0,
      }),
    )

    expect(visible.map((entry) => entry.note.id)).toEqual(['left', 'right'])
  })

  it('returns all notes when all are visible and empty when none are visible', () => {
    const index = createManualIndex()
    const project = createProjectData([
      createTrack('track-1', [
        createNote('a', 60, 100, 200),
        createNote('b', 61, 220, 320),
      ]),
    ])
    index.build(project)

    expect(
      index.getVisibleNotes(
        createViewport({
          maxPitch: 127,
          maxTick: 1_000,
          minPitch: 0,
          minTick: 0,
        }),
      ),
    ).toHaveLength(2)

    expect(
      index.getVisibleNotes(
        createViewport({
          maxPitch: 10,
          maxTick: 50,
          minPitch: 0,
          minTick: 0,
        }),
      ),
    ).toEqual([])
  })

  it('returns empty for zero-height viewports and throws for invalid viewport ranges', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', [createNote('a', 60, 100, 200)])]))

    expect(
      index.getVisibleNotes(
        createViewport({
          maxTick: 100,
          minTick: 100,
        }),
      ),
    ).toEqual([])

    expect(() =>
      index.getVisibleNotes(
        createViewport({
          maxTick: 50,
          minTick: 100,
        }),
      ),
    ).toThrowError(SpatialIndexError)
  })

  it('returns the correct note for a point inside a note range', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', [createNote('hit', 60, 100, 200)])]))

    expect(index.getNoteAtPoint(60.1, 150)?.note.id).toBe('hit')
  })

  it('returns null when no note exists at a point', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', [createNote('hit', 60, 100, 200)])]))

    expect(index.getNoteAtPoint(61, 150)).toBeNull()
    expect(index.getNoteAtPoint(60, 250)).toBeNull()
  })

  it('returns the latest-starting overlapping note at a point', () => {
    const index = createManualIndex()
    index.build(
      createProjectData([
        createTrack('track-1', [
          createNote('earlier', 60, 100, 220),
          createNote('later', 60, 140, 260),
        ]),
      ]),
    )

    expect(index.getNoteAtPoint(60, 180)?.note.id).toBe('later')
  })

  it('hits exact start and visualEnd boundaries and rounds worldX correctly', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', [createNote('hit', 60, 100, 200)])]))

    expect(index.getNoteAtPoint(60, 100)?.note.id).toBe('hit')
    expect(index.getNoteAtPoint(60, 200)?.note.id).toBe('hit')
    expect(index.getNoteAtPoint(60.4, 150)?.note.id).toBe('hit')
    expect(index.getNoteAtPoint(60.6, 150)).toBeNull()
  })

  it('returns notes inside and partially overlapping a selection region', () => {
    const index = createManualIndex()
    index.build(
      createProjectData([
        createTrack('track-1', [
          createNote('inside', 60, 100, 180),
          createNote('partial-top', 61, 50, 120),
          createNote('partial-bottom', 62, 170, 260),
          createNote('outside', 70, 100, 180),
        ]),
      ]),
    )

    const notes = index.getNotesInRegion(60, 100, 62, 200)
    expect(notes.map((entry) => entry.note.id)).toEqual(['partial-top', 'inside', 'partial-bottom'])
  })

  it('returns empty arrays for empty selection hits and supports single-pitch regions', () => {
    const index = createManualIndex()
    index.build(
      createProjectData([
        createTrack('track-1', [
          createNote('pitch-60', 60, 100, 200),
          createNote('pitch-61', 61, 100, 200),
        ]),
      ]),
    )

    expect(index.getNotesInRegion(60, 100, 60, 200).map((entry) => entry.note.id)).toEqual(['pitch-60'])
    expect(index.getNotesInRegion(70, 0, 71, 50)).toEqual([])
  })

  it('returns an empty result for inverted region bounds', () => {
    const index = createManualIndex()
    index.build(createProjectData([createTrack('track-1', [createNote('a', 60, 100, 200)])]))

    expect(index.getNotesInRegion(10, 0, 5, 100)).toEqual([])
    expect(index.getNotesInRegion(0, 100, 10, 50)).toEqual([])
  })

  it('auto-rebuilds when a new project loads into the store', () => {
    resetStore()
    const index = new SpatialIndex()
    const firstProject = createProjectData([createTrack('track-1', [createNote('first', 60, 100, 200)])])
    const secondProject = createProjectData([createTrack('track-2', [createNote('second', 61, 300, 400)])])
    const tempoMap = createTempoMap()

    useAppStore.getState().loadProject(firstProject, tempoMap)
    expect(index.getTotalNoteCount()).toBe(1)
    expect(index.getNoteAtPoint(60, 150)?.note.id).toBe('first')

    useAppStore.getState().loadProject(secondProject, tempoMap)
    expect(index.getTotalNoteCount()).toBe(1)
    expect(index.getNoteAtPoint(61, 350)?.note.id).toBe('second')
  })

  it('clears automatically when projectData is unloaded from the store', () => {
    resetStore()
    const index = new SpatialIndex()
    useAppStore.getState().loadProject(
      createProjectData([createTrack('track-1', [createNote('first', 60, 100, 200)])]),
      createTempoMap(),
    )

    useAppStore.getState().unloadProject()

    expect(index.getTotalNoteCount()).toBe(0)
    expect(index.getIndexedTrackCount()).toBe(0)
    expect(index.getVisibleNotes(createViewport())).toEqual([])
  })

  it('builds 10,000 notes quickly and queries a visible window in under 1ms', () => {
    const index = createManualIndex()
    const project = createLargeProject(10_000, 4)

    const buildStart = performance.now()
    index.build(project)
    const buildDuration = performance.now() - buildStart

    const queryStart = performance.now()
    const visible = index.getVisibleNotes(
      createViewport({
        maxPitch: 127,
        maxTick: 52_500,
        minPitch: 0,
        minTick: 50_000,
      }),
    )
    const queryDuration = performance.now() - queryStart

    expect(index.getTotalNoteCount()).toBe(10_000)
    expect(buildDuration).toBeLessThan(100)
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(200)
    expect(queryDuration).toBeLessThan(1)
  })

  it('short-circuits safely for queries before the first build', () => {
    const index = createManualIndex()

    expect(index.getVisibleNotes(createViewport())).toEqual([])
    expect(index.getNoteAtPoint(60, 100)).toBeNull()
    expect(index.getNotesInRegion(0, 0, 1, 1)).toEqual([])
  })
})

function createManualIndex(): SpatialIndex {
  return new SpatialIndex(false)
}

function createViewport(overrides: Partial<CameraViewport> = {}): CameraViewport {
  return {
    maxPitch: 127,
    maxTick: 1_000,
    minPitch: 0,
    minTick: 0,
    pixelsPerPitch: 10,
    pixelsPerTick: 1,
    worldZoom: 1,
    ...overrides,
  }
}

function createProjectData(tracks: Track[]): ProjectData {
  return {
    tempoMap: [
      {
        bpm: 60,
        microsecondsPerBeat: 1_000_000,
        tick: 0,
      },
    ],
    ticksPerQuarter: 480,
    timeSignatures: [],
    totalTicks: 100_000,
    tracks,
  }
}

function createTempoMap(): PrecomputedTempoMap {
  return {
    segments: [
      {
        bpm: 60,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 1_000_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: 480,
      },
    ],
  }
}

function createTrack(id: string, notes: Note[]): Track {
  return {
    channel: 0,
    id,
    name: id,
    notes,
  }
}

function createNote(id: string, pitch: number, startTick: number, visualEndTick: number): Note {
  return {
    endTick: visualEndTick,
    id,
    pitch,
    startTick,
    velocity: 100,
    visualEndTick,
  }
}

function createLinearNotes(count: number, startOffset: number, pitch: number): Note[] {
  return Array.from({ length: count }, (_, index) =>
    createNote(`${pitch}-${index}`, pitch + (index % 3), startOffset + index * 100, startOffset + index * 100 + 80),
  )
}

function createLargeProject(totalNotes: number, trackCount: number): ProjectData {
  const notesPerTrack = Math.floor(totalNotes / trackCount)
  const tracks: Track[] = []

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const notes: Note[] = []

    for (let noteIndex = 0; noteIndex < notesPerTrack; noteIndex += 1) {
      const startTick = noteIndex * 100 + trackIndex * 5
      notes.push(
        createNote(
          `track-${trackIndex}-note-${noteIndex}`,
          40 + ((trackIndex + noteIndex) % 40),
          startTick,
          startTick + 40,
        ),
      )
    }

    tracks.push(createTrack(`track-${trackIndex}`, notes))
  }

  return createProjectData(tracks)
}
