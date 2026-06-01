import * as PIXI from 'pixi.js'

import { cameraSystem } from '../camera/CameraSystem'
import { effectsLayer } from '../effects/EffectsLayer'
import type { Track } from '../midi/types'
import { type PlaybackEventMap, playbackEngine } from '../playback/PlaybackEngine'
import { type IndexedNote, spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore } from '../store/store'
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
import { hexToPixi, pixiToHex, resolveNoteColor, resolveNoteGradientColors } from './colorUtils'
import { getNoteScreenRect, getVisibleTickWindow } from './noteMotion'
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
export interface RenderLayers {
  background: PIXI.Container
  laneLines: PIXI.Container
  keyboard: PIXI.Container
  keyboardGlow: PIXI.Container
  noteByNote: PIXI.Container
  notes: PIXI.Container
  hitLine: PIXI.Container
  overlay: PIXI.Container
}

interface NoteByNoteRenderEntry {
  alpha: number
  baseY: number
  graphic: PIXI.Graphics
  label: PIXI.Text
  noteId: string
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
    compactFill: 0xffffff,
    dropShadow: false,
    fill: 0xffffff,
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    prewarmCount: 48,
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
  private isInitialized = false
  private unsubscribeStore: (() => void) | null = null
  private backgroundGraphic: PIXI.Graphics | null = null
  private laneLineGraphic: PIXI.Graphics | null = null
  private hitLineGraphic: PIXI.Graphics | null = null
  private keyboardBackingGraphic: PIXI.Graphics | null = null
  private overlayDrawCallback: ((currentTick: number) => void) | null = null
  private keyLabelsDirty = true
  private isRunning = false
  private noteByNoteEntries: NoteByNoteRenderEntry[] = []
  private chordCorrectAnimation:
    | {
      durationMs: number
      elapsedMs: number
      entries: NoteByNoteRenderEntry[]
    }
    | null = null
  private keyFlashAnimations = new Map<number, { color: number; remainingMs: number }>()
  private learnTickerActive = false

  private readonly handleTick: PlaybackEventMap['onTick'] = (currentTick) => {
    if (getAppState().isPlaying && !this.isRunning) {
      this.startRenderLoop()
      return
    }

    this.renderFrame(currentTick)
  }

  private readonly handleSeek: PlaybackEventMap['onSeek'] = (currentTick) => {
    effectsLayer.seek(currentTick)
    this.renderFrame(currentTick)
  }

  private readonly handleEnded: PlaybackEventMap['onEnded'] = () => {
    this.renderFrame(getAppState().currentTick)
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
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
        backgroundColor: 0x0a0a0f,
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
    effectsLayer.init(this.layers)
    effectsLayer.reset()

    this.app.stage.addChild(
      this.layers.background,
      this.layers.laneLines,
      this.layers.keyboard,
      this.layers.keyboardGlow,
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

    if (state.projectData != null) {
      const projectNoteCount = getProjectNoteCount(state.projectData.tracks)
      this.notePool.prewarm(projectNoteCount * 2)
      this.gradientSpritePool.prewarm(projectNoteCount)
    }

    this.unsubscribeStore = subscribeToStore((nextState, previousState) => {
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
          nextState.learnV3.currentChordIndex !== previousState.learnV3.currentChordIndex ||
          nextState.learnV3.fingerNumbers !== previousState.learnV3.fingerNumbers ||
          nextState.learnV3.sessionConfig.mode !== previousState.learnV3.sessionConfig.mode
        )
      ) {
        if (!nextState.learnV3.isActive) {
          this.chordCorrectAnimation = null
          this.keyFlashAnimations.clear()
          this.stopLearnTicker()
        }

        this.renderFrame(nextState.currentTick)
      }

      if (nextState.isPlaying !== previousState.isPlaying) {
        if (nextState.isPlaying && !this.isRunning) {
          this.startRenderLoop()
        }

        if (!nextState.isPlaying && this.isRunning) {
          this.stopRenderLoop()
        }
      }
    })

    playbackEngine.on('onTick', this.handleTick)
    playbackEngine.on('onSeek', this.handleSeek)
    playbackEngine.on('onEnded', this.handleEnded)

    this.isInitialized = true

    if (state.isPlaying) {
      this.startRenderLoop()
      return
    }

