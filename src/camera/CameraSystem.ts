import { getAppState, subscribeToStore } from '../store/store'
import { secondsToTick } from '../tempo/tempoMap'
import { CameraError } from './errors'

const PIANO_MIN_PITCH = 21
const PIANO_MAX_PITCH = 108
const PIANO_PITCH_RANGE = PIANO_MAX_PITCH - PIANO_MIN_PITCH
const MIN_ZOOM = 0.1
const MAX_ZOOM = 50
const FALLBACK_TICKS_PER_VIEWPORT = 1920

export interface CameraViewport {
  minPitch: number
  maxPitch: number
  minTick: number
  maxTick: number
  worldZoom: number
  pixelsPerPitch: number
  pixelsPerTick: number
}

type ScreenPoint = {
  x: number
  y: number
}

type ScaleState = {
  pixelsPerPitch: number
  pixelsPerTick: number
}

export class CameraSystem {
  private initialized = false
  private unsubscribeStore: (() => void) | null = null

  isInitialized(): boolean {
    return this.initialized
  }

  init(viewportWidth: number, viewportHeight: number): void {
    if (this.initialized) {
      throw new CameraError('CameraSystem has already been initialized.', 'NOT_INITIALIZED')
    }

    this.assertValidViewport(viewportWidth, viewportHeight)

    const state = getAppState()
    state.setViewportSize(viewportWidth, viewportHeight)
    this.initialized = true
    this.unsubscribeStore = subscribeToStore(() => {
      // The camera reads zoom/pan/viewport directly from the store on every query.
      // This subscription ensures lifecycle symmetry with external camera updates.
    })
    this.resetCamera()
  }

  destroy(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.initialized = false
  }

  worldToScreen(worldX: number, worldY: number): ScreenPoint {
    this.assertInitialized()

    const state = getAppState()
    const { pixelsPerPitch, pixelsPerTick } = this.getScaleState()

    return {
      x: (worldX - state.panX) * (pixelsPerPitch * state.worldZoom),
      y: (worldY - state.panY) * (pixelsPerTick * state.worldZoom),
    }
  }

  screenToWorld(screenX: number, screenY: number): ScreenPoint {
    this.assertInitialized()

    const state = getAppState()
    const { pixelsPerPitch, pixelsPerTick } = this.getScaleState()

    return {
      x: screenX / (pixelsPerPitch * state.worldZoom) + state.panX,
      y: screenY / (pixelsPerTick * state.worldZoom) + state.panY,
    }
  }

  zoom(factor: number, centerScreenX: number, centerScreenY: number): void {
    this.assertInitialized()

    if (!Number.isFinite(factor)) {
      throw new CameraError('Zoom factor must be finite.', 'INVALID_ZOOM', { factor })
    }

    if (factor === 1) {
      return
    }

    const state = getAppState()
    this.zoomInternal(clamp(state.worldZoom * factor, MIN_ZOOM, MAX_ZOOM), centerScreenX, centerScreenY)
  }

  zoomTo(level: number, centerScreenX: number, centerScreenY: number): void {
    this.assertInitialized()

    if (!Number.isFinite(level)) {
      throw new CameraError('Zoom level must be finite.', 'INVALID_ZOOM', { level })
    }

    this.zoomInternal(clamp(level, MIN_ZOOM, MAX_ZOOM), centerScreenX, centerScreenY)
  }

  panBy(dx: number, dy: number): void {
    this.assertInitialized()

    const state = getAppState()
    const { pixelsPerPitch, pixelsPerTick } = this.getScaleState()
    const nextPanX = state.panX - dx / (pixelsPerPitch * state.worldZoom)
    const nextPanY = state.panY - dy / (pixelsPerTick * state.worldZoom)

    state.setPan(nextPanX, nextPanY)
  }

  panTo(worldX: number, worldY: number): void {
    this.assertInitialized()
    getAppState().setPan(worldX, worldY)
  }

