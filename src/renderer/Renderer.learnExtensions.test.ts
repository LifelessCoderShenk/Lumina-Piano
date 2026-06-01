import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as PIXI from 'pixi.js'

const mockNoteRect = vi.hoisted(() => ({
  value: { h: 48, w: 24, x: 120, y: 80 },
}))

const mockStoreState = vi.hoisted(() => createMockState())
const mockSpatialGetTotalNoteCount = vi.hoisted(() => vi.fn(() => 0))
const mockSpatialGetNotesInRegion = vi.hoisted(() => vi.fn(() => []))
const mockEffectsDestroy = vi.hoisted(() => vi.fn())
const mockEffectsInit = vi.hoisted(() => vi.fn())
const mockEffectsReset = vi.hoisted(() => vi.fn())
const mockEffectsSeek = vi.hoisted(() => vi.fn())
const mockEffectsUpdate = vi.hoisted(() => vi.fn())

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

  class MockApplicationTicker {
    elapsedMS = 0
    started = false
    private callbacks = new Set<(ticker: MockApplicationTicker) => void>()

    add(callback: (ticker: MockApplicationTicker) => void) {
      this.callbacks.add(callback)
    }

    remove(callback: (ticker: MockApplicationTicker) => void) {
      this.callbacks.delete(callback)
    }

    start() {
      this.started = true
    }

    stop() {
      this.started = false
    }
  }

  class MockApplication {
    stage: MockContainer
    screen: { width: number; height: number }
    view: HTMLCanvasElement
    ticker: MockTicker
    renderer: {
      resolution: number
      resize: ReturnType<typeof vi.fn>
    }
    render: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>

    constructor(options: {
      height?: number
      resolution?: number
      view?: HTMLCanvasElement
      width?: number
    } = {}) {
      this.stage = new MockContainer()
      this.screen = {
        height: options.height ?? 600,
        width: options.width ?? 800,
      }
      this.view = options.view ?? document.createElement('canvas')
      this.view.style.width = this.view.style.width || ''
      this.view.style.height = this.view.style.height || ''
      this.ticker = new MockApplicationTicker() as unknown as MockTicker
      this.renderer = {
        resolution: options.resolution ?? 1,
        resize: vi.fn((width: number, height: number) => {
          this.screen.width = width
          this.screen.height = height
        }),
      }
      this.render = vi.fn()
      this.destroy = vi.fn()
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

vi.mock('../store/store', () => ({
  getAppState: () => mockStoreState,
  subscribeToStore: vi.fn(() => () => undefined),
}))

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
  getNoteScreenRect: vi.fn(() => mockNoteRect.value),
  getVisibleTickWindow: vi.fn(() => ({ maxTick: 1000, minTick: 0 })),
}))

const { Renderer } = await import('./Renderer')

