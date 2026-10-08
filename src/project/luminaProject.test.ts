import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectData } from '../midi/types'

const loadProjectData = vi.hoisted(() => vi.fn(async () => true))
const seek = vi.hoisted(() => vi.fn())

vi.mock('../midi/loadMidiProject', () => ({ loadProjectData }))
vi.mock('../playback/PlaybackEngine', () => ({ playbackEngine: { seek } }))

const {
  applyLuminaProjectDocument,
  createLuminaProjectDocument,
  parseLuminaProject,
  serializeLuminaProject,
} = await import('./luminaProject')
const { resetStore, useAppStore } = await import('../store/store')

const projectData: ProjectData = {
  ticksPerQuarter: 480,
  totalTicks: 1920,
  tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
  timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
  tracks: [{
    channel: 0,
    id: 'piano',
    name: 'Piano',
    notes: [{
      id: 'note-1', pitch: 60, startTick: 0, endTick: 480, visualEndTick: 480, velocity: 96,
      fingering: { hand: 'right', finger: 1, source: 'manual' },
    }],
  }],
}

describe('Lumina project files', () => {
  beforeEach(() => {
    resetStore()
    loadProjectData.mockClear()
    seek.mockClear()
  })

  it('round-trips editable notes and workspace settings', async () => {
    useAppStore.setState({
      projectData,
      isProjectLoaded: true,
      backgroundColor: '#123456',
      backgroundImage: 'data:image/png;base64,YmFja2dyb3VuZA==',
      backgroundImageTreatment: { blur: 12, dim: 30, saturation: 115, vignette: 48 },
      currentTick: 720,
      loopEnabled: true,
      loopStartTick: 480,
      loopEndTick: 960,
      trackColors: { piano: '#abcdef' },
      handVisualization: { enabled: true, opacity: 48 },
    })

    const saved = createLuminaProjectDocument(useAppStore.getState(), 'Night / Take')
    const reopened = parseLuminaProject(serializeLuminaProject(saved))
    expect(reopened.name).toBe('Night - Take')
    expect(reopened.projectData.tracks[0].notes[0].pitch).toBe(60)
    expect(reopened.projectData.tracks[0].notes[0].fingering).toEqual({ hand: 'right', finger: 1, source: 'manual' })

    await applyLuminaProjectDocument(reopened)
    expect(loadProjectData).toHaveBeenCalledWith(projectData)
    expect(useAppStore.getState()).toMatchObject({
      appMode: 'create',
      backgroundColor: '#123456',
      backgroundImage: 'data:image/png;base64,YmFja2dyb3VuZA==',
      backgroundImageTreatment: { blur: 12, dim: 30, saturation: 115, vignette: 48 },
      currentTick: 720,
      isPlaying: false,
      loopEnabled: true,
      trackColors: { piano: '#abcdef' },
      handVisualization: { enabled: true, opacity: 48 },
    })
    expect(seek).toHaveBeenCalledWith(720)
  })

  it('opens older projects without hand settings using safe defaults', async () => {
    const legacy = createLuminaProjectDocument({ ...useAppStore.getState(), projectData } as never, 'Legacy')
    delete legacy.workspace.handVisualization
    useAppStore.setState({ handVisualization: { enabled: true, opacity: 70 } })

    await applyLuminaProjectDocument(legacy)

    expect(useAppStore.getState().handVisualization).toEqual({ enabled: false, opacity: 35 })
  })

  it('opens older projects without a custom background using the color fallback', async () => {
    const legacy = createLuminaProjectDocument({ ...useAppStore.getState(), projectData } as never, 'Legacy background')
    delete (legacy.workspace.appearance as Partial<typeof legacy.workspace.appearance>).backgroundImage
    delete (legacy.workspace.appearance as Partial<typeof legacy.workspace.appearance>).backgroundImageTreatment
    useAppStore.setState({ backgroundImage: 'data:image/png;base64,c3RhbGU=' })

    await applyLuminaProjectDocument(legacy)

    expect(useAppStore.getState().backgroundImage).toBeNull()
    expect(useAppStore.getState().backgroundImageTreatment).toEqual({
      blur: 0,
      dim: 20,
      saturation: 100,
      vignette: 20,
    })
  })

  it('rejects invalid stored finger assignments', () => {
    const invalid = structuredClone(createLuminaProjectDocument({ ...useAppStore.getState(), projectData } as never, 'Invalid'))
    invalid.projectData.tracks[0].notes[0].fingering = { hand: 'right', finger: 6, source: 'manual' } as never

    expect(() => parseLuminaProject(serializeLuminaProject(invalid))).toThrow('fingering is invalid')
  })

  it('rejects unrelated and future project files with clear errors', () => {
    expect(() => parseLuminaProject('{"kind":"other","version":1}')).toThrow('not a Lumina project')
    expect(() => parseLuminaProject(JSON.stringify({ ...createLuminaProjectDocument({ ...useAppStore.getState(), projectData } as never, 'Test'), version: 2 }))).toThrow('version is not supported')
  })
})
