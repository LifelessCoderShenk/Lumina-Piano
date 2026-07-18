import * as PIXI from 'pixi.js'

import { cameraSystem } from '../camera/CameraSystem'
import type { Track } from '../midi/types'
import { type PlaybackEventMap, playbackEngine } from '../playback/PlaybackEngine'
import { type IndexedNote, spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore, type CameraOverlaySettings } from '../store/store'
import { tickToSeconds } from '../tempo/tempoMap'
import { KeyboardPool, type KeyboardGraphic } from './KeyboardPool'
import { GradientTextureCache } from './GradientTextureCache'
import { getNoteLabel } from './labelUtils'
import { NotePool } from './NotePool'
import { SpritePool } from './SpritePool'
import { TextPool } from './TextPool'
import { RendererError } from './errors'
import {
  BLACK_KEY_ACTIVE_ALPHA,
  BLACK_KEY_BOTTOM_SHADOW_HEIGHT,
  BLACK_KEY_COLOR,
  BLACK_KEY_HIGHLIGHT_COLOR,
  BLACK_KEY_SHADOW_COLOR,
  HIT_LINE_HEIGHT,
  KEYBOARD_BACKING_COLOR,
  NOTE_MIN_HEIGHT,
  WHITE_KEY_ACTIVE_ALPHA,
  WHITE_KEY_BOTTOM_SHADOW_HEIGHT,
  WHITE_KEY_COLOR,
  WHITE_KEY_SEPARATOR_COLOR,
  WHITE_KEY_SEPARATOR_WIDTH,
  WHITE_KEY_SHADOW_COLOR,
  getKeyboardLayoutMetrics,
} from './layoutConstants'
import {
  brightenColor,
  hexToPixi,
  interpolateColor,
  pixiToHex,
  resolveCreateModeNoteColor,
  resolveNoteColor,
  resolveNoteGradientColors,
} from './colorUtils'
import { getNoteScreenRect, getVisibleTickWindow } from './noteMotion'
import { getNoteDurationMs } from './noteRendering'
import {
  PIANO_MAX_PITCH,
  PIANO_MIN_PITCH,
  PIANO_WHITE_KEY_COUNT,
  getBlackKeyWidth,
  getWhiteKeyBounds,
  getWhiteKeyIndex,
  getKeyAtScreenX,
  isBlackKey,
  pitchToKeyX,
} from './pianoMath'

const LANE_LINE_COLOR = 0xffffff
const CREATE_MODE_BACKGROUND_COLOR = 0x000000
const CREATE_MODE_LANE_LINE_COLOR = 0x444444
const CREATE_MODE_LANE_LINE_ALPHA = 0.4
const CREATE_MODE_BOUNDARY_OUTER_AURA_COLOR = 0x1a3a6e
const CREATE_MODE_BOUNDARY_MID_GLOW_COLOR = 0x4a9eff
const CREATE_MODE_BOUNDARY_CORE_COLOR = 0x7ec8ff
const CREATE_MODE_BOUNDARY_OUTER_AURA_THICKNESS = 16
const CREATE_MODE_BOUNDARY_MID_GLOW_THICKNESS = 6
const CREATE_MODE_BOUNDARY_CORE_THICKNESS = 2
const CREATE_MODE_BOUNDARY_OUTER_AURA_ALPHA = 0.15
const CREATE_MODE_BOUNDARY_MID_GLOW_ALPHA = 0.35
const CREATE_MODE_BOUNDARY_CORE_ALPHA = 1
const CREATE_MODE_BOUNDARY_WAVE_LENGTH = 300
const CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE = 1.5
const CREATE_MODE_BOUNDARY_WAVE_TIME_STEP = 0.02
const CREATE_MODE_BOUNDARY_SEGMENT_WIDTH = 12
const HIT_LINE_COLOR = 0x000000
const HIT_LINE_ALPHA = 0.6
const BLACK_KEY_HEIGHT_RATIO = 0.62
const KEY_CORNER_RADIUS = 3
const NOTE_CORNER_RADIUS = 4
const NOTE_ALPHA = 1
const NOTE_ACTIVE_BRIGHTNESS = 1.3
const SELECTED_NOTE_FILL_BRIGHTNESS = 1.2
const HOVERED_NOTE_FILL_BRIGHTNESS = 1.1
const REFERENCE_WIDTH = 1920
const REFERENCE_HEIGHT = 1080
const ACTIVE_QUERY_TICK_SPAN = 1
const WHITE_KEY_BOTTOM_INSET = 4
const BLACK_KEY_BOTTOM_INSET = 2
const BLACK_KEY_SHADOW_ALPHA = 0.22
const WHITE_KEY_SHADOW_ALPHA = 0.3
const BLACK_KEY_HIGHLIGHT_ALPHA = 0.6
const BLACK_KEY_NOTE_INSET = 2
const BLACK_KEY_VERTICAL_INSET = 3
const BLACK_KEY_NOTE_ALPHA = 0.85
const NOTE_BY_NOTE_PREVIEW_GAP_PX = 16
const NOTE_BY_NOTE_PREVIEW_SHIFT_DURATION_MS = 120
export interface RenderLayers {
  background: PIXI.Container
  laneLines: PIXI.Container
  keyboard: PIXI.Container
  noteByNote: PIXI.Container
  notes: PIXI.Container
  hitLine: PIXI.Container
  overlay: PIXI.Container
}

interface NoteByNoteRenderEntry {
  alpha: number
  baseHeight: number
  baseY: number
  fingerLabel: PIXI.Text | null
  fillColor: number
  graphic: PIXI.Graphics
  glowEnabled: boolean
  fingerNumbersEnabled: boolean
  noteId: string
  noteLabel: PIXI.Text
  noteLabelsEnabled: boolean
  pitch: number
  width: number
  x: number
}

interface NoteByNotePreviewEntry {
  alpha: number
  baseHeight: number
  baseY: number
  fillColor: number
  graphic: PIXI.Graphics
  glowEnabled: boolean
  pitch: number
  width: number
  x: number
}

interface NoteByNotePreviewLevel {
  bottomY: number
  entries: NoteByNotePreviewEntry[]
  levelHeight: number
}

export class Renderer {
  private app: PIXI.Application | null = null
  private layers: RenderLayers | null = null
  private notePool = new NotePool()
  private noteByNoteRectPool = new NotePool()
  private gradientSpritePool = new SpritePool()
  private keyboardPool = new KeyboardPool()
  private gradientTextureCache = new GradientTextureCache()
  private noteLabelPool = new TextPool({
    compactFontSize: 8,
    fill: 0xffffff,
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    prewarmCount: 200,
    resolution: getLabelResolution(),
  })
  private fingeringLabelPool = new TextPool({
    compactFontSize: 11,
    compactFill: 0xffffff,
    dropShadow: false,
    fill: 0xffffff,
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    prewarmCount: 64,
    resolution: getLabelResolution(),
  })
  private noteByNoteLabelPool = new TextPool({
    compactFontSize: 10,
    compactFill: 0x000000,
    dropShadow: false,
    fill: 0x000000,
    fontFamily: 'Arial, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    prewarmCount: 96,
    resolution: getLabelResolution(),
  })
  private keyLabelPool = new TextPool({
    anchorY: 1,
    dropShadow: false,
    fill: 0xffffff,
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    prewarmCount: PIANO_WHITE_KEY_COUNT,
    resolution: getLabelResolution(),
  })
  public isInitialized = false
  private subscriptions: Array<() => void> = []
  private destroyPromise: Promise<void> | null = null
  private initPromise: Promise<void> | null = null
  private lifecyclePromise: Promise<void> = Promise.resolve()
  private backgroundGraphic: PIXI.Graphics | null = null
  private laneLineGraphic: PIXI.Graphics | null = null
  private hitLineGraphic: PIXI.Graphics | null = null
  private keyboardBackingGraphic: PIXI.Graphics | null = null
  private overlayContainer: PIXI.Container | null = null
  private boundaryWaveTime = 0
  private createModeTickerActive = false
  private overlayDrawCallback: ((currentTick: number) => void) | null = null
  private keyLabelsDirty = true
  private isRunning = false
  private noteByNoteEntries: NoteByNoteRenderEntry[] = []
  private noteByNotePreviewEntries: NoteByNotePreviewEntry[] = []
  private noteByNotePreviewLevels: NoteByNotePreviewLevel[] = []
  private chordCorrectAnimation:
    | {
      durationMs: number
      elapsedMs: number
      entries: Array<{
        entry: NoteByNoteRenderEntry
        fingerLabelY: number | null
        graphicY: number
        noteLabelY: number
      }>
    }
    | null = null
  private previewShiftAnimation:
    | {
      durationMs: number
      elapsedMs: number
      entries: Array<{
        entry: NoteByNotePreviewEntry
        startOffsetY: number
        targetOffsetY: number
      }>
    }
    | null = null
  private pendingNoteByNoteRebuild = false
  private previewShiftEligible = false
  private noteDrainAnimations = new Map<number, { durationMs: number; heldSince: number }>()
  private keyFlashAnimations = new Map<number, { color: number; remainingMs: number }>()
  private learnTickerActive = false

  private readonly handleTick: PlaybackEventMap['onTick'] = (currentTick) => {
    if (!this.isInitialized) {
      return
    }

    if (getAppState().isPlaying && !this.isRunning) {
      this.startRenderLoop()
      return
    }

    this.renderFrame(currentTick)
  }

  private readonly handleSeek: PlaybackEventMap['onSeek'] = (currentTick) => {
    if (!this.isInitialized) {
      return
    }

    this.renderFrame(currentTick)
  }

  private readonly handleEnded: PlaybackEventMap['onEnded'] = () => {
    if (!this.isInitialized) {
      return
    }

    this.renderFrame(getAppState().currentTick)
  }