describe('Renderer learn extensions', () => {
  beforeEach(() => {
    resetMockState()
    mockNoteRect.value = { h: 48, w: 24, x: 120, y: 80 }
    mockSpatialGetNotesInRegion.mockReset()
    mockSpatialGetNotesInRegion.mockReturnValue([])
    mockSpatialGetTotalNoteCount.mockReset()
    mockSpatialGetTotalNoteCount.mockReturnValue(0)
    mockEffectsDestroy.mockReset()
    mockEffectsInit.mockReset()
    mockEffectsReset.mockReset()
    mockEffectsSeek.mockReset()
    mockEffectsUpdate.mockReset()
  })

  it('renders finger numbers when learn mode is active, supported mode, and height is greater than 20px', () => {
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'listen'
    mockStoreState.learnV3.fingerNumbers = { 'note-1': 3 }

    const renderer = createTestRenderer()
    const indexedNote = createIndexedNote('note-1', 60, 0)

    ;(renderer as any).renderNote(
      indexedNote,
      new Map(),
      0,
      0,
      'solid',
      new Set(),
      null,
      mockStoreState,
    )

    const fingerLabels = getTextChildren((renderer as any).layers.notes).filter((child) => child.text === '3')
    expect(fingerLabels).toHaveLength(1)
  })

  it('does not render finger numbers when learn mode is inactive', () => {
    mockStoreState.learnV3.isActive = false
    mockStoreState.learnV3.sessionConfig.mode = 'listen'
    mockStoreState.learnV3.fingerNumbers = { 'note-1': 3 }

    const renderer = createTestRenderer()

    ;(renderer as any).renderNote(
      createIndexedNote('note-1', 60, 0),
      new Map(),
      0,
      0,
      'solid',
      new Set(),
      null,
      mockStoreState,
    )

    const fingerLabels = getTextChildren((renderer as any).layers.notes).filter((child) => child.text === '3')
    expect(fingerLabels).toHaveLength(0)
  })

  it('does not render finger numbers when note height is 20px or less', () => {
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'playAlong'
    mockStoreState.learnV3.fingerNumbers = { 'note-1': 2 }
    mockNoteRect.value = { h: 20, w: 24, x: 120, y: 80 }

    const renderer = createTestRenderer()

    ;(renderer as any).renderNote(
      createIndexedNote('note-1', 60, 0),
      new Map(),
      0,
      0,
      'solid',
      new Set(),
      null,
      mockStoreState,
    )

    const fingerLabels = getTextChildren((renderer as any).layers.notes).filter((child) => child.text === '2')
    expect(fingerLabels).toHaveLength(0)
  })

  it('shows NoteByNoteLayer only when learn mode is active and the mode is noteByNote', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.fingerNumbers = { 'note-1': 1 }

    const renderer = createTestRenderer()

    mockStoreState.learnV3.isActive = false
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'
    ;(renderer as any).updateNoteByNoteLayer()
    expect((renderer as any).layers.noteByNote.visible).toBe(false)

    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'listen'
    ;(renderer as any).updateNoteByNoteLayer()
    expect((renderer as any).layers.noteByNote.visible).toBe(false)

    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'
    ;(renderer as any).updateNoteByNoteLayer()
    expect((renderer as any).layers.noteByNote.visible).toBe(true)
  })

  it('renders the current chord at full opacity and the next two previews at 60% and 30%', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'
    mockStoreState.learnV3.fingerNumbers = {
      'note-1': 1,
      'note-2': 2,
      'note-3': 3,
    }

    const renderer = createTestRenderer()
    ;(renderer as any).updateNoteByNoteLayer()

    const graphics = getGraphicChildren((renderer as any).layers.noteByNote)
    expect(graphics.map((graphic) => graphic.alpha)).toEqual([1, 0.6, 0.3])

    const labels = getTextChildren((renderer as any).layers.noteByNote).map((label) => label.text)
    expect(labels).toContain('C4 1')
    expect(labels).toContain('E4 2')
    expect(labels).toContain('G4 3')
  })

  it('triggerChordCorrect animates the current chord with fade and downward translation', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    const ticker = (renderer as any).app.ticker as MockTicker
    ;(renderer as any).updateNoteByNoteLayer()

    const entry = (renderer as any).noteByNoteEntries[0]
    renderer.triggerChordCorrect(['note-1'])

    ticker.advance(75)
    expect(entry.graphic.alpha).toBeLessThan(1)
    expect(entry.label.y).toBeGreaterThan(entry.baseY)

    ticker.advance(75)
    expect(entry.graphic.alpha).toBe(0)
    expect(entry.label.y).toBe(entry.baseY + 20)
  })

  it('triggerKeyFlash flashes the key red and then restores the original color', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true

    const renderer = createTestRenderer()
    const ticker = (renderer as any).app.ticker as MockTicker
    ;(renderer as any).keyboardPool.init()

    const keyEntry = (renderer as any).keyboardPool.getEntries().find((entry: { pitch: number }) => entry.pitch === 60)
    expect(keyEntry).toBeTruthy()

    renderer.triggerKeyFlash(60)

    const initialRedCall = keyEntry.graphic.beginFill.mock.calls.find(
      (call: [number]) => call[0] === 0xff3333,
    )
    expect(initialRedCall).toBeTruthy()

    ticker.advance(200)

    const lastCall = keyEntry.graphic.beginFill.mock.calls.at(-1)
    expect(lastCall?.[0]).not.toBe(0xff3333)
  })

  it('destroy() sets isInitialized to false', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    expect((renderer as any).isInitialized).toBe(true)

    renderer.destroy()

    expect((renderer as any).isInitialized).toBe(false)
    expect(mockEffectsDestroy).toHaveBeenCalledTimes(1)
  })

  it('init() after destroy() succeeds without crashing', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    renderer.destroy()

    await expect(renderer.init(canvas)).resolves.toBeUndefined()
    expect((renderer as any).isInitialized).toBe(true)
    expect(mockEffectsReset).toHaveBeenCalledTimes(2)
  })
})

function createTestRenderer() {
  const renderer = new Renderer()
  const app = {
    render: vi.fn(),
    screen: {
      height: 600,
      width: 800,
    },
    stage: new PIXI.Container(),
    ticker: new MockTicker(),
    view: { style: {} },
  }

  ;(renderer as any).app = app
  ;(renderer as any).layers = {
    background: new PIXI.Container(),
    hitLine: new PIXI.Container(),
    keyboard: new PIXI.Container(),
    keyboardGlow: new PIXI.Container(),
    laneLines: new PIXI.Container(),
    noteByNote: new PIXI.Container(),
    notes: new PIXI.Container(),
    overlay: new PIXI.Container(),
  }
  ;(renderer as any).isInitialized = true
  ;(renderer as any).keyLabelsDirty = false

  return renderer
}

class MockTicker {
  elapsedMS = 0
  started = false
  private callbacks = new Set<(ticker: MockTicker) => void>()

  add(callback: (ticker: MockTicker) => void) {
    this.callbacks.add(callback)
  }

