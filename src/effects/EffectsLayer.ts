import { BloomFilter } from '@pixi/filter-bloom'
import * as PIXI from 'pixi.js'

import type { IndexedNote } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore } from '../store/store'
import {
  BLACK_KEY_ACTIVE_ALPHA,
  KEYBOARD_HEIGHT,
  KEY_GLOW_ALPHA_END,
  KEY_GLOW_ALPHA_START,
  KEY_GLOW_HEIGHT,
  KEY_GLOW_STEPS,
  KEY_GLOW_WIDTH_STEP,
  KEY_GLOW_X_STEP,
  WHITE_KEY_ACTIVE_ALPHA,
} from '../renderer/layoutConstants'
import { resolveNoteColor } from '../renderer/colorUtils'
import type { RenderLayers } from '../renderer/Renderer'
import {
  getBlackKeyWidth,
  getWhiteKeyWidth,
  isBlackKey,
  pitchToKeyX,
} from '../renderer/pianoMath'
import { EffectsLayerError } from './errors'
import { ParticlePool } from './ParticlePool'

const BLOOM_STRENGTH = 10
const BLOOM_QUALITY = 4
const BLOOM_RADIUS = 32

type RuntimeBloomFilter = BloomFilter & {
  blur: number
  blurXFilter?: {
    quality?: number
    strength?: number
  }
  blurYFilter?: {
    quality?: number
    strength?: number
  }
}

export class EffectsLayer {
  private particlePool = new ParticlePool()
  private particleContainer: PIXI.Container | null = null
  private keyGlowGraphic: PIXI.Graphics | null = null
  private bloomFilter: BloomFilter | null = null
  private noteLayer: PIXI.Container | null = null
  private spawnedNoteIds = new Set<string>()
  private lastTick = 0
  private isInitialized = false
  private unsubscribeStore: (() => void) | null = null

  init(layers: RenderLayers): void {
    if (this.isInitialized) {
      throw new EffectsLayerError('EffectsLayer has already been initialized.', 'NOT_INITIALIZED')
    }

    this.noteLayer = layers.notes
    this.particleContainer = new PIXI.Container()
    this.keyGlowGraphic = new PIXI.Graphics()
    layers.laneLines.addChild(this.keyGlowGraphic)
    layers.overlay.addChild(this.particleContainer)

    this.bloomFilter = new BloomFilter({
      quality: BLOOM_QUALITY,
      radius: BLOOM_RADIUS,
      strength: BLOOM_STRENGTH,
    })

    this.applyEffectToggles()
    this.lastTick = getAppState().currentTick

    this.unsubscribeStore = subscribeToStore((state, previousState) => {
      if (
        state.bloomEnabled !== previousState.bloomEnabled ||
        state.bloomRadius !== previousState.bloomRadius ||
        state.bloomStrength !== previousState.bloomStrength ||
        state.particleCount !== previousState.particleCount ||
        state.particleSize !== previousState.particleSize ||
        state.particlesEnabled !== previousState.particlesEnabled ||
        state.keyGlowEnabled !== previousState.keyGlowEnabled ||
        state.keyGlowIntensity !== previousState.keyGlowIntensity ||
        state.showBloom !== previousState.showBloom ||
        state.showParticles !== previousState.showParticles
      ) {
        this.applyEffectToggles()
      }

      if (state.projectData !== previousState.projectData) {
        this.seek(state.currentTick)
      }
    })

    this.isInitialized = true
  }

  destroy(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null

    this.particlePool.clear()
    this.spawnedNoteIds.clear()

    if (this.particleContainer?.parent != null) {
      this.particleContainer.parent.removeChild(this.particleContainer)
    }

    this.particleContainer?.destroy({ children: true })
    this.particleContainer = null

    if (this.keyGlowGraphic?.parent != null) {
      this.keyGlowGraphic.parent.removeChild(this.keyGlowGraphic)
    }

    this.keyGlowGraphic?.destroy()
    this.keyGlowGraphic = null

    if (this.noteLayer != null) {
      this.noteLayer.filters = []
    }

    this.noteLayer = null
    this.bloomFilter = null
    this.lastTick = 0
    this.isInitialized = false
  }

