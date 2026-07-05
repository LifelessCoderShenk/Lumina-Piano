import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as PIXI from 'pixi.js'
import { getKeyboardLayoutMetrics } from './layoutConstants'

const mockNoteRect = vi.hoisted(() => ({
  value: { h: 48, w: 24, x: 120, y: 80 },
}))

const mockStoreState = vi.hoisted(() => createMockState())
const mockSpatialGetTotalNoteCount = vi.hoisted(() => vi.fn(() => 0))
const mockSpatialGetNotesInRegion = vi.hoisted(() => vi.fn(() => []))
const mockStoreListeners = vi.hoisted(() => [] as Array<(state: ReturnType<typeof createMockState>, previousState: ReturnType<typeof createMockState>) => void>)
const mockSubscribeToStore = vi.hoisted(() => vi.fn((listener: (state: ReturnType<typeof createMockState>, previousState: ReturnType<typeof createMockState>) => void) => {
  mockStoreListeners.push(listener)
  return () => {
    const index = mockStoreListeners.indexOf(listener)
    if (index >= 0) {
      mockStoreListeners.splice(index, 1)
    }
  }
}))

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
    filters: unknown[] = []
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

  class MockBlurFilter {
    strength: number

    constructor(strength = 8) {
      this.strength = strength
    }
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
    filters: {
      BlurFilter: MockBlurFilter,
    },
  }
})

vi.mock('../store/store', () => ({
  getAppState: () => mockStoreState,
  subscribeToStore: mockSubscribeToStore,
}))

