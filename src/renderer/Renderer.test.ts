import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetStore, useAppStore } from '../store/store'
import { getKeyboardLayoutMetrics } from './layoutConstants'
import { getBlackKeyWidth, getWhiteKeyBounds } from './pianoMath'

const mockSpatialGetNotesInRegion = vi.hoisted(() => vi.fn(() => []))
const mockSpatialGetTotalNoteCount = vi.hoisted(() => vi.fn(() => 0))
const mockCreatedGraphics = vi.hoisted(() => [] as unknown[])

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

    constructor() {
      mockCreatedGraphics.push(this)
    }
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

  class MockTicker {
    elapsedMS = 0
    started = false
    private callbacks = new Set<(ticker: MockTicker) => void>()
    add = vi.fn((callback: (ticker: MockTicker) => void) => {
      this.callbacks.add(callback)
    })
    remove = vi.fn((callback: (ticker: MockTicker) => void) => {
      this.callbacks.delete(callback)
    })
    start = vi.fn(() => {
      this.started = true
    })
    stop = vi.fn(() => {
      this.started = false
    })

    advance(elapsedMS = 16.6667) {
      this.elapsedMS = elapsedMS
      for (const callback of [...this.callbacks]) {
        callback(this)
      }
    }
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
    filters: {
      BlurFilter: MockBlurFilter,
    },
  }
})

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
  getNoteScreenRect: vi.fn(() => ({ h: 48, w: 24, x: 120, y: 80 })),
  getVisibleTickWindow: vi.fn(() => ({ maxTick: 1000, minTick: 0 })),
}))

const { Renderer, pitchToKeyX } = await import('./Renderer')
const { getNoteScreenRect } = await import('./noteMotion')

function setFullscreenElement(element: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: element,
  })
}

