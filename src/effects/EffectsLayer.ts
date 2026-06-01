import { BloomFilter } from '@pixi/filter-bloom'
import * as PIXI from 'pixi.js'

import type { IndexedNote } from '../spatial/SpatialIndex'
import { getAppState, subscribeToStore } from '../store/store'
import { secondsToTick } from '../tempo/tempoMap'
import {
  getKeyboardLayoutMetrics,
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
import { HitBurstPool } from './HitBurstPool'
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
  private hitBurstPool = new HitBurstPool()
  private particleContainer: PIXI.Container | null = null
  private hitBurstContainer: PIXI.Container | null = null
  private keyboardGlowContainer: PIXI.Container | null = null
  private ambientGlowGraphic: PIXI.Graphics | null = null
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
    this.hitBurstContainer = new PIXI.Container()
    this.keyboardGlowContainer = layers.keyboardGlow
    this.ambientGlowGraphic = new PIXI.Graphics()
    this.keyboardGlowContainer.addChild(this.ambientGlowGraphic)
    this.keyboardGlowContainer.addChild(this.hitBurstContainer)
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
        state.particleTrails !== previousState.particleTrails ||
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

    this.particlePool.forceReset()
    this.hitBurstPool.clear()
    this.spawnedNoteIds.clear()

    if (this.particleContainer?.parent != null) {
      this.particleContainer.parent.removeChild(this.particleContainer)
    }

    this.particleContainer?.destroy({ children: true })
    this.particleContainer = null

    if (this.hitBurstContainer?.parent != null) {
      this.hitBurstContainer.parent.removeChild(this.hitBurstContainer)
    }
    this.hitBurstContainer?.destroy({ children: true })
    this.hitBurstContainer = null

    if (this.ambientGlowGraphic?.parent != null) {
      this.ambientGlowGraphic.parent.removeChild(this.ambientGlowGraphic)
    }
    this.ambientGlowGraphic?.destroy()
    this.ambientGlowGraphic = null
    this.keyboardGlowContainer = null

    if (this.noteLayer != null) {
      this.noteLayer.filters = []
    }

    this.noteLayer = null
    this.bloomFilter = null
    this.lastTick = 0
    this.isInitialized = false
  }

  reset(): void {
    this.spawnedNoteIds.clear()
    this.particlePool.forceReset()
    this.particlePool.recreateGraphics()
    this.lastTick = getAppState().currentTick
  }

  update(
    currentTick: number,
    visibleNotes: IndexedNote[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    this.assertInitialized()

    this.applyEffectToggles()
    this.drawAmbientKeyboardGlows(currentTick, visibleNotes, canvasWidth, canvasHeight)
    this.detectNoteHits(currentTick, visibleNotes, canvasWidth, canvasHeight)

    if (this.particleContainer != null) {
      this.particlePool.update(currentTick, this.particleContainer)
    }

    if (this.hitBurstContainer != null) {
      this.hitBurstPool.update(currentTick, this.hitBurstContainer)
    }

    this.lastTick = currentTick
  }

  seek(tick: number): void {
    this.spawnedNoteIds.clear()
    this.particlePool.clear()
    this.hitBurstPool.clear()
    this.lastTick = Math.max(0, Math.floor(tick))
  }

  private detectNoteHits(
    currentTick: number,
    visibleNotes: IndexedNote[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const state = getAppState()
    const layeredGlowEnabled = state.effectsEnabled.layeredGlow
    const particlesEnabled = state.showParticles && state.particlesEnabled

    if (!particlesEnabled && !layeredGlowEnabled) {
      return
    }

    const { keyboardY: keyboardTopY } = getKeyboardLayoutMetrics(canvasHeight)
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

      if (particlesEnabled) {
        this.particlePool.setBurstConfig(state.particleCount, state.particleSize / 50)
        this.particlePool.spawnBurst(keyX, keyboardTopY, color, currentTick, note.velocity)
      }

      if (layeredGlowEnabled) {
        this.hitBurstPool.spawn(
          keyX,
          keyboardTopY,
          color,
          currentTick,
          this.getHitBurstLifetimeTicks(),
          note.velocity,
        )
      }
      this.spawnedNoteIds.add(note.id)
    }
  }

  private drawAmbientKeyboardGlows(
    currentTick: number,
    visibleNotes: IndexedNote[],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const glowGraphic = this.ambientGlowGraphic
    if (glowGraphic == null) {
      return
    }

    glowGraphic.clear()

    const state = getAppState()
    const { keyboardY: keyTopY } = getKeyboardLayoutMetrics(canvasHeight)
    const layeredGlowEnabled = state.effectsEnabled.layeredGlow

    if (!state.keyGlowEnabled || !layeredGlowEnabled) {
      return
    }

    const glowHeight = 120
    const glowSteps = 10
    const stepHeight = glowHeight / glowSteps

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
      const baseGlowAlpha = (note.velocity / 127) * 0.35 * intensity
      const keyX = Math.round(pitchToKeyX(note.pitch, canvasWidth))

      for (let index = 0; index < glowSteps; index += 1) {
        const mix = glowSteps === 1 ? 1 : index / (glowSteps - 1)
        const alpha = baseGlowAlpha * (1 - mix)
        const glowWidth = Math.round(keyWidth + (index * 2))
        const glowX = Math.round(keyX - index)
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

    if (this.hitBurstContainer != null) {
      this.hitBurstContainer.visible = state.effectsEnabled.layeredGlow
    }

    if (this.keyboardGlowContainer != null) {
      this.keyboardGlowContainer.visible = state.effectsEnabled.layeredGlow
    }
  }

  private assertInitialized(): void {
    if (
      !this.isInitialized ||
      this.noteLayer == null ||
      this.particleContainer == null ||
      this.hitBurstContainer == null ||
      this.keyboardGlowContainer == null ||
      this.ambientGlowGraphic == null
    ) {
      throw new EffectsLayerError('EffectsLayer has not been initialized.', 'NOT_INITIALIZED')
    }
  }

  private getHitBurstLifetimeTicks(): number {
    const tempoMap = getAppState().precomputedTempoMap
    if (tempoMap == null) {
      return 120
    }

    return Math.max(1, secondsToTick(0.2, tempoMap))
  }
}

export const effectsLayer = new EffectsLayer()

export { EffectsLayerError }
export { ParticlePool }
export type { Particle } from './ParticlePool'