vi.mock('../camera/CameraSystem', () => ({
  cameraSystem: {
    isInitialized: vi.fn(() => true),
    setViewportSize: vi.fn(),
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
    mockSubscribeToStore.mockClear()
    mockStoreListeners.length = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(16)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('renders the current chord with as many previews as fit to the top of the canvas', () => {
    mockStoreState.projectData = createManyChordProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'
    mockStoreState.learnV3.fingerNumbers = {
      'note-1': 1,
    }

    const renderer = createTestRenderer()
    ;(renderer as any).updateNoteByNoteLayer()

    const graphics = getGraphicChildren((renderer as any).layers.noteByNote)
    expect(graphics[0].alpha).toBe(1)
    expect((renderer as any).noteByNotePreviewEntries.length).toBeGreaterThanOrEqual(3)

    const currentEntry = (renderer as any).noteByNoteEntries[0]
    const previewEntries = (renderer as any).noteByNotePreviewEntries
    const { keyboardY } = getKeyboardLayoutMetrics((renderer as any).app.screen.height)
    expect(currentEntry.baseY + 60).toBe(keyboardY)
    expect(previewEntries[0].graphic.alpha).toBeCloseTo(0.69)
    expect(previewEntries[1].graphic.alpha).toBeCloseTo(0.63)
    expect(previewEntries[2].graphic.alpha).toBeCloseTo(0.57)
    expect(previewEntries.at(-1)?.graphic.alpha ?? 0).toBeGreaterThanOrEqual(0.08)
    expect(previewEntries[0].baseY).toBeLessThan(currentEntry.baseY)
    expect(previewEntries[1].baseY).toBeLessThan(previewEntries[0].baseY)
    expect(previewEntries[2].baseY).toBeLessThan(previewEntries[1].baseY)
    expect(previewEntries.every((entry: { baseY: number }) => entry.baseY >= 0)).toBe(true)

    const labels = getTextChildren((renderer as any).layers.noteByNote).map((label) => label.text)
    expect(labels).toEqual(['C4', '1'])
  })

  it('shows only the remaining previews when near the end of the song', () => {
    mockStoreState.projectData = createFourChordProjectData()
    mockStoreState.learnV3.currentChordIndex = 2
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    ;(renderer as any).updateNoteByNoteLayer()

    const graphics = getGraphicChildren((renderer as any).layers.noteByNote)
    expect(graphics.map((graphic) => graphic.alpha)).toEqual([1, 0.69])
    expect((renderer as any).noteByNotePreviewEntries).toHaveLength(1)
  })

  it('scales the initial rect height from note duration and clamps very short notes to 60px', () => {
    mockStoreState.projectData = createLongDurationProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    ;(renderer as any).updateNoteByNoteLayer()

    const longEntry = (renderer as any).noteByNoteEntries[0]
    expect(longEntry.baseHeight).toBe(150)

    mockStoreState.projectData = createShortDurationProjectData()
    ;(renderer as any).updateNoteByNoteLayer()

    const shortEntry = (renderer as any).noteByNoteEntries[0]
    expect(shortEntry.baseHeight).toBe(60)
  })

  it('applies the hand filter when building the note-by-note chord groups', () => {
    mockStoreState.projectData = createMixedHandProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.hand = 'left'
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    ;(renderer as any).updateNoteByNoteLayer()

    const graphics = getGraphicChildren((renderer as any).layers.noteByNote)
    expect(graphics).toHaveLength(2)

    const labels = getTextChildren((renderer as any).layers.noteByNote).map((label) => label.text)
    expect(labels).toEqual(['C3'])
  })

  it('renders nothing when the chord list is empty', () => {
    mockStoreState.projectData = createRightHandOnlyProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.hand = 'left'
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    expect(() => {
      ;(renderer as any).updateNoteByNoteLayer()
    }).not.toThrow()

    const graphics = getGraphicChildren((renderer as any).layers.noteByNote)
    const labels = getTextChildren((renderer as any).layers.noteByNote)
    expect(graphics).toHaveLength(0)
    expect(labels).toHaveLength(0)
  })

  it('empties the falling note pool in noteByNote mode', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'
    mockSpatialGetNotesInRegion.mockReturnValue([createIndexedNote('note-1', 60, 0)])
    mockSpatialGetTotalNoteCount.mockReturnValue(1)

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

    expect(getGraphicChildren((renderer as any).layers.notes)).toHaveLength(1)

    const visibleNotes = (renderer as any).updateNotes(0)
    expect(visibleNotes).toEqual([])
    expect(getGraphicChildren((renderer as any).layers.notes)).toHaveLength(0)
  })

  it('startNoteDrain animates the matching chord rect downward over its duration', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const performanceSpy = vi.spyOn(performance, 'now')
    performanceSpy.mockReturnValue(0)

    const renderer = createTestRenderer()
    const ticker = (renderer as any).app.ticker as MockTicker
    ;(renderer as any).updateNoteByNoteLayer()

    const entry = (renderer as any).noteByNoteEntries[0]
    const initialLabelY = entry.noteLabel.y

    renderer.startNoteDrain(60, 250, 0)
    performanceSpy.mockReturnValue(125)
    ticker.advance(16)

    expect(entry.noteLabel.y).toBeGreaterThan(initialLabelY)
    expect((renderer as any).noteDrainAnimations.size).toBe(1)
    performanceSpy.mockRestore()
  })

  it('cancelNoteDrain restores the rect to its full height', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const performanceSpy = vi.spyOn(performance, 'now')
    performanceSpy.mockReturnValue(0)

    const renderer = createTestRenderer()
    const ticker = (renderer as any).app.ticker as MockTicker
    ;(renderer as any).updateNoteByNoteLayer()

    const entry = (renderer as any).noteByNoteEntries[0]
    const fullHeightLabelY = entry.baseY + (entry.baseHeight / 2)

    renderer.startNoteDrain(60, 250, 0)
    performanceSpy.mockReturnValue(125)
    ticker.advance(16)

    expect(entry.noteLabel.y).toBeGreaterThan(fullHeightLabelY)

    renderer.cancelNoteDrain(60)

    expect(entry.noteLabel.y).toBe(fullHeightLabelY)
    expect((renderer as any).noteDrainAnimations.size).toBe(0)
    performanceSpy.mockRestore()
  })

  it('triggerChordCorrect animates the current chord with fade and downward translation', () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    const ticker = (renderer as any).app.ticker as MockTicker
    ;(renderer as any).updateNoteByNoteLayer()
    const rebuildSpy = vi.spyOn(renderer as any, 'rebuildNoteByNoteLayer')
    rebuildSpy.mockClear()

    const entry = (renderer as any).noteByNoteEntries[0]
    renderer.triggerChordCorrect(['note-1'])

    ticker.advance(75)
    expect(entry.graphic.alpha).toBeLessThan(1)
    expect(entry.noteLabel.y).toBeGreaterThan(entry.baseY + (entry.baseHeight / 2))

    ticker.advance(75)
    expect((renderer as any).chordCorrectAnimation).toBeNull()
    expect(rebuildSpy).not.toHaveBeenCalled()
  })

  it('triggerChordCorrect shifts preview chords downward and rebuilds after the shift completes', () => {
    mockStoreState.projectData = createFourChordProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = createTestRenderer()
    const ticker = (renderer as any).app.ticker as MockTicker
    ;(renderer as any).updateNoteByNoteLayer()
    const rebuildSpy = vi.spyOn(renderer as any, 'rebuildNoteByNoteLayer')
    rebuildSpy.mockClear()

    const previewEntry = (renderer as any).noteByNotePreviewEntries[0]
    renderer.triggerChordCorrect(['note-1'])
    ;(renderer as any).pendingNoteByNoteRebuild = true

    ticker.advance(150)
    expect((renderer as any).chordCorrectAnimation).toBeNull()
    expect((renderer as any).previewShiftAnimation).not.toBeNull()
    expect(previewEntry.graphic.y).toBe(0)

    ticker.advance(60)
    expect(previewEntry.graphic.y).toBeGreaterThan(0)
    expect(rebuildSpy).not.toHaveBeenCalled()

    ticker.advance(60)
    expect((renderer as any).previewShiftAnimation).toBeNull()
    expect(rebuildSpy).toHaveBeenCalled()
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

    await renderer.destroy()

    expect((renderer as any).isInitialized).toBe(false)
  })

  it('init() after destroy() succeeds without crashing', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    await renderer.destroy()

    await expect(renderer.init(canvas)).resolves.toBeUndefined()
    expect((renderer as any).isInitialized).toBe(true)
  })

  it('currentChordIndex change triggers NoteByNoteLayer rebuild', async () => {
    mockStoreState.projectData = createProjectData()
    mockStoreState.learnV3.isActive = true
    mockStoreState.learnV3.sessionConfig.mode = 'noteByNote'

    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    const rebuildSpy = vi.spyOn(renderer as any, 'rebuildNoteByNoteLayer')
    rebuildSpy.mockClear()

    const previousState = structuredClone(mockStoreState)
    mockStoreState.learnV3.currentChordIndex = 1

    for (const listener of mockStoreListeners) {
      listener(mockStoreState as never, previousState as never)
    }

    expect(rebuildSpy).toHaveBeenCalled()

    await renderer.destroy()
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

function createFourChordProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 1200,
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
          {
            endTick: 840,
            id: 'note-4',
            pitch: 69,
            startTick: 720,
            velocity: 100,
            visualEndTick: 840,
          },
        ],
      },
    ],
  }
}