  init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.initPromise != null) {
      return this.initPromise
    }

    const operation = this.lifecyclePromise.then(() => this.initInternal(canvas))

    this.initPromise = operation
      .finally(() => {
        this.initPromise = null
      })
    this.lifecyclePromise = this.initPromise.catch(() => undefined)

    return this.initPromise
  }

  destroy(): Promise<void> {
    if (this.destroyPromise != null) {
      return this.destroyPromise
    }

    const operation = this.lifecyclePromise.then(() => this.destroyInternal())

    this.destroyPromise = operation
      .finally(() => {
        this.destroyPromise = null
      })
    this.lifecyclePromise = this.destroyPromise.catch(() => undefined)

    return this.destroyPromise
  }

  private async initInternal(canvas: HTMLCanvasElement): Promise<void> {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new RendererError('Renderer requires a valid canvas element.', 'CANVAS_ERROR', canvas)
    }

    if (this.isInitialized) {
      return
    }

    const state = getAppState()
    this.ensureCameraReady(state.viewportWidth, state.viewportHeight)

    try {
      this.app = new PIXI.Application({
        antialias: false,
        autoDensity: true,
        autoStart: false,
        backgroundColor: CREATE_MODE_BACKGROUND_COLOR,
        height: state.viewportHeight || REFERENCE_HEIGHT,
        resolution: getCanvasResolution(),
        sharedTicker: false,
        view: canvas,
        width: state.viewportWidth || REFERENCE_WIDTH,
      })
    } catch (error) {
      throw new RendererError('PixiJS application initialization failed.', 'PIXI_ERROR', error)
    }

    this.layers = this.createLayers()
    this.overlayContainer = new PIXI.Container()

    this.app.stage.addChild(this.layers.background, this.overlayContainer)

    this.overlayContainer.addChild(
      this.layers.laneLines,
      this.layers.keyboard,
      this.layers.noteByNote,
      this.layers.notes,
      this.layers.hitLine,
      this.layers.overlay,
    )

    this.backgroundGraphic = new PIXI.Graphics()
    this.laneLineGraphic = new PIXI.Graphics()
    this.hitLineGraphic = new PIXI.Graphics()
    this.keyboardBackingGraphic = new PIXI.Graphics()

    this.layers.background.addChild(this.backgroundGraphic)
    this.layers.laneLines.addChild(this.laneLineGraphic)
    this.layers.hitLine.addChild(this.hitLineGraphic)

    this.drawBackground()
    this.drawLaneLines()
    this.drawHitLine()
    this.initKeyboard()
    this.applyCameraOverlayForMode(state.appMode, state.cameraOverlay)

    if (state.projectData != null) {
      const projectNoteCount = getProjectNoteCount(state.projectData.tracks)
      this.notePool.prewarm(projectNoteCount * 2)
      this.gradientSpritePool.prewarm(projectNoteCount)
    }

    this.addSubscription(subscribeToStore((nextState, previousState) => {
      if (
        nextState.viewportWidth !== previousState.viewportWidth ||
        nextState.viewportHeight !== previousState.viewportHeight ||
        nextState.renderScale !== previousState.renderScale
      ) {
        this.keyLabelsDirty = true
        this.resize(nextState.viewportWidth, nextState.viewportHeight)
      }

      if (nextState.projectData !== previousState.projectData) {
        if (nextState.projectData != null) {
          const projectNoteCount = getProjectNoteCount(nextState.projectData.tracks)
          this.notePool.prewarm(projectNoteCount * 2)
          this.gradientSpritePool.prewarm(projectNoteCount)
        } else {
          this.notePool.releaseAll()
          this.gradientSpritePool.releaseAll()
        }

        this.renderFrame(nextState.currentTick)
      }

      if (haveGradientTextureSettingsChanged(nextState, previousState)) {
        this.gradientTextureCache.clear()
      }

      if (nextState.trackColors !== previousState.trackColors && !nextState.isPlaying) {
        this.renderFrame(nextState.currentTick)
      }

      if (
        nextState.worldZoom !== previousState.worldZoom ||
        nextState.panX !== previousState.panX ||
        nextState.panY !== previousState.panY
      ) {
        this.renderFrame(nextState.currentTick)
      }

      if (
        nextState.noteLabelsOnKeys !== previousState.noteLabelsOnKeys ||
        nextState.noteLabelFormat !== previousState.noteLabelFormat ||
        nextState.noteLabelColor !== previousState.noteLabelColor ||
        nextState.noteLabelSize !== previousState.noteLabelSize
      ) {
        this.keyLabelsDirty = true
        this.updateKeyboard(nextState.currentTick)
        this.app?.render()
      }

      if (
        (!nextState.isPlaying && nextState.selectedNoteIds !== previousState.selectedNoteIds) ||
        (!nextState.isPlaying && nextState.hoveredNoteId !== previousState.hoveredNoteId)
      ) {
        this.renderFrame(nextState.currentTick)
      }

      if (haveVisualizerSettingsChanged(nextState, previousState)) {
        this.drawBackground()
        this.drawLaneLines()
        this.renderFrame(nextState.currentTick)
      }

      if (nextState.laneOpacity !== previousState.laneOpacity) {
        this.drawLaneLines()
        this.app?.render()
      }

      if (
        (nextState.learnV3.isActive || previousState.learnV3.isActive) &&
        (
          nextState.learnV3.isActive !== previousState.learnV3.isActive ||
          nextState.learnVisuals !== previousState.learnVisuals ||
          nextState.learnV3.fingerNumbers !== previousState.learnV3.fingerNumbers ||
          nextState.learnV3.sessionConfig.mode !== previousState.learnV3.sessionConfig.mode ||
          nextState.learnV3.sessionConfig.hand !== previousState.learnV3.sessionConfig.hand
        )
      ) {
        if (!nextState.learnV3.isActive) {
          this.chordCorrectAnimation = null
          this.keyFlashAnimations.clear()
          this.stopLearnTicker()
        }

        this.syncCreateModeTicker()

        this.rebuildNoteByNoteLayer()
        this.app?.render()
      }

      if (nextState.isPlaying !== previousState.isPlaying) {
        if (nextState.isPlaying && !this.isRunning) {
          this.startRenderLoop()
        }

        if (!nextState.isPlaying && this.isRunning) {
          this.stopRenderLoop()
        }
      }
    }))

    this.addSubscription(subscribeToStore((nextState, previousState) => {
      if (nextState.cameraOverlay === previousState.cameraOverlay) {
        return
      }

      this.applyCameraOverlayForMode(nextState.appMode, nextState.cameraOverlay)
      this.app?.render()
    }))

    this.addSubscription(subscribeToStore((nextState, previousState) => {
      if (nextState.appMode === previousState.appMode) {
        return
      }

      this.applyCameraOverlayForMode(nextState.appMode, nextState.cameraOverlay)
      this.app?.render()
    }))

    this.addSubscription(subscribeToStore((nextState, previousState) => {
      if (nextState.learnV3.currentChordIndex === previousState.learnV3.currentChordIndex) {
        return
      }

      if (this.chordCorrectAnimation != null || this.previewShiftAnimation != null) {
        this.pendingNoteByNoteRebuild = true
        return
      }

      if (this.previewShiftEligible && this.startPreviewShiftAnimation()) {
        this.app?.render()
        return
      }

      this.previewShiftEligible = false
      this.rebuildNoteByNoteLayer()
      this.app?.render()
    }))

    playbackEngine.on('onTick', this.handleTick)
    playbackEngine.on('onSeek', this.handleSeek)
    playbackEngine.on('onEnded', this.handleEnded)

    this.isInitialized = true
    this.syncCreateModeTicker()

    if (state.isPlaying) {
      this.startRenderLoop()
      return
    }

    this.renderFrame(state.currentTick)
  }

  private async destroyInternal(): Promise<void> {
    const app = this.app
    this.isInitialized = false
    this.stopRenderLoop()

    playbackEngine.off('onTick', this.handleTick)
    playbackEngine.off('onSeek', this.handleSeek)
    playbackEngine.off('onEnded', this.handleEnded)

    this.clearSubscriptions()

    app?.stage.removeChildren()

    this.notePool.releaseAll()
    this.notePool.destroy()
    this.noteByNoteRectPool.releaseAll()
    this.noteByNoteRectPool.destroy()
    this.gradientSpritePool.releaseAll()
    this.gradientSpritePool.destroy()
    this.gradientTextureCache.destroy()
    this.noteLabelPool.releaseAll()
    this.noteLabelPool.destroy()
    this.fingeringLabelPool.releaseAll()
    this.fingeringLabelPool.destroy()
    this.noteByNoteLabelPool.releaseAll()
    this.noteByNoteLabelPool.destroy()
    this.keyLabelPool.releaseAll()
    this.keyLabelPool.destroy()
    this.keyboardPool.destroy()
    this.stopCreateModeTicker()
    this.stopLearnTicker()
    this.noteByNoteEntries = []
    this.noteByNotePreviewEntries = []
    this.noteByNotePreviewLevels = []
    this.chordCorrectAnimation = null
    this.previewShiftAnimation = null
    this.pendingNoteByNoteRebuild = false
    this.previewShiftEligible = false
    this.noteDrainAnimations.clear()
    this.keyFlashAnimations.clear()
    this.overlayDrawCallback = null
    this.keyLabelsDirty = true

    this.backgroundGraphic = null
    this.laneLineGraphic = null
    this.hitLineGraphic = null
    this.keyboardBackingGraphic = null
    this.overlayContainer = null
    this.boundaryWaveTime = 0

    app?.destroy(true, { baseTexture: true, children: true, texture: true })
    this.app = null
    this.layers = null
    await waitForRendererCleanupFrame()
  }

  isReady(): boolean {
    return this.isInitialized && this.app != null
  }

  getOverlayLayer(): PIXI.Container {
    return this.requireLayers().overlay
  }

  getKeyX(pitch: number): number {
    this.assertInitialized()

    const app = this.requireApp()
    if (isBlackKey(pitch)) {
      return pitchToKeyX(pitch, app.screen.width) + (getBlackKeyWidth(app.screen.width) / 2)
    }

    const { width, x } = getWhiteKeyBounds(pitch, app.screen.width)
    return x + (width / 2)
  }

  getKeyboardY(): number {
    this.assertInitialized()

    return getKeyboardLayoutMetrics(this.requireApp().screen.height).keyboardY
  }

  setKeyboardOpacity(opacity: number): void {
    const keyboardLayer = this.layers?.keyboard ?? this.keyboardBackingGraphic?.parent ?? null
    if (keyboardLayer == null) {
      return
    }

    keyboardLayer.alpha = clamp(opacity, 0, 1)
    this.app?.render()
  }

  setOverlayDrawCallback(callback: ((currentTick: number) => void) | null): void {
    this.overlayDrawCallback = callback
  }

  getCanvas(): HTMLCanvasElement {
    this.assertInitialized()

    return this.requireApp().view as HTMLCanvasElement
  }

  renderFrame(currentTick: number): void {
    this.assertInitialized()
    this.syncLabelStyles()

    this.updateNotes(currentTick)
    this.rebuildNoteByNoteLayer()
    this.overlayDrawCallback?.(currentTick)
    this.updateKeyboard(currentTick)
    this.drawHitLine()
    this.app?.render()
  }

  forceResume(): void {
    if (getAppState().isPlaying && !this.isRunning) {
      this.startRenderLoop()
    }
  }

  triggerChordCorrect(noteIds: string[]): void {
    const state = getAppState()
    if (!this.isNoteByNoteModeActive(state) || noteIds.length === 0 || this.noteByNoteEntries.length === 0) {
      return
    }

    const animatedEntries = this.noteByNoteEntries
      .filter((entry) => noteIds.includes(entry.noteId))
      .map((entry) => ({
        entry,
        fingerLabelY: entry.fingerLabel?.y ?? null,
        graphicY: entry.graphic.y,
        noteLabelY: entry.noteLabel.y,
      }))
    if (animatedEntries.length === 0) {
      return
    }

    for (const animatedEntry of animatedEntries) {
      this.noteDrainAnimations.delete(animatedEntry.entry.pitch)
    }

    this.previewShiftEligible = true
    this.pendingNoteByNoteRebuild = false
    this.chordCorrectAnimation = {
      durationMs: 150,
      elapsedMs: 0,
      entries: animatedEntries,
    }
    this.ensureLearnTicker()
  }

  triggerKeyFlash(pitch: number, color = 0xff3333): void {
    const state = getAppState()
    if (!state.learnV3.isActive || !Number.isFinite(pitch)) {
      return
    }

    this.keyFlashAnimations.set(Math.round(pitch), {
      color,
      remainingMs: 200,
    })

    this.updateKeyboard(state.currentTick)
    this.app?.render()
    this.ensureLearnTicker()
  }

  resize(width: number, height: number): void {
    this.assertInitialized()

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RendererError('Renderer viewport dimensions must be positive finite numbers.', 'CANVAS_ERROR', {
        height,
        width,
      })
    }

    this.syncViewportSize(width, height)

    if (this.app != null) {
      this.app.renderer.resolution = getCanvasResolution()
      this.app.renderer.resize(width, height)
      this.app.view.style.width = '100%'
      this.app.view.style.height = '100%'
    }

    this.drawBackground()
    this.drawLaneLines()
    this.drawHitLine()
    this.drawKeyboardBacking()
    this.applyCameraOverlayForMode(getAppState().appMode, getAppState().cameraOverlay)
    this.keyLabelsDirty = true
    this.renderFrame(getAppState().currentTick)
  }

  private drawBackground(): void {
    const app = this.requireApp()
    const backgroundGraphic = this.requireGraphic(this.backgroundGraphic)
    const state = getAppState()
    const backgroundColor = state.learnV3.isActive
      ? hexToPixi(state.backgroundColor)
      : CREATE_MODE_BACKGROUND_COLOR

    backgroundGraphic.clear()
    backgroundGraphic.beginFill(backgroundColor, 1)
    backgroundGraphic.drawRect(0, 0, app.screen.width, app.screen.height)
    backgroundGraphic.endFill()
  }

  private drawLaneLines(): void {
    const app = this.requireApp()
    const laneLineGraphic = this.requireGraphic(this.laneLineGraphic)
    const state = getAppState()

    laneLineGraphic.clear()
    if (state.learnV3.isActive) {
      const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
      const laneAlpha = (state.laneOpacity / 100) * 0.15

      laneLineGraphic.lineStyle(1, LANE_LINE_COLOR, laneAlpha)

      for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
        if (!isBlackKey(pitch)) {
          const x = pitchToKeyX(pitch, app.screen.width)
          laneLineGraphic.moveTo(x, 0)
          laneLineGraphic.lineTo(x, keyboardY)
        }
      }

      return
    }

    laneLineGraphic.lineStyle(1, CREATE_MODE_LANE_LINE_COLOR, CREATE_MODE_LANE_LINE_ALPHA)

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (pitch % 12 === 0) {
        const x = pitchToKeyX(pitch, app.screen.width)
        laneLineGraphic.moveTo(x, 0)
        laneLineGraphic.lineTo(x, app.screen.height)
      }
    }
  }

  startNoteDrain(pitch: number, durationMs: number, heldSince: number): void {
    const state = getAppState()
    if (!this.isNoteByNoteModeActive(state) || !Number.isFinite(pitch)) {
      return
    }

    const entry = this.noteByNoteEntries.find((candidate) => candidate.pitch === Math.round(pitch))
    if (entry == null) {
      return
    }

    const normalizedDurationMs = Math.max(100, durationMs)
    this.noteDrainAnimations.set(entry.pitch, {
      durationMs: normalizedDurationMs,
      heldSince,
    })
    this.applyNoteByNoteEntryVisual(entry, 0)
    this.app?.render()
    this.ensureLearnTicker()
  }

  cancelNoteDrain(pitch: number): void {
    const state = getAppState()
    if (!this.isNoteByNoteModeActive(state) || !Number.isFinite(pitch)) {
      return
    }

    const normalizedPitch = Math.round(pitch)
    this.noteDrainAnimations.delete(normalizedPitch)
    const entry = this.noteByNoteEntries.find((candidate) => candidate.pitch === normalizedPitch)
    if (entry == null) {
      return
    }

    this.applyNoteByNoteEntryVisual(entry, 0)
    this.app?.render()

    if (!this.hasActiveLearnAnimations()) {
      this.stopLearnTicker()
    }
  }

  private drawHitLine(): void {
    const app = this.requireApp()
    const hitLineGraphic = this.requireGraphic(this.hitLineGraphic)
    const state = getAppState()
    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)

    hitLineGraphic.clear()

    if (!state.learnV3.isActive) {
      hitLineGraphic.visible = true

      this.drawBoundaryWave(
        hitLineGraphic,
        app.screen.width,
        keyboardY,
        CREATE_MODE_BOUNDARY_OUTER_AURA_THICKNESS,
        CREATE_MODE_BOUNDARY_OUTER_AURA_COLOR,
        CREATE_MODE_BOUNDARY_OUTER_AURA_ALPHA,
      )
      this.drawBoundaryWave(
        hitLineGraphic,
        app.screen.width,
        keyboardY,
        CREATE_MODE_BOUNDARY_MID_GLOW_THICKNESS,
        CREATE_MODE_BOUNDARY_MID_GLOW_COLOR,
        CREATE_MODE_BOUNDARY_MID_GLOW_ALPHA,
      )
      this.drawBoundaryWave(
        hitLineGraphic,
        app.screen.width,
        keyboardY,
        CREATE_MODE_BOUNDARY_CORE_THICKNESS,
        CREATE_MODE_BOUNDARY_CORE_COLOR,
        CREATE_MODE_BOUNDARY_CORE_ALPHA,
      )
      hitLineGraphic.endFill()

      return
    }

    hitLineGraphic.visible = true

    const hitLineY = keyboardY - HIT_LINE_HEIGHT
    hitLineGraphic.beginFill(HIT_LINE_COLOR, HIT_LINE_ALPHA)
    hitLineGraphic.drawRect(0, hitLineY, app.screen.width, HIT_LINE_HEIGHT)
    hitLineGraphic.endFill()
  }

  private initKeyboard(): void {
    const app = this.requireApp()
    const layers = this.requireLayers()
    const keyboardBackingGraphic = this.requireGraphic(this.keyboardBackingGraphic)

    this.keyboardPool.init()
    layers.keyboard.addChild(keyboardBackingGraphic)
    this.drawKeyboardBacking()

    for (const entry of this.keyboardPool.getWhiteEntries()) {
      layers.keyboard.addChild(entry.graphic)
    }

    for (const entry of this.keyboardPool.getBlackEntries()) {
      layers.keyboard.addChild(entry.graphic)
    }

    this.updateKeyboard(getAppState().currentTick)
    app.render()
  }

  private drawKeyboardBacking(): void {
    const app = this.requireApp()
    const keyboardBackingGraphic = this.requireGraphic(this.keyboardBackingGraphic)
    const state = getAppState()
    const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const backingY = Math.round(keyboardY - 2)
    const backingWidth = Math.round(app.screen.width)
    const backingHeight = Math.round(keyboardHeight + 2)
    const backingColor = state.learnV3.isActive ? KEYBOARD_BACKING_COLOR : CREATE_MODE_BACKGROUND_COLOR

    keyboardBackingGraphic.clear()
    keyboardBackingGraphic.beginFill(backingColor, 1)
    keyboardBackingGraphic.drawRect(0, backingY, backingWidth, backingHeight)
    keyboardBackingGraphic.endFill()
  }

  private updateNotes(currentTick: number): IndexedNote[] {
    const state = getAppState()
    if (state.learnV3.isActive && state.learnV3.sessionConfig.mode === 'noteByNote') {
      this.notePool.releaseAll()
      this.gradientSpritePool.releaseAll()
      this.noteLabelPool.releaseAll()
      this.fingeringLabelPool.releaseAll()
      return []
    }

    const app = this.requireApp()
    const learnHand = getActiveLearnHandFilter(state)

    this.notePool.releaseAll()
    this.gradientSpritePool.releaseAll()
    this.noteLabelPool.releaseAll()
    this.fingeringLabelPool.releaseAll()

    const spatialIndexReady =
      typeof spatialIndex.isBuilt === 'function'
        ? spatialIndex.isBuilt()
        : spatialIndex.getTotalNoteCount() > 0

    if (state.projectData == null || state.precomputedTempoMap == null || !spatialIndexReady) {
      return []
    }

    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const hitLineY = keyboardY
    const currentSeconds = tickToSeconds(currentTick, state.precomputedTempoMap)
    const visibleTickWindow = getVisibleTickWindow(
      currentTick,
      currentSeconds,
      state.precomputedTempoMap,
      hitLineY,
      state.worldZoom,
    )
    const visibleNotes = spatialIndex.getNotesInRegion(
      PIANO_MIN_PITCH,
      visibleTickWindow.minTick,
      PIANO_MAX_PITCH,
      visibleTickWindow.maxTick,
    )
    const nextNotesById = this.getNextNotesById(visibleNotes)
    const selectedNoteIds = state.selectedNoteIds
    const hoveredNoteId = state.hoveredNoteId
    const renderedNotes: IndexedNote[] = []
    const noteStyle = state.noteStyle

    for (const indexedNote of visibleNotes) {
      if (!isNoteEligibleForLearnHand(indexedNote.note.pitch, learnHand) || !isBlackKey(indexedNote.note.pitch)) {
        continue
      }

      if (this.renderNote(indexedNote, nextNotesById, currentTick, currentSeconds, noteStyle, selectedNoteIds, hoveredNoteId, state)) {
        renderedNotes.push(indexedNote)
      }
    }

    for (const indexedNote of visibleNotes) {
      if (!isNoteEligibleForLearnHand(indexedNote.note.pitch, learnHand) || isBlackKey(indexedNote.note.pitch)) {
        continue
      }

      if (this.renderNote(indexedNote, nextNotesById, currentTick, currentSeconds, noteStyle, selectedNoteIds, hoveredNoteId, state)) {
        renderedNotes.push(indexedNote)
      }
    }

    return renderedNotes
  }

  private renderNote(
    indexedNote: IndexedNote,
    nextNotesById: Map<string, IndexedNote>,
    currentTick: number,
    currentSeconds: number,
    noteStyle: ReturnType<typeof getAppState>['noteStyle'],
    selectedNoteIds: Set<string>,
    hoveredNoteId: string | null,
    state: ReturnType<typeof getAppState>,
  ): boolean {
    const app = this.requireApp()
    const layers = this.requireLayers()
    const rect = getNoteScreenRect(indexedNote.note, {
      canvasHeight: app.screen.height,
      canvasWidth: app.screen.width,
      currentSeconds,
      currentTick,
      tempoMap: state.precomputedTempoMap!,
      worldZoom: state.worldZoom,
    }, nextNotesById.get(indexedNote.note.id) ?? null)

    if (rect == null) {
      return false
    }

    const noteIsBlack = isBlackKey(indexedNote.note.pitch)
    const inset = noteIsBlack ? BLACK_KEY_NOTE_INSET : 0
    const verticalInset = noteIsBlack ? BLACK_KEY_VERTICAL_INSET : 0
    const adjustedRect = {
      ...rect,
      h: Math.max(NOTE_MIN_HEIGHT, rect.h - (verticalInset * 2)),
      w: Math.max(4, rect.w - (inset * 2)),
      x: rect.x + inset,
      y: rect.y + verticalInset,
    }
    const isCreateMode = !state.learnV3.isActive
    const learnVisuals = getActiveLearnVisuals(state)
    const noteColor = isCreateMode
      ? resolveCreateModeNoteColor(indexedNote.note.pitch, state.createNoteColors)
      : learnVisuals == null
      ? resolveNoteColor(indexedNote.note, indexedNote.trackId, state)
      : resolveLearnNoteColor(indexedNote.note.pitch, learnVisuals)
    const isActive = currentTick >= indexedNote.note.startTick && currentTick <= indexedNote.note.visualEndTick
    const isSelected = selectedNoteIds.has(indexedNote.note.id)
    const isHovered = hoveredNoteId === indexedNote.note.id

    let brightness = 1
    if (!isCreateMode && isHovered) {
      brightness = Math.max(brightness, HOVERED_NOTE_FILL_BRIGHTNESS)
    }
    if (!isCreateMode && isSelected) {
      brightness = Math.max(brightness, SELECTED_NOTE_FILL_BRIGHTNESS)
    }
    if (!isCreateMode && isActive) {
      brightness = Math.max(brightness, NOTE_ACTIVE_BRIGHTNESS)
    }

    const fillColor = brightness === 1 ? noteColor : brightenColor(noteColor, brightness)
    const noteAlpha = isCreateMode
      ? 1
      : learnVisuals == null
      ? (noteIsBlack ? BLACK_KEY_NOTE_ALPHA : NOTE_ALPHA)
      : clamp(learnVisuals.noteOpacity, 0.3, 1)
    const noteLabelsEnabled = isCreateMode
      ? true
      : learnVisuals?.noteLabelsEnabled ?? state.noteLabelsOnNotes
    const fingerNumbersEnabled = learnVisuals?.fingerNumbersEnabled ?? true

    if (isCreateMode) {
      const graphic = this.notePool.acquire()
      graphic.clear()
      graphic.beginFill(fillColor, 1)
      graphic.drawRect(adjustedRect.x, adjustedRect.y, adjustedRect.w, adjustedRect.h)
      graphic.endFill()
      layers.notes.addChild(graphic)
    } else if (noteStyle === 'gradient') {
      const gradientColors = resolveNoteGradientColors(indexedNote.note, indexedNote.trackId, state)
      const topColor = pixiToHex(brightenColor(hexToPixi(gradientColors.topColor), brightness))
      const bottomColor = pixiToHex(brightenColor(hexToPixi(gradientColors.bottomColor), brightness))
      const sprite = this.gradientSpritePool.acquire()
      sprite.texture = this.gradientTextureCache.getTexture(
        topColor,
        bottomColor,
        adjustedRect.h,
        state.noteGradientDirection,
      )
      sprite.x = adjustedRect.x
      sprite.y = adjustedRect.y
      sprite.width = adjustedRect.w
      sprite.height = adjustedRect.h
      sprite.alpha = noteAlpha
      layers.notes.addChild(sprite)

      if (learnVisuals?.glowEnabled) {
        const glowGraphic = this.notePool.acquire()
        glowGraphic.clear()
        this.drawLearnGlow(glowGraphic, adjustedRect.x, adjustedRect.y, adjustedRect.w, adjustedRect.h, fillColor)
        layers.notes.addChild(glowGraphic)
      }
    } else {
      if (learnVisuals?.glowEnabled) {
        const glowGraphic = this.notePool.acquire()
        glowGraphic.clear()
        this.drawLearnGlow(glowGraphic, adjustedRect.x, adjustedRect.y, adjustedRect.w, adjustedRect.h, fillColor)
        layers.notes.addChild(glowGraphic)
      }

      const graphic = this.notePool.acquire()
      graphic.clear()
      this.drawStyledNote(
        graphic,
        adjustedRect.x,
        adjustedRect.y,
        adjustedRect.w,
        adjustedRect.h,
        fillColor,
        noteStyle,
        noteAlpha,
      )
      layers.notes.addChild(graphic)
    }

    if (noteLabelsEnabled) {
      const label = this.noteLabelPool.acquire(isCreateMode ? false : adjustedRect.w < 14)
      label.text = getNoteLabel(indexedNote.note.pitch, isCreateMode ? 'nameOctave' : state.noteLabelFormat)
      label.x = adjustedRect.x + (adjustedRect.w / 2)
      label.y = adjustedRect.y + (adjustedRect.h / 2)
      label.resolution = getLabelResolution()

      if (!isCreateMode && (adjustedRect.w < 8 || adjustedRect.h < 8 || (noteIsBlack && adjustedRect.h < 20))) {
        label.visible = false
      } else {
        label.visible = true
        if (isCreateMode) {
          label.scale.set(1)
        } else {
          const configuredFontSize = Math.max(8, state.noteLabelSize)
          const fittedFontSize = Math.min(
            configuredFontSize,
            Math.floor(adjustedRect.w * 0.7),
            Math.floor(adjustedRect.h * 0.6),
          )
          const visibleFontSize = Math.max(6, fittedFontSize)
          label.scale.set(visibleFontSize / configuredFontSize)
        }
      }

      layers.notes.addChild(label)
    }

    if (
      state.learnV3.isActive &&
      (state.learnV3.sessionConfig.mode === 'listen' || state.learnV3.sessionConfig.mode === 'playAlong') &&
      adjustedRect.h > 20 &&
      fingerNumbersEnabled
    ) {
      const fingerNumber = state.learnV3.fingerNumbers[indexedNote.note.id]
      if (fingerNumber != null) {
        const fingerLabel = this.fingeringLabelPool.acquire()
        fingerLabel.text = String(fingerNumber)
        fingerLabel.x = adjustedRect.x + (adjustedRect.w / 2)
        fingerLabel.y = adjustedRect.y + (adjustedRect.h / 2)
        fingerLabel.scale.set(1)
        fingerLabel.resolution = getLabelResolution()
        layers.notes.addChild(fingerLabel)
      }
    }

    return true
  }

  private getNextNotesById(visibleNotes: IndexedNote[]): Map<string, IndexedNote> {
    const groupedNotes = new Map<string, IndexedNote[]>()

    for (const indexedNote of visibleNotes) {
      const key = `${indexedNote.trackId}:${indexedNote.note.pitch}`
      const notesForKey = groupedNotes.get(key)

      if (notesForKey == null) {
        groupedNotes.set(key, [indexedNote])
        continue
      }

      notesForKey.push(indexedNote)
    }

    const nextNotesById = new Map<string, IndexedNote>()

    for (const notesForKey of groupedNotes.values()) {
      notesForKey.sort((left, right) => left.note.startTick - right.note.startTick)

      for (let index = 0; index < notesForKey.length - 1; index += 1) {
        nextNotesById.set(notesForKey[index].note.id, notesForKey[index + 1])
      }
    }

    return nextNotesById
  }

  private updateKeyboard(currentTick: number): void {
    const app = this.requireApp()
    const state = getAppState()
    const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const keyboardWidth = app.screen.width
    const blackKeyWidth = Math.max(1, Math.round(getBlackKeyWidth(keyboardWidth)))
    const blackKeyHeight = state.learnV3.isActive
      ? Math.max(1, Math.round(keyboardHeight * BLACK_KEY_HEIGHT_RATIO))
      : Math.max(1, Math.round(keyboardHeight * 0.6))
    const activeNotesByPitch = this.getActiveNotesByPitch(currentTick)

    for (const entry of this.keyboardPool.getEntries()) {
      const activeNote = activeNotesByPitch.get(entry.pitch) ?? null
      const whiteKeyBounds = entry.isBlack ? null : getWhiteKeyBounds(entry.pitch, keyboardWidth)
      const keyWidth = entry.isBlack ? blackKeyWidth : whiteKeyBounds.width
      const keyHeight = entry.isBlack ? blackKeyHeight : Math.round(keyboardHeight)
      const keyX = entry.isBlack ? Math.round(pitchToKeyX(entry.pitch, keyboardWidth)) : whiteKeyBounds.x

      this.drawKeyboardKey(entry, keyX, keyboardY, keyWidth, keyHeight, activeNote, state)
    }

    this.updateKeyboardLabels(keyboardWidth, app.screen.height, state)
  }

  private drawKeyboardKey(
    entry: KeyboardGraphic,
    x: number,
    y: number,
    width: number,
    height: number,
    activeNote: IndexedNote | null,
    state: ReturnType<typeof getAppState>,
  ): void {
    const graphic = entry.graphic
    graphic.clear()

    const activeColor = activeNote == null
      ? null
      : !state.learnV3.isActive
      ? resolveCreateModeNoteColor(activeNote.note.pitch, state.createNoteColors)
      : resolveNoteColor(activeNote.note, activeNote.trackId, state)
    const flashColor = state.learnV3.isActive ? this.keyFlashAnimations.get(entry.pitch)?.color ?? null : null
    const highlightColor = flashColor ?? activeColor
    const keyX = Math.round(x)
    const keyY = Math.round(y)
    const keyWidth = Math.max(1, Math.round(width))
    const keyHeight = Math.max(1, Math.round(height))

    if (entry.isBlack) {
      graphic.beginFill(BLACK_KEY_SHADOW_COLOR, BLACK_KEY_SHADOW_ALPHA)
      graphic.drawRect(keyX, keyY + 1, keyWidth, Math.max(1, keyHeight - 1))
      graphic.endFill()

      graphic.beginFill(BLACK_KEY_COLOR, 1)
      graphic.drawRect(keyX, keyY, keyWidth, Math.max(1, keyHeight - BLACK_KEY_BOTTOM_INSET))
      graphic.endFill()

      graphic.beginFill(BLACK_KEY_HIGHLIGHT_COLOR, BLACK_KEY_HIGHLIGHT_ALPHA)
      graphic.drawRect(
        keyX + 1,
        keyY + keyHeight - BLACK_KEY_BOTTOM_SHADOW_HEIGHT - BLACK_KEY_BOTTOM_INSET,
        Math.max(1, keyWidth - 2),
        BLACK_KEY_BOTTOM_SHADOW_HEIGHT,
      )
      graphic.endFill()

      if (highlightColor != null) {
        graphic.beginFill(highlightColor, BLACK_KEY_ACTIVE_ALPHA)
        graphic.drawRect(keyX, keyY, keyWidth, Math.max(1, keyHeight - BLACK_KEY_BOTTOM_INSET))
        graphic.endFill()
      }

      return
    }

    const whiteKeyX = keyX
    const hasSeparator = getWhiteKeyIndex(entry.pitch) < PIANO_WHITE_KEY_COUNT - 1
    const whiteKeyWidth = hasSeparator
      ? Math.max(1, keyWidth - WHITE_KEY_SEPARATOR_WIDTH)
      : keyWidth
    const whiteKeyHeight = Math.max(1, keyHeight - WHITE_KEY_BOTTOM_INSET)

    graphic.beginFill(WHITE_KEY_COLOR, 1)
    graphic.drawRect(whiteKeyX, keyY, whiteKeyWidth, whiteKeyHeight)
    graphic.endFill()

    graphic.beginFill(WHITE_KEY_SHADOW_COLOR, WHITE_KEY_SHADOW_ALPHA)
    graphic.drawRect(
      whiteKeyX,
      keyY + keyHeight - WHITE_KEY_BOTTOM_SHADOW_HEIGHT - WHITE_KEY_BOTTOM_INSET,
      whiteKeyWidth,
      WHITE_KEY_BOTTOM_SHADOW_HEIGHT,
    )
    graphic.endFill()

    if (hasSeparator) {
      graphic.beginFill(WHITE_KEY_SEPARATOR_COLOR, 0.45)
      graphic.drawRect(
        whiteKeyX + whiteKeyWidth,
        keyY,
        WHITE_KEY_SEPARATOR_WIDTH,
        whiteKeyHeight,
      )
      graphic.endFill()
    }

    if (highlightColor != null) {
      graphic.beginFill(highlightColor, WHITE_KEY_ACTIVE_ALPHA)
      graphic.drawRect(whiteKeyX, keyY, whiteKeyWidth, whiteKeyHeight)
      graphic.endFill()
    }
  }

  private updateNoteByNoteLayer(): void {
    this.rebuildNoteByNoteLayer()
  }

  private startPreviewShiftAnimation(): boolean {
    if (this.noteByNotePreviewLevels.length === 0) {
      return false
    }

    const app = this.app
    if (app == null) {
      return false
    }

    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const entries: Array<{
      entry: NoteByNotePreviewEntry
      startOffsetY: number
      targetOffsetY: number
    }> = []

    let nextBottomY = keyboardY
    for (const level of this.noteByNotePreviewLevels) {
      for (const entry of level.entries) {
        entries.push({
          entry,
          startOffsetY: entry.graphic.y,
          targetOffsetY: (nextBottomY - entry.baseHeight) - entry.baseY,
        })
      }

      nextBottomY = nextBottomY - level.levelHeight - NOTE_BY_NOTE_PREVIEW_GAP_PX
    }

    if (entries.length === 0) {
      return false
    }

    this.previewShiftAnimation = {
      durationMs: NOTE_BY_NOTE_PREVIEW_SHIFT_DURATION_MS,
      elapsedMs: 0,
      entries,
    }
    this.ensureLearnTicker()
    return true
  }

  private rebuildNoteByNoteLayer(): void {
    const layers = this.requireLayers()
    const state = getAppState()

    this.noteByNoteRectPool.releaseAll()
    this.noteByNoteLabelPool.releaseAll()
    layers.noteByNote.removeChildren()
    this.noteByNoteEntries = []
    this.noteByNotePreviewEntries = []
    this.noteByNotePreviewLevels = []
    this.previewShiftAnimation = null
    this.noteDrainAnimations.clear()
    layers.noteByNote.visible = this.isNoteByNoteModeActive(state)

    if (!layers.noteByNote.visible || state.projectData == null || state.precomputedTempoMap == null) {
      return
    }

    const app = this.requireApp()
    const chordGroups = this.getChordGroups(state.projectData.tracks, state.learnV3.sessionConfig.hand)
    const currentGroupIndex = state.learnV3.currentChordIndex
    const currentChord = chordGroups[currentGroupIndex]
    const learnVisuals = getActiveLearnVisuals(state) ?? state.learnVisuals

    if (currentChord == null) {
      return
    }

    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const currentChordLevelHeight = getChordLevelHeight(currentChord, state.precomputedTempoMap)

    for (const indexedNote of currentChord) {
      const pitch = indexedNote.note.pitch
      const durationMs = getNoteDurationMs(indexedNote.note, state.precomputedTempoMap)
      const noteHeight = Math.min(200, Math.max(60, (durationMs / 500) * 60))
      const y = keyboardY - noteHeight
      const fillColor = resolveLearnNoteColor(pitch, learnVisuals)
      const keyBounds = isBlackKey(pitch)
        ? {
          width: Math.max(1, Math.round(getBlackKeyWidth(app.screen.width))),
          x: Math.round(pitchToKeyX(pitch, app.screen.width)),
        }
        : getWhiteKeyBounds(pitch, app.screen.width)
      const graphic = this.noteByNoteRectPool.acquire()
      graphic.clear()
      graphic.alpha = 1
      graphic.x = 0
      graphic.y = 0

      const noteLabel = this.noteByNoteLabelPool.acquire(false)
      noteLabel.anchor.set(0.5, 0.5)
      noteLabel.text = getNoteLabel(pitch, 'nameOctave')

      const fingerNumber = learnVisuals.fingerNumbersEnabled
        ? state.learnV3.fingerNumbers[indexedNote.note.id]
        : null
      let fingerLabel: PIXI.Text | null = null
      if (fingerNumber != null) {
        fingerLabel = this.noteByNoteLabelPool.acquire(true)
        fingerLabel.anchor.set(0, 0)
        fingerLabel.text = String(fingerNumber)
      }

      const entry: NoteByNoteRenderEntry = {
        alpha: clamp(learnVisuals.noteOpacity, 0.3, 1),
        baseHeight: noteHeight,
        baseY: y,
        fingerLabel,
        fillColor,
        graphic,
        fingerNumbersEnabled: learnVisuals.fingerNumbersEnabled,
        glowEnabled: learnVisuals.glowEnabled,
        noteId: indexedNote.note.id,
        noteLabel,
        noteLabelsEnabled: learnVisuals.noteLabelsEnabled,
        pitch,
        width: keyBounds.width,
        x: keyBounds.x,
      }
      this.noteByNoteEntries.push(entry)
      this.applyNoteByNoteEntryVisual(entry, 0)
      layers.noteByNote.addChild(graphic)
      if (learnVisuals.noteLabelsEnabled) {
        layers.noteByNote.addChild(noteLabel)
      }
      if (fingerLabel != null) {
        layers.noteByNote.addChild(fingerLabel)
      }
    }

    let previousLevelTopY = keyboardY - currentChordLevelHeight
    for (let previewOffset = 1; currentGroupIndex + previewOffset < chordGroups.length; previewOffset += 1) {
      const previewChord = chordGroups[currentGroupIndex + previewOffset]
      if (previewChord == null) {
        continue
      }

      const levelHeight = getChordLevelHeight(previewChord, state.precomputedTempoMap)
      const levelBottomY = previousLevelTopY - NOTE_BY_NOTE_PREVIEW_GAP_PX
      const levelTopY = levelBottomY - levelHeight
      if (levelTopY < 0) {
        break
      }

      const previewOpacity = Math.max(0.08, 0.75 - (previewOffset * 0.06))
      const entries: NoteByNotePreviewEntry[] = []

      for (const indexedNote of previewChord) {
        const pitch = indexedNote.note.pitch
        const durationMs = getNoteDurationMs(indexedNote.note, state.precomputedTempoMap)
        const noteHeight = Math.min(200, Math.max(60, (durationMs / 500) * 60))
        const y = levelBottomY - noteHeight
        const fillColor = resolveLearnNoteColor(pitch, learnVisuals)
        const keyBounds = isBlackKey(pitch)
          ? {
            width: Math.max(1, Math.round(getBlackKeyWidth(app.screen.width))),
            x: Math.round(pitchToKeyX(pitch, app.screen.width)),
          }
          : getWhiteKeyBounds(pitch, app.screen.width)
        const graphic = this.noteByNoteRectPool.acquire()
        graphic.clear()
        graphic.alpha = previewOpacity
        graphic.x = 0
        graphic.y = 0

        const entry: NoteByNotePreviewEntry = {
          alpha: clamp(learnVisuals.noteOpacity, 0.3, 1) * previewOpacity,
          baseHeight: noteHeight,
          baseY: y,
          fillColor,
          graphic,
          glowEnabled: learnVisuals.glowEnabled,
          pitch,
          width: keyBounds.width,
          x: keyBounds.x,
        }

        if (entry.glowEnabled) {
          this.drawLearnGlow(graphic, entry.x, entry.baseY, entry.width, entry.baseHeight, entry.fillColor, entry.alpha)
        }
        this.drawStyledNote(graphic, entry.x, entry.baseY, entry.width, entry.baseHeight, entry.fillColor, 'solid', entry.alpha)

        entries.push(entry)
        this.noteByNotePreviewEntries.push(entry)
        layers.noteByNote.addChild(graphic)
      }

      this.noteByNotePreviewLevels.push({
        bottomY: levelBottomY,
        entries,
        levelHeight,
      })
      previousLevelTopY = levelTopY
    }
  }

  private applyNoteByNoteEntryVisual(entry: NoteByNoteRenderEntry, progress: number): void {
    const clampedProgress = Math.max(0, Math.min(1, progress))
    const height = Math.max(0, entry.baseHeight * (1 - clampedProgress))
    const topY = entry.baseY + (entry.baseHeight - height)
    const fillColor = interpolateColor(entry.fillColor, 0xd3d3d3, clampedProgress)

    entry.graphic.clear()
    entry.graphic.alpha = entry.alpha
    entry.graphic.x = 0
    entry.graphic.y = 0

    if (height > 0) {
      if (entry.glowEnabled) {
        this.drawLearnGlow(entry.graphic, entry.x, topY, entry.width, height, fillColor, entry.alpha)
      }
      this.drawStyledNote(
        entry.graphic,
        entry.x,
        topY,
        entry.width,
        height,
        fillColor,
        'solid',
        entry.alpha,
      )
    }

    entry.noteLabel.visible = entry.noteLabelsEnabled && height > 0
    entry.noteLabel.alpha = entry.alpha
    entry.noteLabel.x = entry.x + (entry.width / 2)
    entry.noteLabel.y = topY + (height / 2)
    entry.noteLabel.scale.set(1)
    entry.noteLabel.resolution = getLabelResolution()

    if (entry.fingerLabel != null) {
      entry.fingerLabel.visible = entry.fingerNumbersEnabled && height > 0
      entry.fingerLabel.alpha = entry.alpha
      entry.fingerLabel.x = entry.x + 6
      entry.fingerLabel.y = topY + 6
      entry.fingerLabel.scale.set(1)
      entry.fingerLabel.resolution = getLabelResolution()
    }
  }

  private drawStyledNote(
    graphic: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    noteStyle: ReturnType<typeof getAppState>['noteStyle'],
    alpha: number,
  ): void {
    if (noteStyle === 'gradient') {
      return
    }

    if (noteStyle === 'saber') {
      if (width >= 6) {
        const outerGlowWidth = width * 1.4
        const outerGlowX = x - ((outerGlowWidth - width) / 2)

        graphic.beginFill(color, 0.15 * alpha)
        graphic.drawRect(outerGlowX, y, outerGlowWidth, height)
        graphic.endFill()
      }

      graphic.beginFill(color, alpha)
      graphic.drawRect(x, y, width, height)
      graphic.endFill()

      const highlightWidth = Math.min(width, 8)
      const highlightX = x + ((width - highlightWidth) / 2)
      graphic.beginFill(0xffffff, 0.35 * alpha)
      graphic.drawRect(highlightX, y, highlightWidth, height)
      graphic.endFill()

      const coreWidth = Math.min(width, 2)
      const coreX = x + ((width - coreWidth) / 2)
      graphic.beginFill(0xffffff, 0.9 * alpha)
      graphic.drawRect(coreX, y, coreWidth, height)
      graphic.endFill()
      return
    }

    graphic.beginFill(color, alpha)
    drawTopRoundedRect(graphic, x, y, width, height, NOTE_CORNER_RADIUS)
    graphic.endFill()
  }

  private drawLearnGlow(
    graphic: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha = 1,
  ): void {
    const glowWidth = width * 1.4
    const glowX = x - ((glowWidth - width) / 2)

    graphic.beginFill(color, 0.2 * alpha)
    graphic.drawRect(glowX, y, glowWidth, height)
    graphic.endFill()
  }

  private drawBoundaryWave(
    graphic: PIXI.Graphics,
    width: number,
    keyboardY: number,
    lineWidth: number,
    color: number,
    alpha: number,
  ): void {
    graphic.lineStyle(lineWidth, color, alpha)

    let drewStartPoint = false
    for (let x = 0; x <= width; x += CREATE_MODE_BOUNDARY_SEGMENT_WIDTH) {
      const waveY = keyboardY + Math.sin((x / CREATE_MODE_BOUNDARY_WAVE_LENGTH) + this.boundaryWaveTime) * CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE
      if (!drewStartPoint) {
        graphic.moveTo(x, waveY)
        drewStartPoint = true
      } else {
        graphic.lineTo(x, waveY)
      }
    }

    if (width % CREATE_MODE_BOUNDARY_SEGMENT_WIDTH !== 0) {
      const waveY = keyboardY + Math.sin((width / CREATE_MODE_BOUNDARY_WAVE_LENGTH) + this.boundaryWaveTime) * CREATE_MODE_BOUNDARY_WAVE_AMPLITUDE
      if (!drewStartPoint) {
        graphic.moveTo(width, waveY)
      } else {
        graphic.lineTo(width, waveY)
      }
    }
  }

  private updateKeyboardLabels(
    canvasWidth: number,
    canvasHeight: number,
    state: ReturnType<typeof getAppState>,
  ): void {
    if (!this.keyLabelsDirty) {
      return
    }

    this.keyLabelPool.releaseAll()
    this.keyLabelsDirty = false

    const showKeyLabels = state.learnV3.isActive ? state.noteLabelsOnKeys : true
    if (!showKeyLabels) {
      return
    }

    const keyboardLayer = this.requireLayers().keyboard
    const labelY = canvasHeight - 8

    for (const entry of this.keyboardPool.getWhiteEntries()) {
      const whiteKeyBounds = getWhiteKeyBounds(entry.pitch, canvasWidth)
      const label = this.keyLabelPool.acquire()
      label.text = getNoteLabel(entry.pitch, state.learnV3.isActive ? state.noteLabelFormat : 'name')
      label.x = whiteKeyBounds.x + (whiteKeyBounds.width / 2)
      label.y = labelY
      label.scale.set(1)
      label.resolution = getLabelResolution()
      keyboardLayer.addChild(label)
    }
  }

  private syncLabelStyles(): void {
    const state = getAppState()
    const textResolution = getLabelResolution()
    const isCreateMode = !state.learnV3.isActive

    this.noteLabelPool.updateStyles({
      compactFill: isCreateMode ? 0xffffff : hexToPixi(state.noteLabelColor),
      compactFontSize: isCreateMode ? 12 : Math.max(8, state.noteLabelSize - 1),
      dropShadow: !isCreateMode,
      fill: isCreateMode ? 0xffffff : hexToPixi(state.noteLabelColor),
      fontFamily: 'Arial, sans-serif',
      fontSize: isCreateMode ? 12 : state.noteLabelSize,
      fontWeight: 'bold',
      resolution: textResolution,
    })

    this.fingeringLabelPool.updateStyles({
      compactFill: 0xffffff,
      compactFontSize: 11,
      dropShadow: false,
      fill: 0xffffff,
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fontWeight: 'bold',
      resolution: textResolution,
    })

    this.noteByNoteLabelPool.updateStyles({
      compactFill: 0x000000,
      compactFontSize: 10,
      dropShadow: false,
      fill: 0x000000,
      fontFamily: 'Arial, sans-serif',
      fontSize: 13,
      fontWeight: 'bold',
      resolution: textResolution,
    })

    this.keyLabelPool.updateStyles({
      dropShadow: false,
      fill: isCreateMode ? 0x000000 : hexToPixi(state.noteLabelColor),
      fontFamily: 'Arial, sans-serif',
      fontSize: isCreateMode ? 12 : state.noteLabelSize,
      fontWeight: 'bold',
      resolution: textResolution,
    })
  }

  private getActiveNotesByPitch(currentTick: number): Map<number, IndexedNote> {
    const state = getAppState()
    const activeNotes = new Map<number, IndexedNote>()
    const learnHand = getActiveLearnHandFilter(state)

    if (state.projectData == null || spatialIndex.getTotalNoteCount() === 0) {
      return activeNotes
    }

    const candidates = spatialIndex.getNotesInRegion(
      PIANO_MIN_PITCH,
      currentTick,
      PIANO_MAX_PITCH,
      currentTick + ACTIVE_QUERY_TICK_SPAN,
    )

    for (const indexedNote of candidates) {
      if (
        isNoteEligibleForLearnHand(indexedNote.note.pitch, learnHand) &&
        indexedNote.note.startTick <= currentTick &&
        indexedNote.note.visualEndTick >= currentTick
      ) {
        const current = activeNotes.get(indexedNote.note.pitch)
        if (current == null || indexedNote.note.startTick >= current.note.startTick) {
          activeNotes.set(indexedNote.note.pitch, indexedNote)
        }
      }
    }

    return activeNotes
  }

  private createLayers(): RenderLayers {
    return {
      background: new PIXI.Container(),
      hitLine: new PIXI.Container(),
      keyboard: new PIXI.Container(),
      laneLines: new PIXI.Container(),
      noteByNote: new PIXI.Container(),
      notes: new PIXI.Container(),
      overlay: new PIXI.Container(),
    }
  }

  private applyCameraOverlayForMode(
    appMode: ReturnType<typeof getAppState>['appMode'],
    overlay: CameraOverlaySettings,
  ): void {
    const overlayContainer = this.overlayContainer
    if (overlayContainer == null || this.app == null) {
      return
    }

    if (appMode !== 'createCamera') {
      this.resetCameraOverlayTransform()
      return
    }

    this.applyOverlayTransform(overlay)
  }

  private applyOverlayTransform(overlay: CameraOverlaySettings): void {
    const overlayContainer = this.overlayContainer
    if (overlayContainer == null) {
      return
    }

    overlayContainer.x = overlay.offsetX
    // Vertical placement is handled by the Camera Mode DOM layout so the
    // visualizer can overlap the webcam feed instead of being clipped inside
    // the top canvas slot.
    overlayContainer.y = 0
    this.setContainerScale(overlayContainer, Math.max(0.05, overlay.scale))
  }

  private resetCameraOverlayTransform(): void {
    const overlayContainer = this.overlayContainer
    if (overlayContainer == null) {
      return
    }

    overlayContainer.x = 0
    overlayContainer.y = 0
    this.setContainerScale(overlayContainer, 1)
  }

  private setContainerScale(container: PIXI.Container, scale: number): void {
    const scaleTarget = container as PIXI.Container & {
      scale?: {
        set?: (x: number, y?: number) => void
        x?: number
        y?: number
      }
    }

    if (scaleTarget.scale != null && typeof scaleTarget.scale.set === 'function') {
      scaleTarget.scale.set(scale)
      return
    }

    scaleTarget.scale = {
      ...scaleTarget.scale,
      x: scale,
      y: scale,
    }
  }

  private getChordGroups(
    tracks: Track[],
    hand: ReturnType<typeof getAppState>['learnV3']['sessionConfig']['hand'] = 'both',
  ): IndexedNote[][] {
    const flattenedNotes: IndexedNote[] = []

    tracks.forEach((track, trackIndex) => {
      for (const note of track.notes) {
        if (!isPitchIncludedForHand(note.pitch, hand)) {
          continue
        }

        flattenedNotes.push({
          note,
          trackId: track.id,
          trackIndex,
        })
      }
    })

    flattenedNotes.sort((left, right) => {
      if (left.note.startTick !== right.note.startTick) {
        return left.note.startTick - right.note.startTick
      }

      if (left.note.pitch !== right.note.pitch) {
        return left.note.pitch - right.note.pitch
      }

      return left.trackIndex - right.trackIndex
    })

    const chordGroups: IndexedNote[][] = []
    let currentStartTick: number | null = null

    for (const indexedNote of flattenedNotes) {
      if (currentStartTick !== indexedNote.note.startTick) {
        chordGroups.push([indexedNote])
        currentStartTick = indexedNote.note.startTick
        continue
      }

      chordGroups[chordGroups.length - 1].push(indexedNote)
    }

    return chordGroups
  }

  private isNoteByNoteModeActive(state: ReturnType<typeof getAppState>): boolean {
    return state.learnV3.isActive && state.learnV3.sessionConfig.mode === 'noteByNote'
  }

  private ensureLearnTicker(): void {
    const app = this.app
    if (app == null || this.learnTickerActive || (!this.hasActiveLearnAnimations())) {
      return
    }

    app.ticker.add(this.handleLearnTicker)
    this.learnTickerActive = true
    this.syncAppTickerState()
  }

  private stopLearnTicker(): void {
    const app = this.app
    if (app != null && this.learnTickerActive) {
      app.ticker.remove(this.handleLearnTicker)
    }

    this.learnTickerActive = false
    this.syncAppTickerState()
  }

  private hasActiveLearnAnimations(): boolean {
    return (
      this.chordCorrectAnimation != null ||
      this.previewShiftAnimation != null ||
      this.keyFlashAnimations.size > 0 ||
      this.noteDrainAnimations.size > 0
    )
  }

  private readonly handleLearnTicker = (ticker: PIXI.Ticker): void => {
    const state = getAppState()
    if (!state.learnV3.isActive) {
      this.chordCorrectAnimation = null
      this.previewShiftAnimation = null
      this.noteDrainAnimations.clear()
      this.keyFlashAnimations.clear()
      this.stopLearnTicker()
      return
    }

    const elapsedMs = Number.isFinite(ticker.elapsedMS) ? ticker.elapsedMS : 16.6667
    let previewShiftStartedThisTick = false

    if (this.noteDrainAnimations.size > 0) {
      const now = performance.now()
      for (const [pitch, drain] of [...this.noteDrainAnimations.entries()]) {
        const entry = this.noteByNoteEntries.find((candidate) => candidate.pitch === pitch)
        if (entry == null) {
          this.noteDrainAnimations.delete(pitch)
          continue
        }

        const progress = Math.min(1, Math.max(0, (now - drain.heldSince) / drain.durationMs))
        this.applyNoteByNoteEntryVisual(entry, progress)

        if (progress >= 1) {
          this.noteDrainAnimations.delete(pitch)
        }
      }
    }

    if (this.chordCorrectAnimation != null) {
      this.chordCorrectAnimation.elapsedMs += elapsedMs
      const progress = Math.min(1, this.chordCorrectAnimation.elapsedMs / this.chordCorrectAnimation.durationMs)

      for (const animatedEntry of this.chordCorrectAnimation.entries) {
        const nextAlpha = animatedEntry.entry.alpha * (1 - progress)
        animatedEntry.entry.graphic.alpha = nextAlpha
        animatedEntry.entry.graphic.y = animatedEntry.graphicY + (progress * 20)
        animatedEntry.entry.noteLabel.alpha = nextAlpha
        animatedEntry.entry.noteLabel.y = animatedEntry.noteLabelY + (progress * 20)
        if (animatedEntry.entry.fingerLabel != null && animatedEntry.fingerLabelY != null) {
          animatedEntry.entry.fingerLabel.alpha = nextAlpha
          animatedEntry.entry.fingerLabel.y = animatedEntry.fingerLabelY + (progress * 20)
        }
      }

      if (progress >= 1) {
        this.chordCorrectAnimation = null
        if (this.pendingNoteByNoteRebuild) {
          this.pendingNoteByNoteRebuild = false
          if (this.startPreviewShiftAnimation()) {
            previewShiftStartedThisTick = true
          } else {
            this.previewShiftEligible = false
            this.rebuildNoteByNoteLayer()
          }
        }
      }
    }

    if (this.previewShiftAnimation != null && !previewShiftStartedThisTick) {
      this.previewShiftAnimation.elapsedMs += elapsedMs
      const progress = Math.min(1, this.previewShiftAnimation.elapsedMs / this.previewShiftAnimation.durationMs)

      for (const animatedEntry of this.previewShiftAnimation.entries) {
        animatedEntry.entry.graphic.y =
          animatedEntry.startOffsetY +
          ((animatedEntry.targetOffsetY - animatedEntry.startOffsetY) * progress)
      }

      if (progress >= 1) {
        this.previewShiftAnimation = null
        this.previewShiftEligible = false
        this.rebuildNoteByNoteLayer()
      }
    }

    if (this.keyFlashAnimations.size > 0) {
      for (const [pitch, flash] of [...this.keyFlashAnimations.entries()]) {
        flash.remainingMs -= elapsedMs
        if (flash.remainingMs <= 0) {
          this.keyFlashAnimations.delete(pitch)
        }
      }

      this.updateKeyboard(state.currentTick)
    }

    this.app?.render()

    if (!this.hasActiveLearnAnimations()) {
      this.stopLearnTicker()
    }
  }

  private readonly handleCreateModeTicker = (): void => {
    if (!this.isInitialized) {
      return
    }

    const state = getAppState()
    if (state.learnV3.isActive) {
      return
    }

    this.boundaryWaveTime += CREATE_MODE_BOUNDARY_WAVE_TIME_STEP
    this.drawHitLine()
    this.app?.render()
  }

  private syncCreateModeTicker(): void {
    const state = getAppState()
    if (state.learnV3.isActive) {
      this.stopCreateModeTicker()
      return
    }

    this.ensureCreateModeTicker()
  }

  private ensureCreateModeTicker(): void {
    const app = this.app
    if (app == null || this.createModeTickerActive) {
      return
    }

    app.ticker.add(this.handleCreateModeTicker)
    this.createModeTickerActive = true
    this.syncAppTickerState()
  }

  private stopCreateModeTicker(): void {
    const app = this.app
    if (app != null && this.createModeTickerActive) {
      app.ticker.remove(this.handleCreateModeTicker)
    }

    this.createModeTickerActive = false
    this.syncAppTickerState()
  }

  private syncAppTickerState(): void {
    const app = this.app
    if (app == null) {
      return
    }

    if (this.createModeTickerActive || this.learnTickerActive) {
      if (!app.ticker.started) {
        app.ticker.start()
      }
      return
    }

    if (app.ticker.started) {
      app.ticker.stop()
    }
  }

  private ensureCameraReady(width: number, height: number): void {
    if (!cameraSystem.isInitialized()) {
      throw new RendererError('CameraSystem must be initialized before Renderer.init().', 'NOT_INITIALIZED')
    }

    this.syncViewportSize(width, height)
  }

  private syncViewportSize(width: number, height: number): void {
    const state = getAppState()
    if (state.viewportWidth === Math.round(width) && state.viewportHeight === Math.round(height)) {
      return
    }

    cameraSystem.setViewportSize(width, height)
  }

  private requireApp(): PIXI.Application {
    if (this.app == null) {
      throw new RendererError('Renderer has not been initialized.', 'NOT_INITIALIZED')
    }

    return this.app
  }

  private requireLayers(): RenderLayers {
    if (this.layers == null) {
      throw new RendererError('Renderer has not been initialized.', 'NOT_INITIALIZED')
    }

    return this.layers
  }

  private requireGraphic(graphic: PIXI.Graphics | null): PIXI.Graphics {
    if (graphic == null) {
      throw new RendererError('Renderer has not been initialized.', 'NOT_INITIALIZED')
    }

    return graphic
  }

  private assertInitialized(): void {
    if (!this.isInitialized || this.app == null || this.layers == null) {
      throw new RendererError('Renderer has not been initialized.', 'NOT_INITIALIZED')
    }
  }

  private startRenderLoop(): void {
    if (!this.isInitialized) {
      return
    }

    this.isRunning = true
    this.renderFrame(getAppState().currentTick)
  }

  private stopRenderLoop(): void {
    this.isRunning = false
  }

  private addSubscription(unsubscribe: () => void): void {
    this.subscriptions.push(unsubscribe)
  }

  private clearSubscriptions(): void {
    for (const unsubscribe of this.subscriptions.splice(0)) {
      unsubscribe()
    }
  }
}

