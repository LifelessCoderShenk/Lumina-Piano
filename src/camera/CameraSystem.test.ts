import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ProjectData, Track } from '../midi/types'
import { resetStore, useAppStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { CameraError, CameraSystem } from './CameraSystem'

const VIEWPORT_WIDTH = 1920
const VIEWPORT_HEIGHT = 1080

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  resetStore()
})

describe('CameraSystem', () => {
  it('init sets viewport size in store', () => {
    const camera = createInitializedCamera()

    expect(useAppStore.getState().viewportWidth).toBe(VIEWPORT_WIDTH)
    expect(useAppStore.getState().viewportHeight).toBe(VIEWPORT_HEIGHT)

    camera.destroy()
  })

  it('guards methods called before init', () => {
    const camera = new CameraSystem()

    expect(() => camera.worldToScreen(21, 0)).toThrowError(CameraError)
    expect(() => camera.getViewport()).toThrowError(CameraError)

    try {
      camera.screenToWorld(0, 0)
    } catch (error: unknown) {
      expect((error as CameraError).code).toBe('NOT_INITIALIZED')
    }
  })

  it('destroy cleans up and methods fail again afterward', () => {
    const camera = createInitializedCamera()

    camera.destroy()
    useAppStore.getState().setPan(100, 200)

    expect(() => camera.worldToScreen(21, 0)).toThrowError(CameraError)
  })

  it('init twice throws a CameraError guard', () => {
    const camera = new CameraSystem()
    camera.init(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

    expect(() => camera.init(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)).toThrowError(CameraError)

    try {
      camera.init(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
    } catch (error: unknown) {
      expect((error as CameraError).code).toBe('NOT_INITIALIZED')
    }

    camera.destroy()
  })

  it('maps pitch 21 to screen x=0 at zoom 1.0 in the default reset view', () => {
    const camera = createInitializedCamera()

    expect(camera.worldToScreen(21, 0).x).toBeCloseTo(0, 10)

    camera.destroy()
  })

  it('maps pitch 108 to screen x=viewportWidth at zoom 1.0 in the default reset view', () => {
    const camera = createInitializedCamera()

    expect(camera.worldToScreen(108, 0).x).toBeCloseTo(VIEWPORT_WIDTH, 10)

    camera.destroy()
  })

  it('maps tick 0 to screen y=0 at zoom 1.0 in the default reset view', () => {
    const camera = createInitializedCamera()

    expect(camera.worldToScreen(21, 0).y).toBeCloseTo(0, 10)

    camera.destroy()
  })

  it('worldToScreen and screenToWorld are inverses for random points', () => {
    const camera = createInitializedCamera()
    camera.panTo(30, 480)
    camera.zoomTo(2.75, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    for (const point of generateRandomWorldPoints(50)) {
      const screen = camera.worldToScreen(point.x, point.y)
      const world = camera.screenToWorld(screen.x, screen.y)

      expect(world.x).toBeCloseTo(point.x, 10)
      expect(world.y).toBeCloseTo(point.y, 10)
    }

    camera.destroy()
  })

  it('screen (0,0) maps back to the current pan', () => {
    const camera = createInitializedCamera()
    camera.panTo(35, 720)

    expect(camera.screenToWorld(0, 0)).toEqual({
      x: 35,
      y: 720,
    })

    camera.destroy()
  })

  it('screen viewport bounds convert to the expected world coordinates', () => {
    const camera = createInitializedCamera()
    camera.panTo(21, 0)

    const world = camera.screenToWorld(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

    expect(world.x).toBeCloseTo(108, 10)
    expect(world.y).toBeCloseTo(1920, 10)

    camera.destroy()
  })

  it('screenToWorld remains inverse under arbitrary zoom and pan', () => {
    const camera = createInitializedCamera()
    camera.panTo(40, 300)
    camera.zoomTo(3.5, 400, 300)

    const screen = { x: 712, y: 845 }
    const world = camera.screenToWorld(screen.x, screen.y)
    const roundTrip = camera.worldToScreen(world.x, world.y)

    expect(roundTrip.x).toBeCloseTo(screen.x, 10)
    expect(roundTrip.y).toBeCloseTo(screen.y, 10)

    camera.destroy()
  })

  it('zoom doubles worldZoom when factor is 2.0 at screen center', () => {
    const camera = createInitializedCamera()

    camera.zoom(2, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    expect(useAppStore.getState().worldZoom).toBeCloseTo(2, 10)

    camera.destroy()
  })

  it('keeps the world point under the zoom center fixed on screen', () => {
    const camera = createInitializedCamera()
    const centerX = VIEWPORT_WIDTH / 2
    const centerY = VIEWPORT_HEIGHT / 2
    const before = camera.screenToWorld(centerX, centerY)

    camera.zoom(2, centerX, centerY)

    const after = camera.screenToWorld(centerX, centerY)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)

    camera.destroy()
  })

  it('clamps zoom to MIN_ZOOM', () => {
    const camera = createInitializedCamera()

    camera.zoomTo(0.001, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    expect(useAppStore.getState().worldZoom).toBe(0.1)

    camera.destroy()
  })

  it('clamps zoom to MAX_ZOOM', () => {
    const camera = createInitializedCamera()

    camera.zoomTo(500, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    expect(useAppStore.getState().worldZoom).toBe(50)

    camera.destroy()
  })

  it('zoom by 1.0 is a no-op', () => {
    const camera = createInitializedCamera()
    const before = {
      panX: useAppStore.getState().panX,
      panY: useAppStore.getState().panY,
      worldZoom: useAppStore.getState().worldZoom,
    }

    camera.zoom(1, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    expect(useAppStore.getState().worldZoom).toBe(before.worldZoom)
    expect(useAppStore.getState().panX).toBe(before.panX)
    expect(useAppStore.getState().panY).toBe(before.panY)

    camera.destroy()
  })

  it('zoomTo sets worldZoom exactly', () => {
    const camera = createInitializedCamera()

    camera.zoomTo(2, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    expect(useAppStore.getState().worldZoom).toBe(2)

    camera.destroy()
  })

  it('zoomTo throws INVALID_ZOOM for NaN and Infinity', () => {
    const camera = createInitializedCamera()

    expect(() => camera.zoomTo(Number.NaN, 0, 0)).toThrowError(CameraError)

    try {
      camera.zoomTo(Number.POSITIVE_INFINITY, 0, 0)
    } catch (error: unknown) {
      expect((error as CameraError).code).toBe('INVALID_ZOOM')
    }

    camera.destroy()
  })

  it('zoomTo keeps the center point fixed on screen', () => {
    const camera = createInitializedCamera()
    const centerX = 300
    const centerY = 200
    const before = camera.screenToWorld(centerX, centerY)

    camera.zoomTo(4, centerX, centerY)

    const after = camera.screenToWorld(centerX, centerY)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)

    camera.destroy()
  })

  it('panBy updates pan and shifts visible pitches by the expected amount', () => {
    const camera = createInitializedCamera()
    const before = camera.getViewport()
    const expectedShift = 100 / (before.pixelsPerPitch * before.worldZoom)

    camera.panBy(100, 0)

    expect(useAppStore.getState().panX).toBeCloseTo(21 - expectedShift, 10)
    expect(camera.getViewport().minPitch).toBeCloseTo(before.minPitch - expectedShift, 10)

    camera.destroy()
  })

  it('panBy updates vertical pan correctly', () => {
    const camera = createInitializedCamera()
    const before = camera.getViewport()
    const expectedShift = 100 / (before.pixelsPerTick * before.worldZoom)

    camera.panBy(0, 100)

    expect(useAppStore.getState().panY).toBeCloseTo(-expectedShift, 10)
    expect(camera.getViewport().minTick).toBeCloseTo(before.minTick - expectedShift, 10)

    camera.destroy()
  })

  it('panBy handles negative deltas in the opposite direction', () => {
    const camera = createInitializedCamera()
    camera.panBy(-100, -100)

    expect(useAppStore.getState().panX).toBeGreaterThan(21)
    expect(useAppStore.getState().panY).toBeGreaterThan(0)

    camera.destroy()
  })

  it('panTo places the requested world point at the top-left of the viewport', () => {
    const camera = createInitializedCamera()

    camera.panTo(21, 0)

    expect(camera.worldToScreen(21, 0)).toEqual({ x: 0, y: 0 })
    expect(useAppStore.getState().panX).toBe(21)
    expect(useAppStore.getState().panY).toBe(0)

    camera.destroy()
  })

  it('resetCamera restores zoom 1.0, panY 0, and the piano range view', () => {
    const camera = createInitializedCamera()
    camera.panTo(55, 800)
    camera.zoomTo(3, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    camera.resetCamera()

    const viewport = camera.getViewport()
    expect(useAppStore.getState().worldZoom).toBe(1)
    expect(useAppStore.getState().panY).toBe(0)
    expect(viewport.minPitch).toBeCloseTo(21, 10)
    expect(viewport.maxPitch).toBeCloseTo(108, 10)

    camera.destroy()
  })

  it('getViewport reports the expected default range', () => {
    const camera = createInitializedCamera()
    const viewport = camera.getViewport()

    expect(viewport.minPitch).toBeLessThanOrEqual(21)
    expect(viewport.maxPitch).toBeGreaterThanOrEqual(108)
    expect(viewport.maxTick).toBeGreaterThan(viewport.minTick)

    camera.destroy()
  })

  it('getViewport updates after zoom changes', () => {
    const camera = createInitializedCamera()
    const before = camera.getViewport()

    camera.zoomTo(2, VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2)

    const after = camera.getViewport()
    expect(after.maxPitch - after.minPitch).toBeLessThan(before.maxPitch - before.minPitch)
    expect(after.maxTick - after.minTick).toBeLessThan(before.maxTick - before.minTick)

    camera.destroy()
  })

  it('getViewport updates after pan changes', () => {
    const camera = createInitializedCamera()

    camera.panTo(30, 600)

    const viewport = camera.getViewport()
    expect(viewport.minPitch).toBeCloseTo(30, 10)
    expect(viewport.minTick).toBeCloseTo(600, 10)

    camera.destroy()
  })

  it('reports a fully inside rectangle as visible', () => {
    const camera = createInitializedCamera()
    expect(camera.isRectVisible(30, 200, 10, 200)).toBe(true)
    camera.destroy()
  })

  it('reports rectangles fully outside each edge as not visible', () => {
    const camera = createInitializedCamera()
    const viewport = camera.getViewport()

    expect(camera.isRectVisible(viewport.minPitch - 10, 200, 5, 100)).toBe(false)
    expect(camera.isRectVisible(viewport.maxPitch + 1, 200, 5, 100)).toBe(false)
    expect(camera.isRectVisible(30, viewport.minTick - 10, 5, 5)).toBe(false)
    expect(camera.isRectVisible(30, viewport.maxTick + 1, 5, 5)).toBe(false)

    camera.destroy()
  })

  it('reports partial edge overlap and oversized rectangles as visible', () => {
    const camera = createInitializedCamera()
    const viewport = camera.getViewport()

    expect(camera.isRectVisible(viewport.maxPitch - 1, 100, 10, 100)).toBe(true)
    expect(camera.isRectVisible(viewport.minPitch - 100, viewport.minTick - 100, 500, 3000)).toBe(true)

    camera.destroy()
  })

  it('reports point visibility including viewport edges', () => {
    const camera = createInitializedCamera()
    const viewport = camera.getViewport()

    expect(camera.isVisible(40, 400)).toBe(true)
    expect(camera.isVisible(viewport.minPitch, viewport.minTick)).toBe(true)
    expect(camera.isVisible(viewport.maxPitch + 1, viewport.maxTick + 1)).toBe(false)

    camera.destroy()
  })

  it('returns renderScale from the store and does not apply it to transforms', () => {
    const camera = createInitializedCamera()
    const before = camera.worldToScreen(40, 400)

    useAppStore.getState().setRenderScale(3)

    expect(camera.getRenderScale()).toBe(3)
    expect(camera.worldToScreen(40, 400)).toEqual(before)

    camera.destroy()
  })

  it('setViewportSize rejects zero or negative dimensions', () => {
    const camera = createInitializedCamera()

    expect(() => camera.setViewportSize(0, 100)).toThrowError(CameraError)
    expect(() => camera.setViewportSize(100, 0)).toThrowError(CameraError)

    try {
      camera.setViewportSize(-1, 100)
    } catch (error: unknown) {
      expect((error as CameraError).code).toBe('INVALID_VIEWPORT')
    }

    camera.destroy()
  })

  it('reflects external store pan changes immediately', () => {
    const camera = createInitializedCamera()

    useAppStore.getState().setPan(50, 100)

    expect(camera.screenToWorld(0, 0)).toEqual({
      x: 50,
      y: 100,
    })

    camera.destroy()
  })
})

function createInitializedCamera(): CameraSystem {
  const camera = new CameraSystem()
  useAppStore.getState().loadProject(createProjectData(), createTempoMap())
  camera.init(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  return camera
}

function createProjectData(): ProjectData {
  return {
    tempoMap: [
      {
        bpm: 60,
        microsecondsPerBeat: 1_000_000,
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
    totalTicks: 10_000,
    tracks: createTracks(),
  }
}

function createTracks(): Track[] {
  return [
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
  ]
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

function generateRandomWorldPoints(count: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  let seed = 246_813_579

  for (let index = 0; index < count; index += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    const xRatio = seed / 0xffff_ffff
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    const yRatio = seed / 0xffff_ffff

    points.push({
      x: 21 + xRatio * 87,
      y: yRatio * 10_000,
    })
  }

  return points
}
