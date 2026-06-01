import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../store/store'

const mockEffectsDestroy = vi.hoisted(() => vi.fn())
const mockEffectsInit = vi.hoisted(() => vi.fn())
const mockEffectsReset = vi.hoisted(() => vi.fn())
const mockEffectsSeek = vi.hoisted(() => vi.fn())
const mockEffectsUpdate = vi.hoisted(() => vi.fn())
const mockSpatialGetNotesInRegion = vi.hoisted(() => vi.fn(() => []))
const mockSpatialGetTotalNoteCount = vi.hoisted(() => vi.fn(() => 0))

vi.mock('pixi.js', () => {
  class MockContainer {
    children: unknown[] = []
    visible = true
    alpha = 1
    x = 0
    y = 0
    parent: MockContainer | null = null
    filters: unknown[] = []

    addChild(...children: unknown[]) {
      for (const child of children) {
        this.children.push(child)
        if (typeof child === 'object' && child != null && 'parent' in child) {
          ;(child as { parent: MockContainer | null }).parent = this
        }
      }

      return children[0]
    }

    removeChild(child: unknown) {
      this.children = this.children.filter((candidate) => candidate !== child)
      if (typeof child === 'object' && child != null && 'parent' in child) {
        ;(child as { parent: MockContainer | null }).parent = null
      }

      return child
    }

    removeChildren() {
      const removed = [...this.children]
      for (const child of removed) {
        if (typeof child === 'object' && child != null && 'parent' in child) {
          ;(child as { parent: MockContainer | null }).parent = null
        }
      }
      this.children = []
      return removed
    }

    destroy() {}
  }

  class MockGraphics {
    visible = true
    alpha = 1
    x = 0
    y = 0
    destroyed = false
    parent: MockContainer | null = null
    clear = vi.fn(() => this)
    beginFill = vi.fn(() => this)
    drawRect = vi.fn(() => this)
    drawCircle = vi.fn(() => this)
    endFill = vi.fn(() => this)
    lineStyle = vi.fn(() => this)
    moveTo = vi.fn(() => this)
    lineTo = vi.fn(() => this)
    quadraticCurveTo = vi.fn(() => this)
    closePath = vi.fn(() => this)
    destroy = vi.fn(() => {
      this.destroyed = true
    })
  }

  class MockTextStyle {
    constructor(options: object) {
      Object.assign(this, options)
    }
  }

  class MockText {
    text = ''
    visible = true
    alpha = 1
    x = 0
    y = 0
    resolution = 1
    parent: MockContainer | null = null
    style: MockTextStyle
    scale = {
      x: 1,
      y: 1,
      set: (x: number, y = x) => {
        this.scale.x = x
        this.scale.y = y
      },
    }
    anchor = {
      x: 0.5,
      y: 0.5,
      set: (x: number, y = x) => {
        this.anchor.x = x
        this.anchor.y = y
      },
    }

    constructor(text: string, style: MockTextStyle) {
      this.text = text
      this.style = style
    }

    destroy() {}
  }

  class MockSprite {
    visible = true
    alpha = 1
    x = 0
    y = 0
    width = 0
    height = 0
    texture: unknown
    parent: MockContainer | null = null
    position = {
      set: (x: number, y: number) => {
        this.x = x
        this.y = y
      },
    }
    scale = {
      x: 1,
      y: 1,
      set: (x: number, y = x) => {
        this.scale.x = x
        this.scale.y = y
      },
    }

    constructor(texture: unknown) {
      this.texture = texture
    }

    destroy() {}
  }

  class MockTexture {
    static EMPTY = new MockTexture()
    static WHITE = new MockTexture()

    static from() {
      return new MockTexture()
    }

    destroy() {}
  }

  class MockTicker {
    elapsedMS = 0
    started = false
    add = vi.fn()
    remove = vi.fn()
    start = vi.fn(() => {
      this.started = true
    })
    stop = vi.fn(() => {
      this.started = false
    })
  }

  class MockApplication {
    stage = new MockContainer()
    screen: { width: number; height: number }
    view: HTMLCanvasElement
    ticker = new MockTicker()
    renderer: {
      resolution: number
      resize: ReturnType<typeof vi.fn>
    }
    render = vi.fn()
    destroy = vi.fn()

    constructor(options: {
      height?: number
      resolution?: number
      view?: HTMLCanvasElement
      width?: number
    } = {}) {
      this.screen = {
        height: options.height ?? 600,
        width: options.width ?? 800,
      }
      this.view = options.view ?? document.createElement('canvas')
      this.view.style.width = this.view.style.width || ''
      this.view.style.height = this.view.style.height || ''
      this.renderer = {
        resolution: options.resolution ?? 1,
        resize: vi.fn((width: number, height: number) => {
          this.screen.width = width
          this.screen.height = height
        }),
      }
    }
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Sprite: MockSprite,
    Text: MockText,
    TextStyle: MockTextStyle,
    Texture: MockTexture,
  }
})