function getProjectNoteCount(tracks: Track[]): number {
  let total = 0

  for (const track of tracks) {
    total += track.notes.length
  }

  return total
}

function getChordLevelHeight(chord: IndexedNote[], tempoMap: PrecomputedTempoMap): number {
  let levelHeight = 60

  for (const indexedNote of chord) {
    const noteHeight = Math.min(200, Math.max(60, (getNoteDurationMs(indexedNote.note, tempoMap) / 500) * 60))
    if (noteHeight > levelHeight) {
      levelHeight = noteHeight
    }
  }

  return levelHeight
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getCanvasResolution(): number {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
    return 1
  }

  return window.devicePixelRatio
}

function getLabelResolution(): number {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
    return 2
  }

  return Math.max(2, window.devicePixelRatio * 2)
}

function waitForRendererCleanupFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => resolve())
      return
    }

    globalThis.setTimeout(resolve, 0)
  })
}

function drawTopRoundedRect(
  graphic: PIXI.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const clampedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  graphic.moveTo(x, y + height)
  graphic.lineTo(x, y + clampedRadius)
  graphic.quadraticCurveTo(x, y, x + clampedRadius, y)
  graphic.lineTo(x + width - clampedRadius, y)
  graphic.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  graphic.lineTo(x + width, y + height)
  graphic.closePath()
}