    this.renderFrame(state.currentTick)
  }

  destroy(): void {
    const app = this.app
    this.isInitialized = false
    this.stopRenderLoop()

    playbackEngine.off('onTick', this.handleTick)
    playbackEngine.off('onSeek', this.handleSeek)
    playbackEngine.off('onEnded', this.handleEnded)

    this.unsubscribeStore?.()
    this.unsubscribeStore = null

    effectsLayer.destroy()

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
    this.stopLearnTicker()
    this.noteByNoteEntries = []
    this.chordCorrectAnimation = null
    this.keyFlashAnimations.clear()
    this.overlayDrawCallback = null
    this.keyLabelsDirty = true

    this.backgroundGraphic = null
    this.laneLineGraphic = null
    this.hitLineGraphic = null
    this.keyboardBackingGraphic = null

    app?.destroy(true, { baseTexture: true, children: true, texture: true })
    this.app = null
    this.layers = null
  }

  isReady(): boolean {
    return this.isInitialized && this.app != null
  }

  getOverlayLayer(): PIXI.Container {
    return this.requireLayers().overlay
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

    const app = this.requireApp()
    const visibleNotes = this.updateNotes(currentTick)
    this.updateNoteByNoteLayer()
    effectsLayer.update(currentTick, visibleNotes, app.screen.width, app.screen.height)
    this.overlayDrawCallback?.(currentTick)
    this.updateKeyboard(currentTick)
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

    const animatedEntries = this.noteByNoteEntries.filter((entry) => noteIds.includes(entry.noteId))
    if (animatedEntries.length === 0) {
      return
    }

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
    this.keyLabelsDirty = true
    this.renderFrame(getAppState().currentTick)
  }

  private drawBackground(): void {
    const app = this.requireApp()
    const backgroundGraphic = this.requireGraphic(this.backgroundGraphic)
    const backgroundColor = hexToPixi(getAppState().backgroundColor)

    backgroundGraphic.clear()
    backgroundGraphic.beginFill(backgroundColor, 1)
    backgroundGraphic.drawRect(0, 0, app.screen.width, app.screen.height)
    backgroundGraphic.endFill()
  }

  private drawLaneLines(): void {
    const app = this.requireApp()
    const laneLineGraphic = this.requireGraphic(this.laneLineGraphic)
    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const noteFieldHeight = keyboardY
    const laneAlpha = (getAppState().laneOpacity / 100) * 0.15

    laneLineGraphic.clear()
    laneLineGraphic.lineStyle(1, LANE_LINE_COLOR, laneAlpha)

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      if (!isBlackKey(pitch)) {
        const x = pitchToKeyX(pitch, app.screen.width)
        laneLineGraphic.moveTo(x, 0)
        laneLineGraphic.lineTo(x, noteFieldHeight)
      }
    }
  }

  private drawHitLine(): void {
    const app = this.requireApp()
    const hitLineGraphic = this.requireGraphic(this.hitLineGraphic)
    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const hitLineY = keyboardY - HIT_LINE_HEIGHT

    hitLineGraphic.clear()
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
    const { keyboardHeight, keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const backingY = Math.round(keyboardY - 2)
    const backingWidth = Math.round(app.screen.width)
    const backingHeight = Math.round(keyboardHeight + 2)

    keyboardBackingGraphic.clear()
    keyboardBackingGraphic.beginFill(KEYBOARD_BACKING_COLOR, 1)
    keyboardBackingGraphic.drawRect(0, backingY, backingWidth, backingHeight)
    keyboardBackingGraphic.endFill()
  }

  private updateNotes(currentTick: number): IndexedNote[] {
    const app = this.requireApp()
    const state = getAppState()
    const learnHand = getActiveLearnHandFilter(state)

    this.notePool.releaseAll()
    this.gradientSpritePool.releaseAll()
    this.noteLabelPool.releaseAll()
    this.fingeringLabelPool.releaseAll()

    if (state.projectData == null || state.precomputedTempoMap == null) {
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
    const noteColor = resolveNoteColor(indexedNote.note, indexedNote.trackId, state)
    const isActive = currentTick >= indexedNote.note.startTick && currentTick <= indexedNote.note.visualEndTick
    const isSelected = selectedNoteIds.has(indexedNote.note.id)
    const isHovered = hoveredNoteId === indexedNote.note.id

    let brightness = 1
    if (isHovered) {
      brightness = Math.max(brightness, HOVERED_NOTE_FILL_BRIGHTNESS)
    }
    if (isSelected) {
      brightness = Math.max(brightness, SELECTED_NOTE_FILL_BRIGHTNESS)
    }
    if (isActive) {
      brightness = Math.max(brightness, NOTE_ACTIVE_BRIGHTNESS)
    }

    const fillColor = brightness === 1 ? noteColor : brightenColor(noteColor, brightness)
    const noteAlpha = noteIsBlack ? BLACK_KEY_NOTE_ALPHA : NOTE_ALPHA

    if (noteStyle === 'gradient') {
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

      if (state.effectsEnabled.layeredGlow) {
        const glowGraphic = this.notePool.acquire()
        glowGraphic.clear()
        this.drawNoteInnerGlow(
          glowGraphic,
          adjustedRect.x,
          adjustedRect.y,
          adjustedRect.w,
          adjustedRect.h,
          noteAlpha,
        )
        layers.notes.addChild(glowGraphic)
      }
    } else {
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
        state.effectsEnabled.layeredGlow,
      )
      layers.notes.addChild(graphic)
    }

    if (state.noteLabelsOnNotes) {
      const label = this.noteLabelPool.acquire(adjustedRect.w < 14)
      label.text = getNoteLabel(indexedNote.note.pitch, state.noteLabelFormat)
      label.x = adjustedRect.x + (adjustedRect.w / 2)
      label.y = adjustedRect.y + (adjustedRect.h / 2)
      label.resolution = getLabelResolution()

      if (adjustedRect.w < 8 || adjustedRect.h < 8 || (noteIsBlack && adjustedRect.h < 20)) {
        label.visible = false
      } else {
        const configuredFontSize = Math.max(8, state.noteLabelSize)
        const fittedFontSize = Math.min(
          configuredFontSize,
          Math.floor(adjustedRect.w * 0.7),
          Math.floor(adjustedRect.h * 0.6),
        )
        const visibleFontSize = Math.max(6, fittedFontSize)
        label.visible = true
        label.scale.set(visibleFontSize / configuredFontSize)
      }

      layers.notes.addChild(label)
    }

    if (
      state.learnV3.isActive &&
      (state.learnV3.sessionConfig.mode === 'listen' || state.learnV3.sessionConfig.mode === 'playAlong') &&
      adjustedRect.h > 20
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
    const blackKeyWidth = Math.max(1, Math.round(getBlackKeyWidth(app.screen.width)))
    const blackKeyHeight = Math.max(1, Math.round(keyboardHeight * BLACK_KEY_HEIGHT_RATIO))
    const activeNotesByPitch = this.getActiveNotesByPitch(currentTick)

    for (const entry of this.keyboardPool.getEntries()) {
      const activeNote = activeNotesByPitch.get(entry.pitch) ?? null
      const whiteKeyBounds = entry.isBlack ? null : getWhiteKeyBounds(entry.pitch, app.screen.width)
      const keyWidth = entry.isBlack ? blackKeyWidth : whiteKeyBounds.width
      const keyHeight = entry.isBlack ? blackKeyHeight : Math.round(keyboardHeight)
      const keyX = entry.isBlack ? Math.round(pitchToKeyX(entry.pitch, app.screen.width)) : whiteKeyBounds.x

      this.drawKeyboardKey(entry, keyX, keyboardY, keyWidth, keyHeight, activeNote, state)
    }

    this.updateKeyboardLabels(app.screen.width, app.screen.height, state)
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
    const layers = this.requireLayers()
    const state = getAppState()

    this.noteByNoteRectPool.releaseAll()
    this.noteByNoteLabelPool.releaseAll()
    this.noteByNoteEntries = []

    if (!this.isNoteByNoteModeActive(state) || state.projectData == null) {
      layers.noteByNote.visible = false
      return
    }

    const app = this.requireApp()
    const chordGroups = this.getChordGroups(state.projectData.tracks)
    const currentGroupIndex = state.learnV3.currentChordIndex
    const currentChord = chordGroups[currentGroupIndex]

    if (currentChord == null) {
      layers.noteByNote.visible = false
      return
    }

    layers.noteByNote.visible = true

    const { keyboardY } = getKeyboardLayoutMetrics(app.screen.height)
    const chordDefinitions = [
      { alpha: 1, height: 40, index: currentGroupIndex, offset: 0 },
      { alpha: 0.6, height: 28, index: currentGroupIndex + 1, offset: 1 },
      { alpha: 0.3, height: 28, index: currentGroupIndex + 2, offset: 2 },
    ] as const

    for (const definition of chordDefinitions) {
      const chord = chordGroups[definition.index]
      if (chord == null) {
        continue
      }

      const y = keyboardY - 12 - definition.height - (definition.offset * 40)
      for (const indexedNote of chord) {
        const pitch = indexedNote.note.pitch
        const keyBounds = isBlackKey(pitch)
          ? {
            width: Math.max(1, Math.round(getBlackKeyWidth(app.screen.width))),
            x: Math.round(pitchToKeyX(pitch, app.screen.width)),
          }
          : getWhiteKeyBounds(pitch, app.screen.width)
        const graphic = this.noteByNoteRectPool.acquire()
        const noteColor = resolveNoteColor(indexedNote.note, indexedNote.trackId, state)
        graphic.clear()
        graphic.alpha = definition.alpha
        graphic.x = 0
        graphic.y = 0
        this.drawStyledNote(
          graphic,
          keyBounds.x,
          y,
          keyBounds.width,
          definition.height,
          noteColor,
          'solid',
          definition.alpha,
          false,
        )
        layers.noteByNote.addChild(graphic)

        const label = this.noteByNoteLabelPool.acquire(definition.height < 32)
        const fingerNumber = state.learnV3.fingerNumbers[indexedNote.note.id]
        label.text = fingerNumber == null
          ? getNoteLabel(pitch, 'nameOctave')
          : `${getNoteLabel(pitch, 'nameOctave')} ${fingerNumber}`
        label.x = keyBounds.x + (keyBounds.width / 2)
        label.y = y + (definition.height / 2)
        label.alpha = definition.alpha
        label.scale.set(definition.height < 32 ? 0.85 : 1)
        label.resolution = getLabelResolution()
        layers.noteByNote.addChild(label)

        if (definition.offset === 0) {
          this.noteByNoteEntries.push({
            alpha: definition.alpha,
            baseY: y,
            graphic,
            label,
            noteId: indexedNote.note.id,
          })
        }
      }
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
    layeredGlowEnabled: boolean,
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

      const innerGlowWidth = Math.min(width, 8)
      const innerGlowX = x + ((width - innerGlowWidth) / 2)
      graphic.beginFill(0xffffff, 0.35 * alpha)
      graphic.drawRect(innerGlowX, y, innerGlowWidth, height)
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

    if (layeredGlowEnabled) {
      this.drawNoteInnerGlow(graphic, x, y, width, height, alpha)
    }
  }

  private drawNoteInnerGlow(
    graphic: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
  ): void {
    if (width < 8) {
      return
    }

    const coreWidth = Math.min(width, Math.max(2, Math.min(4, width * 0.2)))
    const midWidth = Math.min(width, 6)
    const outerWidth = Math.min(width, 12)

    this.drawCenteredInnerGlowBand(graphic, x, y, width, height, outerWidth, 0.05 * alpha)
    this.drawCenteredInnerGlowBand(graphic, x, y, width, height, midWidth, 0.15 * alpha)
    this.drawCenteredInnerGlowBand(graphic, x, y, width, height, coreWidth, 0.3 * alpha)
  }

  private drawCenteredInnerGlowBand(
    graphic: PIXI.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    bandWidth: number,
    alpha: number,
  ): void {
    const glowX = x + ((width - bandWidth) / 2)
    const radius = Math.min(NOTE_CORNER_RADIUS, bandWidth / 2, height / 2)

    graphic.beginFill(0xffffff, alpha)
    drawTopRoundedRect(graphic, glowX, y, bandWidth, height, radius)
    graphic.endFill()
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

    if (!state.noteLabelsOnKeys) {
      return
    }

    const keyboardLayer = this.requireLayers().keyboard
    const labelY = canvasHeight - 8

    for (const entry of this.keyboardPool.getWhiteEntries()) {
      const whiteKeyBounds = getWhiteKeyBounds(entry.pitch, canvasWidth)
      const label = this.keyLabelPool.acquire()
      label.text = getNoteLabel(entry.pitch, state.noteLabelFormat)
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

    this.noteLabelPool.updateStyles({
      compactFill: hexToPixi(state.noteLabelColor),
      compactFontSize: Math.max(8, state.noteLabelSize - 1),
      fill: hexToPixi(state.noteLabelColor),
      fontFamily: 'Arial, sans-serif',
      fontSize: state.noteLabelSize,
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
      compactFill: 0xffffff,
      compactFontSize: 10,
      dropShadow: false,
      fill: 0xffffff,
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fontWeight: 'bold',
      resolution: textResolution,
    })

    this.keyLabelPool.updateStyles({
      dropShadow: false,
      fill: hexToPixi(state.noteLabelColor),
      fontFamily: 'Arial, sans-serif',
      fontSize: state.noteLabelSize,
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
      keyboardGlow: new PIXI.Container(),
      laneLines: new PIXI.Container(),
      noteByNote: new PIXI.Container(),
      notes: new PIXI.Container(),
      overlay: new PIXI.Container(),
    }
  }

  private getChordGroups(tracks: Track[]): IndexedNote[][] {
    const flattenedNotes: IndexedNote[] = []

    tracks.forEach((track, trackIndex) => {
      for (const note of track.notes) {
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
    app.ticker.start()
    this.learnTickerActive = true
  }

  private stopLearnTicker(): void {
    const app = this.app
    if (app != null && this.learnTickerActive) {
      app.ticker.remove(this.handleLearnTicker)
      if (app.ticker.started) {
        app.ticker.stop()
      }
    }

    this.learnTickerActive = false
  }

  private hasActiveLearnAnimations(): boolean {
    return this.chordCorrectAnimation != null || this.keyFlashAnimations.size > 0
  }

  private readonly handleLearnTicker = (ticker: PIXI.Ticker): void => {
    const state = getAppState()
    if (!state.learnV3.isActive) {
      this.chordCorrectAnimation = null
      this.keyFlashAnimations.clear()
      this.stopLearnTicker()
      return
    }

    const elapsedMs = Number.isFinite(ticker.elapsedMS) ? ticker.elapsedMS : 16.6667

    if (this.chordCorrectAnimation != null) {
      this.chordCorrectAnimation.elapsedMs += elapsedMs
      const progress = Math.min(1, this.chordCorrectAnimation.elapsedMs / this.chordCorrectAnimation.durationMs)

      for (const entry of this.chordCorrectAnimation.entries) {
        const nextAlpha = entry.alpha * (1 - progress)
        entry.graphic.alpha = nextAlpha
        entry.label.alpha = nextAlpha
        entry.graphic.y = progress * 20
        entry.label.y = entry.baseY + progress * 20
      }

      if (progress >= 1) {
        this.chordCorrectAnimation = null
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
}

function getProjectNoteCount(tracks: Track[]): number {
  let total = 0

  for (const track of tracks) {
    total += track.notes.length
  }

  return total
}

function brightenColor(color: number, brightness: number): number {
  const red = Math.min(255, Math.round(((color >> 16) & 0xff) * brightness))
  const green = Math.min(255, Math.round(((color >> 8) & 0xff) * brightness))
  const blue = Math.min(255, Math.round((color & 0xff) * brightness))

  return (red << 16) | (green << 8) | blue
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
    nextState.bloomEnabled !== previousState.bloomEnabled ||
    nextState.bloomRadius !== previousState.bloomRadius ||
    nextState.bloomStrength !== previousState.bloomStrength ||
    nextState.colorMode !== previousState.colorMode ||
    nextState.effectsEnabled.layeredGlow !== previousState.effectsEnabled.layeredGlow ||
    nextState.gradientBottomColorLeft !== previousState.gradientBottomColorLeft ||
    nextState.gradientBottomColorLeftBlack !== previousState.gradientBottomColorLeftBlack ||
    nextState.gradientBottomColorRight !== previousState.gradientBottomColorRight ||
    nextState.gradientBottomColorRightBlack !== previousState.gradientBottomColorRightBlack ||
    nextState.gradientTopColor !== previousState.gradientTopColor ||
    nextState.keyGlowEnabled !== previousState.keyGlowEnabled ||
    nextState.keyGlowIntensity !== previousState.keyGlowIntensity ||
    nextState.leftHandColor !== previousState.leftHandColor ||
    nextState.noteLabelColor !== previousState.noteLabelColor ||
    nextState.noteGradientDirection !== previousState.noteGradientDirection ||
    nextState.noteLabelFormat !== previousState.noteLabelFormat ||
    nextState.noteLabelSize !== previousState.noteLabelSize ||
    nextState.noteLabelsOnKeys !== previousState.noteLabelsOnKeys ||
    nextState.noteLabelsOnNotes !== previousState.noteLabelsOnNotes ||
    nextState.noteStyle !== previousState.noteStyle ||
    nextState.particleCount !== previousState.particleCount ||
    nextState.particleSize !== previousState.particleSize ||
    nextState.particlesEnabled !== previousState.particlesEnabled ||
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

  if (hand === 'left') {
    return pitch < 60
  }

  return pitch >= 60
}