  update(
    currentTick: number,
    visibleNotes: IndexedNote[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    this.assertInitialized()

    this.applyEffectToggles()
    this.drawKeyGlows(currentTick, visibleNotes, canvasWidth, canvasHeight)
    this.detectNoteHits(currentTick, visibleNotes, canvasWidth, canvasHeight)

    if (this.particleContainer != null) {
      this.particlePool.update(currentTick, this.particleContainer)
    }

    this.lastTick = currentTick
  }

  seek(tick: number): void {
    this.spawnedNoteIds.clear()
    this.particlePool.clear()
    this.lastTick = Math.max(0, Math.floor(tick))
  }

  private detectNoteHits(
    currentTick: number,
    visibleNotes: IndexedNote[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const state = getAppState()
    if (!state.showParticles || !state.particlesEnabled) {
      return
    }

    const keyboardTopY = Math.round(canvasHeight - KEYBOARD_HEIGHT)
    const rangeStart = Math.min(this.lastTick, currentTick)
    const rangeEnd = Math.max(this.lastTick, currentTick)

    for (const indexedNote of visibleNotes) {
      const { note } = indexedNote
      if (note.startTick < rangeStart || note.startTick > rangeEnd) {
        continue
      }

      if (this.spawnedNoteIds.has(note.id)) {
        continue
      }

      const keyWidth = Math.max(
        1,
        Math.round(
          isBlackKey(note.pitch)
            ? getBlackKeyWidth(canvasWidth)
            : getWhiteKeyWidth(canvasWidth),
        ),
      )
      const keyX = Math.round(pitchToKeyX(note.pitch, canvasWidth)) + (keyWidth / 2)
      const color = resolveNoteColor(note, indexedNote.trackId, state)
      this.particlePool.setBurstConfig(state.particleCount, state.particleSize / 50)
      this.particlePool.spawnBurst(keyX, keyboardTopY, color, currentTick)
      this.spawnedNoteIds.add(note.id)
    }
  }

  private drawKeyGlows(
    currentTick: number,
    visibleNotes: IndexedNote[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const glowGraphic = this.keyGlowGraphic
    if (glowGraphic == null) {
      return
    }

    glowGraphic.clear()

    const state = getAppState()
    const keyTopY = Math.round(canvasHeight - KEYBOARD_HEIGHT)

    if (!state.keyGlowEnabled) {
      return
    }

    for (const indexedNote of visibleNotes) {
      const { note } = indexedNote

      if (note.startTick > currentTick || note.visualEndTick < currentTick) {
        continue
      }

      const color = resolveNoteColor(note, indexedNote.trackId, state)
      const keyWidth = Math.max(
        1,
        Math.round(
          isBlackKey(note.pitch)
            ? getBlackKeyWidth(canvasWidth)
            : getWhiteKeyWidth(canvasWidth),
        ),
      )
      const intensity = state.keyGlowIntensity / 100
      const baseGlowAlpha = isBlackKey(note.pitch)
        ? BLACK_KEY_ACTIVE_ALPHA * KEY_GLOW_ALPHA_START * intensity
        : WHITE_KEY_ACTIVE_ALPHA * KEY_GLOW_ALPHA_START * intensity
      const keyX = Math.round(pitchToKeyX(note.pitch, canvasWidth))
      const stepHeight = KEY_GLOW_HEIGHT / KEY_GLOW_STEPS

      for (let index = 0; index < KEY_GLOW_STEPS; index += 1) {
        const mix = KEY_GLOW_STEPS === 1 ? 1 : index / (KEY_GLOW_STEPS - 1)
        const alpha = baseGlowAlpha + ((KEY_GLOW_ALPHA_END - baseGlowAlpha) * mix)
        const glowWidth = Math.round(keyWidth + (index * KEY_GLOW_WIDTH_STEP))
        const glowX = Math.round(keyX - (index * KEY_GLOW_X_STEP))
        const glowY = Math.round(keyTopY - ((index + 1) * stepHeight))

        glowGraphic.beginFill(color, Math.max(0, alpha))
        glowGraphic.drawRect(glowX, glowY, glowWidth, Math.round(stepHeight))
        glowGraphic.endFill()
      }
    }
  }

  private applyEffectToggles(): void {
    const state = getAppState()

    if (this.noteLayer != null && this.bloomFilter != null) {
      const runtimeBloomFilter = this.bloomFilter as RuntimeBloomFilter
      const bloomStrength = state.bloomStrength / 10
      const bloomRadius = Math.round((state.bloomRadius * 0.3) + 5)
      const bloomQuality = Math.max(1, Math.round((state.bloomStrength / 100) * 7) + 1)

      runtimeBloomFilter.blur = bloomRadius

      if (runtimeBloomFilter.blurXFilter != null) {
        runtimeBloomFilter.blurXFilter.strength = bloomStrength
        runtimeBloomFilter.blurXFilter.quality = bloomQuality
      }

      if (runtimeBloomFilter.blurYFilter != null) {
        runtimeBloomFilter.blurYFilter.strength = bloomStrength
        runtimeBloomFilter.blurYFilter.quality = bloomQuality
      }

      this.noteLayer.filters = state.showBloom && state.bloomEnabled ? [this.bloomFilter] : []
    }

    if (this.particleContainer != null) {
      this.particleContainer.visible = state.showParticles && state.particlesEnabled
    }
  }

  private assertInitialized(): void {
    if (
      !this.isInitialized ||
      this.noteLayer == null ||
      this.particleContainer == null ||
      this.keyGlowGraphic == null
    ) {
      throw new EffectsLayerError('EffectsLayer has not been initialized.', 'NOT_INITIALIZED')
    }
  }
}

export const effectsLayer = new EffectsLayer()

export { EffectsLayerError }
export { ParticlePool }
export type { Particle } from './ParticlePool'