  resetCamera(): void {
    this.assertInitialized()

    getAppState().batchUpdate((state) => {
      state.worldZoom = 1
      state.panX = PIANO_MIN_PITCH
      state.panY = 0
    })
  }

  getViewport(): CameraViewport {
    this.assertInitialized()

    const state = getAppState()
    const topLeft = this.screenToWorld(0, 0)
    const bottomRight = this.screenToWorld(state.viewportWidth, state.viewportHeight)
    const { pixelsPerPitch, pixelsPerTick } = this.getScaleState()

    return {
      maxPitch: bottomRight.x,
      maxTick: bottomRight.y,
      minPitch: topLeft.x,
      minTick: topLeft.y,
      pixelsPerPitch,
      pixelsPerTick,
      worldZoom: state.worldZoom,
    }
  }

  isVisible(worldX: number, worldY: number): boolean {
    this.assertInitialized()

    const viewport = this.getViewport()
    return (
      worldX >= viewport.minPitch &&
      worldX <= viewport.maxPitch &&
      worldY >= viewport.minTick &&
      worldY <= viewport.maxTick
    )
  }

  isRectVisible(worldX: number, worldY: number, worldW: number, worldH: number): boolean {
    this.assertInitialized()

    const viewport = this.getViewport()
    const rectLeft = Math.min(worldX, worldX + worldW)
    const rectRight = Math.max(worldX, worldX + worldW)
    const rectTop = Math.min(worldY, worldY + worldH)
    const rectBottom = Math.max(worldY, worldY + worldH)

    return !(
      rectRight < viewport.minPitch ||
      rectLeft > viewport.maxPitch ||
      rectBottom < viewport.minTick ||
      rectTop > viewport.maxTick
    )
  }

  setViewportSize(width: number, height: number): void {
    this.assertInitialized()
    this.assertValidViewport(width, height)

    const state = getAppState()
    const nextWidth = Math.round(width)
    const nextHeight = Math.round(height)

    if (state.viewportWidth === nextWidth && state.viewportHeight === nextHeight) {
      return
    }

    state.setViewportSize(nextWidth, nextHeight)
  }

  getRenderScale(): number {
    this.assertInitialized()
    return getAppState().renderScale
  }

  private zoomInternal(level: number, centerScreenX: number, centerScreenY: number): void {
    const worldCenter = this.screenToWorld(centerScreenX, centerScreenY)
    const { pixelsPerPitch, pixelsPerTick } = this.getScaleState()

    getAppState().batchUpdate((state) => {
      state.worldZoom = level
      state.panX = worldCenter.x - centerScreenX / (pixelsPerPitch * level)
      state.panY = worldCenter.y - centerScreenY / (pixelsPerTick * level)
    })
  }

  private getScaleState(): ScaleState {
    const state = getAppState()
    const pixelsPerPitch = state.viewportWidth / PIANO_PITCH_RANGE
    const pixelsPerTick = this.getPixelsPerTick()

    return {
      pixelsPerPitch,
      pixelsPerTick,
    }
  }

  private getPixelsPerTick(): number {
    const state = getAppState()
    const tempoMap = state.precomputedTempoMap

    if (tempoMap == null) {
      return state.viewportHeight / FALLBACK_TICKS_PER_VIEWPORT
    }

    const ticksPerViewport = secondsToTick(4, tempoMap)
    if (!Number.isFinite(ticksPerViewport) || ticksPerViewport <= 0) {
      return state.viewportHeight / FALLBACK_TICKS_PER_VIEWPORT
    }

    return state.viewportHeight / ticksPerViewport
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new CameraError('CameraSystem has not been initialized.', 'NOT_INITIALIZED')
    }
  }

  private assertValidViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new CameraError('Viewport dimensions must be positive finite numbers.', 'INVALID_VIEWPORT', {
        height,
        width,
      })
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const cameraSystem = new CameraSystem()
export { CameraError }