function haveVisualizerSettingsChanged(
  nextState: ReturnType<typeof getAppState>,
  previousState: ReturnType<typeof getAppState>,
): boolean {
  return (
    nextState.backgroundColor !== previousState.backgroundColor ||
    nextState.colorMode !== previousState.colorMode ||
    nextState.gradientBottomColorLeft !== previousState.gradientBottomColorLeft ||
    nextState.gradientBottomColorLeftBlack !== previousState.gradientBottomColorLeftBlack ||
    nextState.gradientBottomColorRight !== previousState.gradientBottomColorRight ||
    nextState.gradientBottomColorRightBlack !== previousState.gradientBottomColorRightBlack ||
    nextState.gradientTopColor !== previousState.gradientTopColor ||
    nextState.leftHandColor !== previousState.leftHandColor ||
    nextState.noteLabelColor !== previousState.noteLabelColor ||
    nextState.noteGradientDirection !== previousState.noteGradientDirection ||
    nextState.noteLabelFormat !== previousState.noteLabelFormat ||
    nextState.noteLabelSize !== previousState.noteLabelSize ||
    nextState.noteLabelsOnKeys !== previousState.noteLabelsOnKeys ||
    nextState.noteLabelsOnNotes !== previousState.noteLabelsOnNotes ||
    nextState.noteStyle !== previousState.noteStyle ||
    nextState.pitchClassColors !== previousState.pitchClassColors ||
    nextState.rightHandColor !== previousState.rightHandColor ||
    nextState.splitPitch !== previousState.splitPitch ||
    nextState.velocityHighColor !== previousState.velocityHighColor ||
    nextState.velocityLowColor !== previousState.velocityLowColor
  )
}