vi.mock('../camera/CameraSystem', () => ({
  cameraSystem: {
    isInitialized: vi.fn(() => true),
    setViewportSize: vi.fn(),
  },
}))

vi.mock('../effects/EffectsLayer', () => ({
  effectsLayer: {
    destroy: mockEffectsDestroy,
    init: mockEffectsInit,
    reset: mockEffectsReset,
    seek: mockEffectsSeek,
    update: mockEffectsUpdate,
  },
}))

vi.mock('../playback/PlaybackEngine', () => ({
  playbackEngine: {
    off: vi.fn(),
    on: vi.fn(),
  },
}))

vi.mock('../spatial/SpatialIndex', () => ({
  spatialIndex: {
    getNotesInRegion: mockSpatialGetNotesInRegion,
    getTotalNoteCount: mockSpatialGetTotalNoteCount,
  },
}))

vi.mock('./noteMotion', () => ({
  getNoteScreenRect: vi.fn(() => ({ h: 48, w: 24, x: 120, y: 80 })),
  getVisibleTickWindow: vi.fn(() => ({ maxTick: 1000, minTick: 0 })),
}))

const { Renderer } = await import('./Renderer')

describe('Renderer playback sync', () => {
  beforeEach(() => {
    resetStore()
    mockEffectsDestroy.mockReset()
    mockEffectsInit.mockReset()
    mockEffectsReset.mockReset()
    mockEffectsSeek.mockReset()
    mockEffectsUpdate.mockReset()
    mockSpatialGetNotesInRegion.mockReset()
    mockSpatialGetNotesInRegion.mockReturnValue([])
    mockSpatialGetTotalNoteCount.mockReset()
    mockSpatialGetTotalNoteCount.mockReturnValue(0)
  })

  afterEach(() => {
    resetStore()
  })

  it('forceResume() restarts rendering when playback is active', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as unknown as { isRunning: boolean }).isRunning = false

    renderer.forceResume()

    expect((renderer as unknown as { isRunning: boolean }).isRunning).toBe(true)

    renderer.destroy()
  })

  it('store subscription to isPlaying starts and stops renderer running state', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    expect((renderer as unknown as { isRunning: boolean }).isRunning).toBe(false)

    useAppStore.getState().setIsPlaying(true)
    expect((renderer as unknown as { isRunning: boolean }).isRunning).toBe(true)

    useAppStore.getState().setIsPlaying(false)
    expect((renderer as unknown as { isRunning: boolean }).isRunning).toBe(false)

    renderer.destroy()
  })

  it('destroy() sets isInitialized=false and clears renderer scene references', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)

    renderer.destroy()

    expect((renderer as unknown as { isInitialized: boolean }).isInitialized).toBe(false)
    expect((renderer as unknown as { layers: unknown | null }).layers).toBeNull()
    expect((renderer as unknown as { backgroundGraphic: unknown | null }).backgroundGraphic).toBeNull()
    expect((renderer as unknown as { app: unknown | null }).app).toBeNull()
    expect((renderer as unknown as { unsubscribeStore: (() => void) | null }).unsubscribeStore).toBeNull()
  })

  it('rebuilds a fresh scene after destroy() and re-init()', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    const firstApp = (renderer as unknown as { app: { stage: { children: unknown[] } } | null }).app
    expect(firstApp?.stage.children.length).toBeGreaterThan(0)

    renderer.destroy()
    await renderer.init(canvas)

    const nextApp = (renderer as unknown as { app: { stage: { children: unknown[] } } | null }).app
    expect(nextApp).not.toBeNull()
    expect(nextApp).not.toBe(firstApp)
    expect(nextApp?.stage.children.length).toBeGreaterThan(0)

    renderer.destroy()
  })

  it('skips drawing excluded hand notes when learn mode is active', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    const leftNote = createIndexedNote('left-note', 59)
    const rightNote = createIndexedNote('right-note', 60)

    loadProjectWithNotes([leftNote.note, rightNote.note])
    useAppStore.getState().setSessionConfig({ hand: 'left', mode: 'listen' })
    useAppStore.getState().startSession()
    mockSpatialGetTotalNoteCount.mockReturnValue(2)
    mockSpatialGetNotesInRegion.mockReturnValue([leftNote, rightNote])

    await renderer.init(canvas)
    const renderedNotes = (renderer as unknown as {
      updateNotes: (currentTick: number) => Array<{ note: { pitch: number } }>
    }).updateNotes(0)

    expect(renderedNotes).toHaveLength(1)
    expect(renderedNotes[0].note.pitch).toBe(59)

    renderer.destroy()
  })

  it('keyboard does not highlight excluded hand keys', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    const leftNote = createIndexedNote('left-note', 59)
    const rightNote = createIndexedNote('right-note', 60)

    loadProjectWithNotes([leftNote.note, rightNote.note])
    useAppStore.getState().setSessionConfig({ hand: 'right', mode: 'listen' })
    useAppStore.getState().startSession()
    mockSpatialGetTotalNoteCount.mockReturnValue(2)
    mockSpatialGetNotesInRegion.mockReturnValue([leftNote, rightNote])

    await renderer.init(canvas)
    ;(renderer as unknown as { updateKeyboard: (currentTick: number) => void }).updateKeyboard(0)

    const keyboardEntries = (renderer as unknown as {
      keyboardPool: { getEntries: () => Array<{ graphic: { beginFill: { mock: { calls: Array<[number, number?]> } } }; pitch: number }> }
    }).keyboardPool.getEntries()
    const excludedEntry = keyboardEntries.find((entry) => entry.pitch === 59)
    const includedEntry = keyboardEntries.find((entry) => entry.pitch === 60)

    expect(excludedEntry).toBeTruthy()
    expect(includedEntry).toBeTruthy()
    expect(excludedEntry!.graphic.beginFill.mock.calls.length).toBeLessThan(includedEntry!.graphic.beginFill.mock.calls.length)

    renderer.destroy()
  })
})

function loadProjectWithNotes(notes: Array<{
  endTick: number
  id: string
  pitch: number
  startTick: number
  velocity: number
  visualEndTick: number
}>): void {
  useAppStore.getState().loadProject(
    {
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
      totalTicks: 960,
      tracks: [
        {
          channel: 0,
          id: 'track-1',
          name: 'Track 1',
          notes,
        },
      ],
    },
    {
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
    },
  )
}

function createIndexedNote(id: string, pitch: number) {
  return {
    note: {
      endTick: 480,
      id,
      pitch,
      startTick: 0,
      velocity: 100,
      visualEndTick: 480,
    },
    trackId: 'track-1',
    trackIndex: 0,
  }
}
