import { getAppState, subscribeToStore } from '../store/store'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { secondsToTick } from '../tempo/tempoMap'
import { PlaybackEngineError } from './errors'

export type PlaybackEventMap = {
  onTick: (tick: number) => void
  onPlay: () => void
  onPause: () => void
  onSeek: (tick: number) => void
  onEnded: () => void
}

type PlaybackListenerRegistry = {
  [K in keyof PlaybackEventMap]: Set<PlaybackEventMap[K]>
}

export class PlaybackEngine {
  private playStartRealTime = 0
  private playStartTick = 0
  private animFrameId: number | null = null
  private tempoMap: PrecomputedTempoMap | null = null
  private tempoMultiplier = 1
  private unsubscribeStore: (() => void) | null = null
  private initialized = false
  private listeners: PlaybackListenerRegistry = {
    onEnded: new Set(),
    onPause: new Set(),
    onPlay: new Set(),
    onSeek: new Set(),
    onTick: new Set(),
  }

  init(tempoMap: PrecomputedTempoMap): void {
    if (this.initialized) {
      throw new PlaybackEngineError('PlaybackEngine has already been initialized.', 'ALREADY_INITIALIZED')
    }

    this.tempoMap = tempoMap
    this.initialized = true
    this.unsubscribeStore = subscribeToStore((state, previousState) => {
      if (state.projectData !== previousState.projectData && state.projectData != null) {
        if (state.precomputedTempoMap != null) {
          this.tempoMap = state.precomputedTempoMap
        }

        this.seek(0)
      }
    })
  }

  destroy(): void {
    this.pause()
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.stopLoop()
    this.tempoMap = null
    this.tempoMultiplier = 1
    this.playStartRealTime = 0
    this.playStartTick = 0
    this.initialized = false
  }

  getCurrentTick(): number {
    return getAppState().currentTick
  }

  isPlaying(): boolean {
    return getAppState().isPlaying
  }

  async setTempoMultiplier(multiplier: number): Promise<void> {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new PlaybackEngineError('Tempo multiplier must be a positive finite number.', 'INVALID_TICK', {
        multiplier,
      })
    }

    const currentTick = this.getCurrentTick()
    const wasPlaying = this.isPlaying()

    if (wasPlaying) {
      this.pause()
    }

    this.tempoMultiplier = multiplier

    this.seek(currentTick)

    if (wasPlaying) {
      await new Promise<void>((resolve) => {
        queueMicrotask(() => {
          this.play()
          resolve()
        })
      })
    }
  }

  play(): void {
    this.assertInitialized()

    const state = getAppState()
    if (state.isPlaying) {
      return
    }

    this.playStartRealTime = performance.now()
    this.playStartTick = state.currentTick
    state.setIsPlaying(true)
    this.animFrameId = requestAnimationFrame(this.loop)
    this.emit('onPlay')
  }

  pause(): void {
    const state = getAppState()
    if (!state.isPlaying) {
      this.stopLoop()
      return
    }

    this.stopLoop()
    state.setIsPlaying(false)
    this.emit('onPause')
  }

  seek(tick: number): void {
    this.assertValidTick(tick)

    const state = getAppState()
    const totalTicks = state.projectData?.totalTicks ?? Number.POSITIVE_INFINITY
    const clampedTick = clampTick(tick, totalTicks)

    state.setCurrentTick(clampedTick)

    if (state.isPlaying) {
      this.playStartRealTime = performance.now()
      this.playStartTick = clampedTick
    }

    this.emit('onSeek', clampedTick)
  }

  on<K extends keyof PlaybackEventMap>(event: K, listener: PlaybackEventMap[K]): void {
    this.listeners[event].add(listener)
  }

  off<K extends keyof PlaybackEventMap>(event: K, listener: PlaybackEventMap[K]): void {
    this.listeners[event].delete(listener)
  }

  once<K extends keyof PlaybackEventMap>(event: K, listener: PlaybackEventMap[K]): void {
    const onceListener = ((...args: Parameters<PlaybackEventMap[K]>) => {
      this.off(event, onceListener as PlaybackEventMap[K])
      listener(...args)
    }) as PlaybackEventMap[K]

    this.on(event, onceListener)
  }

  emit<K extends keyof PlaybackEventMap>(
    event: K,
    ...args: Parameters<PlaybackEventMap[K]>
  ): void {
    for (const listener of [...this.listeners[event]]) {
      listener(...args)
    }
  }

  private update(realTimestamp: number): void {
    const state = getAppState()
    if (!state.isPlaying || this.tempoMap == null) {
      return
    }

    const elapsedMs = Math.max(0, realTimestamp - this.playStartRealTime)
    const elapsedTicks = secondsToTick((elapsedMs / 1000) * this.tempoMultiplier, this.tempoMap)
    const newTick = this.playStartTick + elapsedTicks
    const totalTicks = state.projectData?.totalTicks ?? Number.POSITIVE_INFINITY

    if (state.loopEnabled && newTick >= state.loopEndTick) {
      this.seek(state.loopStartTick)
      return
    }

    if (newTick >= totalTicks) {
      state.setCurrentTick(totalTicks)
      this.pause()
      this.emit('onEnded')
      return
    }

    state.setCurrentTick(newTick)
    this.emit('onTick', newTick)
  }

  private loop = (realTimestamp: number) => {
    this.update(realTimestamp)

    if (getAppState().isPlaying) {
      this.animFrameId = requestAnimationFrame(this.loop)
    }
  }

  private stopLoop(): void {
    if (this.animFrameId != null) {
      globalThis.cancelAnimationFrame?.(this.animFrameId)
      this.animFrameId = null
    }
  }

  private assertInitialized(): void {
    if (this.tempoMap == null || !this.initialized) {
      throw new PlaybackEngineError('PlaybackEngine has not been initialized.', 'NOT_INITIALIZED')
    }
  }

  private assertValidTick(tick: number): void {
    if (!Number.isFinite(tick)) {
      throw new PlaybackEngineError('Tick must be a finite number.', 'INVALID_TICK', {
        tick,
      })
    }
  }
}

function clampTick(tick: number, maxTick: number): number {
  const normalizedTick = Math.max(0, Math.floor(tick))
  return Math.min(normalizedTick, maxTick)
}

export const playbackEngine = new PlaybackEngine()
export { PlaybackEngineError }