function haveGradientTextureSettingsChanged(
  nextState: ReturnType<typeof getAppState>,
  previousState: ReturnType<typeof getAppState>,
): boolean {
  return (
    nextState.gradientBottomColorLeft !== previousState.gradientBottomColorLeft ||
    nextState.gradientBottomColorLeftBlack !== previousState.gradientBottomColorLeftBlack ||
    nextState.gradientBottomColorRight !== previousState.gradientBottomColorRight ||
    nextState.gradientBottomColorRightBlack !== previousState.gradientBottomColorRightBlack ||
    nextState.gradientTopColor !== previousState.gradientTopColor ||
    nextState.noteGradientDirection !== previousState.noteGradientDirection
  )
}

export const renderer = new Renderer()

export { RendererError }
export { isBlackKey, getWhiteKeyIndex, pitchToKeyX, getKeyAtScreenX }

function getActiveLearnHandFilter(state: ReturnType<typeof getAppState>): ReturnType<typeof getAppState>['learnV3']['sessionConfig']['hand'] | null {
  if (!state.learnV3.isActive || state.learnV3.sessionConfig.mode !== 'listen') {
    return null
  }

  return state.learnV3.sessionConfig.hand
}

function isNoteEligibleForLearnHand(
  pitch: number,
  hand: ReturnType<typeof getAppState>['learnV3']['sessionConfig']['hand'] | null,
): boolean {
  if (hand == null || hand === 'both') {
    return true
  }

  return isPitchIncludedForHand(pitch, hand)
}

function isPitchIncludedForHand(
  pitch: number,
  hand: ReturnType<typeof getAppState>['learnV3']['sessionConfig']['hand'],
): boolean {
  if (hand === 'left') {
    return pitch < 60
  }

  if (hand === 'right') {
    return pitch >= 60
  }

  return true
}

function getActiveLearnVisuals(state: ReturnType<typeof getAppState>): ReturnType<typeof getAppState>['learnVisuals'] | null {
  if (!state.learnV3.isActive) {
    return null
  }

  return state.learnVisuals
}

function resolveLearnNoteColor(
  pitch: number,
  visuals: ReturnType<typeof getAppState>['learnVisuals'],
): number {
  if (visuals.noteColor === 'white') {
    return 0xffffff
  }

  if (visuals.noteColor === 'custom') {
    return hexToPixi(visuals.leftHandColor)
  }

  return pitch < 60 ? hexToPixi(visuals.leftHandColor) : hexToPixi(visuals.rightHandColor)
}