describe('Renderer playback sync', () => {
  beforeEach(() => {
    resetStore()
    setFullscreenElement(null)
    mockCreatedGraphics.length = 0
    mockSpatialGetNotesInRegion.mockReset()
    mockSpatialGetNotesInRegion.mockReturnValue([])
    mockSpatialGetTotalNoteCount.mockReset()
    mockSpatialGetTotalNoteCount.mockReturnValue(0)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(16)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    resetStore()
    setFullscreenElement(null)
    vi.unstubAllGlobals()
  })

  it('forceResume() restarts rendering when playback is active', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    useAppStore.getState().setIsPlaying(true)
    ;(renderer as unknown as { isRunning: boolean }).isRunning = false

    renderer.forceResume()

    expect((renderer as unknown as { isRunning: boolean }).isRunning).toBe(true)

    await renderer.destroy()
  })

  it('render loop guard returns early when isInitialized is false', () => {
    const renderer = new Renderer()
    const renderSpy = vi.spyOn(renderer as unknown as { renderFrame: (currentTick: number) => void }, 'renderFrame')
    const startSpy = vi.spyOn(renderer as unknown as { startRenderLoop: () => void }, 'startRenderLoop')

    useAppStore.getState().setIsPlaying(true)
    ;(renderer as unknown as { handleTick: (currentTick: number) => void }).handleTick(0)

    expect(startSpy).not.toHaveBeenCalled()
    expect(renderSpy).not.toHaveBeenCalled()
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

    await renderer.destroy()
  })

  it('destroy() sets isInitialized=false and clears renderer scene references', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)

    await renderer.destroy()

    expect((renderer as unknown as { isInitialized: boolean }).isInitialized).toBe(false)
    expect((renderer as unknown as { layers: unknown | null }).layers).toBeNull()
    expect((renderer as unknown as { backgroundGraphic: unknown | null }).backgroundGraphic).toBeNull()
    expect((renderer as unknown as { app: unknown | null }).app).toBeNull()
    expect((renderer as unknown as { subscriptions: Array<() => void> }).subscriptions).toHaveLength(0)
  })

  it('unsubscribes all store subscriptions on destroy', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)

    const rebuildSpy = vi.spyOn(renderer as unknown as { rebuildNoteByNoteLayer: () => void }, 'rebuildNoteByNoteLayer')
    const startSpy = vi.spyOn(renderer as unknown as { startRenderLoop: () => void }, 'startRenderLoop')
    rebuildSpy.mockClear()
    startSpy.mockClear()

    await renderer.destroy()

    expect(() => {
      useAppStore.getState().setIsPlaying(true)
      useAppStore.getState().setLearnActive(true)
      useAppStore.getState().setSessionConfig({ mode: 'noteByNote' })
      useAppStore.getState().setCurrentChordIndex(1)
    }).not.toThrow()

    expect(startSpy).not.toHaveBeenCalled()
    expect(rebuildSpy).not.toHaveBeenCalled()
    expect((renderer as unknown as { subscriptions: Array<() => void> }).subscriptions).toHaveLength(0)
  })

  it('rebuilds a fresh scene after destroy() and re-init()', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    const firstApp = (renderer as unknown as { app: { stage: { children: unknown[] } } | null }).app
    expect(firstApp?.stage.children.length).toBeGreaterThan(0)

    await renderer.destroy()
    await renderer.init(canvas)

    const nextApp = (renderer as unknown as { app: { stage: { children: unknown[] } } | null }).app
    expect(nextApp).not.toBeNull()
    expect(nextApp).not.toBe(firstApp)
    expect(nextApp?.stage.children.length).toBeGreaterThan(0)

    await renderer.destroy()
  })

  it('renders create mode notes as a single flat blue regardless of pitch with no glow layers', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    const leftNote = createIndexedNote('left-note', 59)
    const rightNote = createIndexedNote('right-note', 60)

    loadProjectWithNotes([leftNote.note, rightNote.note])
    mockSpatialGetTotalNoteCount.mockReturnValue(2)
    mockSpatialGetNotesInRegion.mockReturnValue([leftNote, rightNote])

    await renderer.init(canvas)
    ;(renderer as unknown as { updateNotes: (currentTick: number) => unknown[] }).updateNotes(0)

    const layers = (renderer as unknown as {
      layers: { notes: { children: Array<{ beginFill?: { mock: { calls: Array<[number, number]> } } }> } }
    }).layers
    const graphics = layers.notes.children.filter((child) => 'beginFill' in child)

    expect(graphics).toHaveLength(2)
    expect(graphics[0].beginFill?.mock.calls.at(-1)).toEqual([0x2e65a2, 1])
    expect(graphics[1].beginFill?.mock.calls.at(-1)).toEqual([0x2e65a2, 1])

    await renderer.destroy()
  })

  it('always renders create mode falling note labels regardless of note height', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    const note = createIndexedNote('tiny-note', 60)

    loadProjectWithNotes([note.note])
    mockSpatialGetTotalNoteCount.mockReturnValue(1)
    mockSpatialGetNotesInRegion.mockReturnValue([note])
    vi.mocked(getNoteScreenRect).mockReturnValueOnce({ h: 6, w: 6, x: 120, y: 80 })

    await renderer.init(canvas)
    ;(renderer as unknown as { updateNotes: (currentTick: number) => unknown[] }).updateNotes(0)

    const noteTexts = (renderer as unknown as {
      layers: { notes: { children: Array<{ text?: string; visible?: boolean; style?: { fill?: number } }> } }
    }).layers.notes.children.filter((child) => 'text' in child)

    expect(noteTexts).toHaveLength(1)
    expect(noteTexts[0].text).toBe('C4')
    expect(noteTexts[0].visible).toBe(true)
    expect(noteTexts[0].style?.fill).toBe(0xffffff)

    await renderer.destroy()
  })

  it('always renders create mode keyboard labels on white keys in black text', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    useAppStore.getState().setNoteLabelsOnKeys(false)
    ;(renderer as unknown as { keyLabelsDirty: boolean }).keyLabelsDirty = true
    ;(renderer as unknown as { updateKeyboard: (currentTick: number) => void }).updateKeyboard(0)

    const keyboardTexts = (renderer as unknown as {
      layers: { keyboard: { children: Array<{ text?: string; style?: { fill?: number } }> } }
    }).layers.keyboard.children.filter((child) => 'text' in child)

    expect(keyboardTexts.length).toBeGreaterThan(0)
    expect(keyboardTexts[0].style?.fill).toBe(0x000000)
    expect(keyboardTexts.some((child) => child.text === 'C')).toBe(true)

    await renderer.destroy()
  })

  it('increases create mode keyboard height by 1.5x in fullscreen without changing key widths', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    setFullscreenElement(document.documentElement)
    await renderer.init(canvas)

    const keyboardEntries = (renderer as unknown as {
      keyboardPool: {
        getEntries: () => Array<{
          isBlack: boolean
          pitch: number
          graphic: { drawRect: { mockClear: () => void; mock: { calls: Array<[number, number, number, number]> } } }
        }>
      }
    }).keyboardPool.getEntries()
    for (const entry of keyboardEntries) {
      entry.graphic.drawRect.mockClear()
    }
    ;(renderer as unknown as { updateKeyboard: (currentTick: number) => void; keyLabelsDirty: boolean }).keyLabelsDirty = true
    ;(renderer as unknown as { updateKeyboard: (currentTick: number) => void }).updateKeyboard(0)

    const app = (renderer as unknown as { app: { screen: { width: number; height: number } } }).app
    const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const expectedWhiteKeyBounds = getWhiteKeyBounds(21, app.screen.width)
    const expectedBlackKeyWidth = Math.max(1, Math.round(getBlackKeyWidth(app.screen.width)))
    const expectedBlackKeyHeight = Math.max(1, Math.round(keyboardHeight * 0.6))
    const firstWhiteEntry = keyboardEntries.find((entry) => !entry.isBlack)
    const firstBlackEntry = keyboardEntries.find((entry) => entry.isBlack)
    const keyboardLabels = (renderer as unknown as {
      layers: { keyboard: { children: Array<{ text?: string; x?: number }> } }
    }).layers.keyboard.children.filter((child) => 'text' in child)
    const firstWhiteRect = firstWhiteEntry?.graphic.drawRect.mock.calls[0]
    const firstBlackRect = firstBlackEntry?.graphic.drawRect.mock.calls[0]

    expect(keyboardHeight).toBe(405)
    expect(keyboardY).toBe(app.screen.height - keyboardHeight)
    expect(firstWhiteRect).toBeDefined()
    expect(firstBlackRect).toBeDefined()
    expect(firstWhiteRect?.[1]).toBe(keyboardY)
    expect(firstWhiteRect?.[2]).toBe(Math.max(1, expectedWhiteKeyBounds.width - 1))
    expect(firstWhiteRect?.[3]).toBe(Math.max(1, keyboardHeight - 4))
    expect(firstBlackRect?.[1]).toBe(keyboardY + 1)
    expect(firstBlackRect?.[2]).toBe(expectedBlackKeyWidth)
    expect(firstBlackRect?.[3]).toBe(Math.max(1, expectedBlackKeyHeight - 1))
    expect(keyboardLabels[0]?.x).toBe(expectedWhiteKeyBounds.x + (expectedWhiteKeyBounds.width / 2))

    await renderer.destroy()
  })

  it('renders create mode lane lines only at C note positions with the new thin gray style', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)
    const app = (renderer as unknown as { app: { screen: { height: number; width: number } } }).app

    const laneLineGraphic = (renderer as unknown as {
      laneLineGraphic: {
        lineStyle: { mock: { calls: Array<[number, number, number]> } }
        lineTo: { mock: { calls: Array<[number, number]> } }
        moveTo: { mock: { calls: Array<[number, number]> } }
      }
    }).laneLineGraphic

    expect(laneLineGraphic.lineStyle.mock.calls.at(-1)).toEqual([1, 0x444444, 0.4])

    const expectedCPitches = [24, 36, 48, 60, 72, 84, 96, 108]
    const expectedXPositions = expectedCPitches.map((pitch) => pitchToKeyX(pitch, app.screen.width))

    expect(laneLineGraphic.moveTo.mock.calls).toHaveLength(expectedCPitches.length)
    expect(laneLineGraphic.lineTo.mock.calls).toHaveLength(expectedCPitches.length)
    expect(laneLineGraphic.moveTo.mock.calls.map((call) => call[0])).toEqual(expectedXPositions)
    expect(laneLineGraphic.lineTo.mock.calls.map((call) => call[0])).toEqual(expectedXPositions)
    expect(laneLineGraphic.lineTo.mock.calls.every((call) => call[1] === app.screen.height)).toBe(true)

    await renderer.destroy()
  })

  it('creates the boundary line graphic once in init and keeps animating it on the empty canvas', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)

    const initialGraphicsCount = mockCreatedGraphics.length
    const hitLineGraphic = (renderer as unknown as {
      app: { screen: { height: number } }
      hitLineGraphic: {
        clear: { mock: { calls: unknown[] } }
        lineStyle: { mock: { calls: Array<[number, number, number]> } }
        moveTo: { mock: { calls: Array<[number, number]> } }
      }
      boundaryWaveTime: number
    }).hitLineGraphic
    const rendererInternals = renderer as unknown as {
      app: { render: { mock: { calls: unknown[] } }; screen: { height: number }; ticker: { advance: (elapsedMs?: number) => void; started: boolean } }
      boundaryWaveTime: number
      hitLineGraphic: {
        clear: { mock: { calls: unknown[] } }
        lineStyle: { mock: { calls: Array<[number, number, number]> } }
        moveTo: { mock: { calls: Array<[number, number]> } }
      }
    }
    const app = rendererInternals.app
    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const clearCountBeforeAdvance = hitLineGraphic.clear.mock.calls.length
    const renderCountBeforeAdvance = app.render.mock.calls.length
    const boundaryWaveTimeBeforeAdvance = rendererInternals.boundaryWaveTime

    expect(app.ticker.started).toBe(true)
    expect(hitLineGraphic.lineStyle.mock.calls.slice(-3)).toEqual([
      [16, 0x1a3a6e, 0.15],
      [6, 0x4a9eff, 0.35],
      [2, 0x7ec8ff, 1],
    ])
    expect(hitLineGraphic.moveTo.mock.calls.at(-3)?.[1]).toBe(keyboardY)

    app.ticker.advance()

    expect((renderer as unknown as { hitLineGraphic: unknown }).hitLineGraphic).toBe(hitLineGraphic)
    expect(mockCreatedGraphics.length).toBe(initialGraphicsCount)
    expect(rendererInternals.boundaryWaveTime).toBeGreaterThan(boundaryWaveTimeBeforeAdvance)
    expect(hitLineGraphic.clear.mock.calls.length).toBeGreaterThan(clearCountBeforeAdvance)
    expect(app.render.mock.calls.length).toBeGreaterThan(renderCountBeforeAdvance)

    await renderer.destroy()
  })

  it('keeps learn mode note rendering on the learn visuals path', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    const note = createIndexedNote('learn-note', 60)

    loadProjectWithNotes([note.note])
    useAppStore.getState().setLearnActive(true)
    useAppStore.getState().setSessionConfig({ mode: 'listen' })
    useAppStore.getState().setNoteStyle('solid')
    useAppStore.getState().setLearnVisuals({
      glowEnabled: false,
      leftHandColor: '#4ade80',
      noteColor: 'custom',
      noteLabelsEnabled: false,
      noteOpacity: 0.6,
      rightHandColor: '#60a5fa',
    })
    mockSpatialGetTotalNoteCount.mockReturnValue(1)
    mockSpatialGetNotesInRegion.mockReturnValue([note])

    await renderer.init(canvas)
    ;(renderer as unknown as { updateNotes: (currentTick: number) => unknown[] }).updateNotes(0)

    const layers = (renderer as unknown as {
      layers: { notes: { children: Array<{ beginFill?: { mock: { calls: Array<[number, number]> } } }> } }
    }).layers
    const graphics = layers.notes.children.filter((child) => 'beginFill' in child)
    const texts = layers.notes.children.filter((child) => 'text' in child)
    const laneLineGraphic = (renderer as unknown as {
      laneLineGraphic: { lineStyle: { mock: { calls: Array<[number, number, number]> } } }
    }).laneLineGraphic
    const hitLineGraphic = (renderer as unknown as {
      hitLineGraphic: { drawRect: { mock: { calls: Array<[number, number, number, number]> } } }
    }).hitLineGraphic

    expect(graphics).toHaveLength(1)
    expect(graphics[0].beginFill?.mock.calls.at(-1)?.[0]).not.toBe(0x60a5fa)
    expect(graphics[0].beginFill?.mock.calls.at(-1)?.[1]).toBe(0.6)
    expect(texts).toHaveLength(0)
    expect(laneLineGraphic.lineStyle.mock.calls.at(-1)?.[1]).toBe(0xffffff)
    expect(hitLineGraphic.drawRect.mock.calls.length).toBeGreaterThan(0)

    await renderer.destroy()
  })

  it('keeps learn mode keyboard sizing at the normal scale in fullscreen', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    useAppStore.getState().setLearnActive(true)
    useAppStore.getState().setSessionConfig({ mode: 'listen' })
    setFullscreenElement(document.documentElement)
    await renderer.init(canvas)

    const keyboardEntries = (renderer as unknown as {
      keyboardPool: {
        getEntries: () => Array<{
          isBlack: boolean
          graphic: { drawRect: { mockClear: () => void; mock: { calls: Array<[number, number, number, number]> } } }
        }>
      }
    }).keyboardPool.getEntries()
    for (const entry of keyboardEntries) {
      entry.graphic.drawRect.mockClear()
    }
    ;(renderer as unknown as { keyLabelsDirty: boolean }).keyLabelsDirty = true
    ;(renderer as unknown as { updateKeyboard: (currentTick: number) => void }).updateKeyboard(0)

    const app = (renderer as unknown as { app: { screen: { width: number; height: number } } }).app
    const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const expectedWhiteKeyBounds = getWhiteKeyBounds(21, app.screen.width)
    const firstWhiteEntry = keyboardEntries.find((entry) => !entry.isBlack)
    const firstWhiteRect = firstWhiteEntry?.graphic.drawRect.mock.calls[0]

    expect(keyboardHeight).toBe(270)
    expect(keyboardY).toBe(app.screen.height - keyboardHeight)
    expect(firstWhiteRect?.[1]).toBe(keyboardY)
    expect(firstWhiteRect?.[2]).toBe(Math.max(1, expectedWhiteKeyBounds.width - 1))
    expect(firstWhiteRect?.[3]).toBe(Math.max(1, keyboardHeight - 4))

    await renderer.destroy()
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

    await renderer.destroy()
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

    await renderer.destroy()
  })

  it('calling init() while destroy() is in progress waits for destroy to complete first', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    let resolveDestroy: (() => void) | null = null
    const destroyInternalSpy = vi
      .spyOn(renderer as unknown as { destroyInternal: () => Promise<void> }, 'destroyInternal')
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDestroy = resolve
          }),
      )

    await renderer.init(canvas)

    const destroyPromise = renderer.destroy()
    const initPromise = renderer.init(canvas)
    let initResolved = false
    void initPromise.then(() => {
      initResolved = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(destroyInternalSpy).toHaveBeenCalledTimes(1)
    expect(initResolved).toBe(false)

    resolveDestroy?.()

    await destroyPromise
    await initPromise

    expect((renderer as unknown as { isInitialized: boolean }).isInitialized).toBe(true)
    destroyInternalSpy.mockRestore()
    await renderer.destroy()
  })

  it('concurrent destroy() calls return the same promise and only destroy once', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')
    let resolveDestroy: (() => void) | null = null
    const destroyInternalSpy = vi
      .spyOn(renderer as unknown as { destroyInternal: () => Promise<void> }, 'destroyInternal')
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDestroy = resolve
          }),
      )

    await renderer.init(canvas)

    const destroyPromiseA = renderer.destroy()
    const destroyPromiseB = renderer.destroy()

    await Promise.resolve()
    await Promise.resolve()

    expect(destroyPromiseA).toBe(destroyPromiseB)
    expect(destroyInternalSpy).toHaveBeenCalledTimes(1)

    resolveDestroy?.()

    await destroyPromiseA

    destroyInternalSpy.mockRestore()
  })

  it('applies camera overlay horizontal offset and scale to the dedicated overlay container in camera mode', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)

    useAppStore.getState().setAppMode('createCamera')
    useAppStore.getState().setCameraOverlay({
      offsetX: 120,
      offsetY: 60,
      scale: 1.35,
    })

    const overlayContainer = (renderer as unknown as {
      overlayContainer: {
        scale?: { x?: number; y?: number }
        x: number
        y: number
      } | null
    }).overlayContainer

    expect(overlayContainer?.x).toBe(120)
    expect(overlayContainer?.y).toBe(0)
    expect(overlayContainer?.scale?.x).toBe(1.35)
    expect(overlayContainer?.scale?.y).toBe(1.35)

    await renderer.destroy()
  })

  it('resets camera overlay transform when leaving camera mode', async () => {
    const renderer = new Renderer()
    const canvas = document.createElement('canvas')

    await renderer.init(canvas)

    useAppStore.getState().setAppMode('createCamera')
    useAppStore.getState().setCameraOverlay({
      offsetX: 80,
      offsetY: 32,
      scale: 1.2,
    })
    useAppStore.getState().setAppMode('create')

    const overlayContainer = (renderer as unknown as {
      overlayContainer: {
        scale?: { x?: number; y?: number }
        x: number
        y: number
      } | null
    }).overlayContainer

    expect(overlayContainer?.x).toBe(0)
    expect(overlayContainer?.y).toBe(0)
    expect(overlayContainer?.scale?.x).toBe(1)
    expect(overlayContainer?.scale?.y).toBe(1)

    await renderer.destroy()
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