  remove(callback: (ticker: MockTicker) => void) {
    this.callbacks.delete(callback)
  }

  start() {
    this.started = true
  }

  stop() {
    this.started = false
  }

  advance(elapsedMS: number) {
    this.elapsedMS = elapsedMS
    for (const callback of [...this.callbacks]) {
      callback(this)
    }
  }
}

function getTextChildren(container: { children: unknown[] }) {
  return container.children.filter((child): child is { text: string; y: number; alpha: number } => (
    typeof child === 'object' &&
    child != null &&
    'text' in child
  ))
}

function getGraphicChildren(container: { children: unknown[] }) {
  return container.children.filter((child): child is { alpha: number } => (
    typeof child === 'object' &&
    child != null &&
    'drawRect' in child
  ))
}

function createIndexedNote(id: string, pitch: number, startTick: number) {
  return {
    note: {
      endTick: startTick + 120,
      id,
      pitch,
      startTick,
      velocity: 100,
      visualEndTick: startTick + 120,
    },
    trackId: 'track-1',
    trackIndex: 0,
  }
}

function createProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 960,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          {
            endTick: 120,
            id: 'note-1',
            pitch: 60,
            startTick: 0,
            velocity: 100,
            visualEndTick: 120,
          },
          {
            endTick: 360,
            id: 'note-2',
            pitch: 64,
            startTick: 240,
            velocity: 100,
            visualEndTick: 360,
          },
          {
            endTick: 600,
            id: 'note-3',
            pitch: 67,
            startTick: 480,
            velocity: 100,
            visualEndTick: 600,
          },
        ],
      },
    ],
  }
}

function resetMockState() {
  Object.assign(mockStoreState, createMockState())
  mockStoreState.learnV3 = {
    ...createMockState().learnV3,
    fingerNumbers: {},
    midi: { ...createMockState().learnV3.midi },
    sessionConfig: { ...createMockState().learnV3.sessionConfig },
    stats: { ...createMockState().learnV3.stats },
  }
  mockStoreState.effectsEnabled = { ...createMockState().effectsEnabled }
  mockStoreState.selectedNoteIds = new Set()
}

function createMockState() {
  return {
    backgroundColor: '#000000',
    bloomEnabled: true,
    bloomRadius: 2,
    bloomStrength: 20,
    colorMode: 'split',
    currentTick: 0,
    effectsEnabled: {
      innerGlow: false,
      layeredGlow: false,
    },
    gradientBottomColorLeft: '#77a3ca',
    gradientBottomColorLeftBlack: '#4b75af',
    gradientBottomColorRight: '#9ee65a',
    gradientBottomColorRightBlack: '#86c04c',
    gradientTopColor: '#ffffff',
    hoveredNoteId: null,
    isPlaying: false,
    isProjectLoaded: true,
    keyGlowEnabled: true,
    keyGlowIntensity: 60,
    laneOpacity: 40,
    leftHandColor: '#77a3ca',
    learnV3: {
      currentChordIndex: 0,
      fingerNumbers: {} as Record<string, number>,
      isActive: false,
      midi: {
        available: false,
        connectedDeviceId: null,
        connectionStatus: 'disconnected',
        devices: [],
      },
      selectedSongId: null,
      sessionConfig: {
        hand: 'both',
        mode: null,
        tempoMultiplier: 1,
      },
      sessionState: 'idle',
      stats: {
        bestStreak: 0,
        correct: 0,
        missed: 0,
        streak: 0,
        wrong: 0,
      },
    },
    noteGradientDirection: 'horizontal',
    noteLabelColor: '#ffffff',
    noteLabelFormat: 'nameOctave',
    noteLabelSize: 11,
    noteLabelsOnKeys: false,
    noteLabelsOnNotes: false,
    noteStyle: 'solid',
    panX: 0,
    panY: 0,
    particleCount: 10,
    particleSize: 50,
    particleTrails: true,
    particlesEnabled: true,
    pitchClassColors: {},
    precomputedTempoMap: {
      segments: [
        {
          bpm: 120,
          endTick: Number.POSITIVE_INFINITY,
          microsecondsPerBeat: 500000,
          startSeconds: 0,
          startTick: 0,
          ticksPerSecond: 960,
        },
      ],
    },
    projectData: null as ReturnType<typeof createProjectData> | null,
    renderScale: 1,
    rightHandColor: '#9ee65a',
    selectedNoteIds: new Set<string>(),
    showBloom: true,
    showEffects: true,
    showParticles: true,
    splitPitch: 60,
    trackColors: {} as Record<string, string>,
    trackMuted: {} as Record<string, boolean>,
    trackSoloed: {} as Record<string, boolean>,
    velocityHighColor: '#f7674f',
    velocityLowColor: '#4f8ef7',
    viewportHeight: 600,
    viewportWidth: 800,
    worldZoom: 1,
  }
}