function createManyChordProjectData() {
  const notes = Array.from({ length: 16 }, (_, index) => ({
    endTick: (index * 240) + 120,
    id: `note-${index + 1}`,
    pitch: 60 + (index % 12),
    startTick: index * 240,
    velocity: 100,
    visualEndTick: (index * 240) + 120,
  }))

  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 4000,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes,
      },
    ],
  }
}

function createMixedHandProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 720,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          {
            endTick: 120,
            id: 'left-note-1',
            pitch: 48,
            startTick: 0,
            velocity: 100,
            visualEndTick: 120,
          },
          {
            endTick: 120,
            id: 'right-note-1',
            pitch: 60,
            startTick: 0,
            velocity: 100,
            visualEndTick: 120,
          },
          {
            endTick: 360,
            id: 'left-note-2',
            pitch: 50,
            startTick: 240,
            velocity: 100,
            visualEndTick: 360,
          },
        ],
      },
    ],
  }
}

function createRightHandOnlyProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 480,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          {
            endTick: 120,
            id: 'right-note-1',
            pitch: 60,
            startTick: 0,
            velocity: 100,
            visualEndTick: 120,
          },
        ],
      },
    ],
  }
}

function createLongDurationProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 1440,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          {
            endTick: 1200,
            id: 'long-note-1',
            pitch: 60,
            startTick: 0,
            velocity: 100,
            visualEndTick: 1200,
          },
        ],
      },
    ],
  }
}

function createShortDurationProjectData() {
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: 40,
    tracks: [
      {
        channel: 0,
        id: 'track-1',
        name: 'Track 1',
        notes: [
          {
            endTick: 10,
            id: 'short-note-1',
            pitch: 60,
            startTick: 0,
            velocity: 100,
            visualEndTick: 10,
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
  mockStoreState.learnVisuals = { ...createMockState().learnVisuals }
  mockStoreState.selectedNoteIds = new Set()
}

function createMockState() {
  return {
    backgroundColor: '#000000',
    colorMode: 'split',
    currentTick: 0,
    gradientBottomColorLeft: '#77a3ca',
    gradientBottomColorLeftBlack: '#4b75af',
    gradientBottomColorRight: '#9ee65a',
    gradientBottomColorRightBlack: '#86c04c',
    gradientTopColor: '#ffffff',
    hoveredNoteId: null,
    isPlaying: false,
    isProjectLoaded: true,
    laneOpacity: 40,
    leftHandColor: '#77a3ca',
    learnVisuals: {
      fingerNumbersEnabled: true,
      glowEnabled: false,
      leftHandColor: '#4ade80',
      noteColor: 'perHand',
      noteLabelsEnabled: true,
      noteOpacity: 1,
      rightHandColor: '#60a5fa',
    },
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
