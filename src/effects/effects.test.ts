import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Note } from '../midi/types'
import { KEYBOARD_HEIGHT } from '../renderer/layoutConstants'
import type { IndexedNote } from '../spatial/SpatialIndex'
import { resetStore, useAppStore } from '../store/store'
import {
  ORB_FADE_START,
  PARTICLE_COUNT,
  PARTICLE_POOL_SIZE,
  SPARK_FADE_START,
  SPARK_LIFETIME_MAX,
  SPARK_LIFETIME_MIN,
  SPARK_SPEED_MAX,
  SPARK_SPEED_MIN,
  ParticlePool,
  computeParticleAlpha,
  computeParticlePosition,
} from './ParticlePool'

const mockGraphicsInstances = vi.hoisted(() => [] as MockGraphics[])
const mockContainerInstances = vi.hoisted(() => [] as MockContainer[])

vi.mock('@pixi/filter-bloom', () => ({
  BloomFilter: class BloomFilter {},
}))

vi.mock('pixi.js', () => ({
  Container: vi.fn().mockImplementation(function (this: MockContainer) {
    this.children = []
    this.visible = true
    this.filters = []
    this.addChild = vi.fn((child: unknown) => {
      this.children.push(child)
      if (typeof child === 'object' && child != null && 'parent' in child) {
        ;(child as { parent: unknown }).parent = this
      }
    })
    this.removeChild = vi.fn((child: unknown) => {
      this.children = this.children.filter((candidate) => candidate !== child)
      if (typeof child === 'object' && child != null && 'parent' in child) {
        ;(child as { parent: unknown }).parent = null
      }
    })
    this.destroy = vi.fn()
    mockContainerInstances.push(this)
    return this
  }),
  Graphics: vi.fn().mockImplementation(function (this: MockGraphics) {
    this.visible = true
    this.parent = null
    this.destroyed = false
    this.clear = vi.fn().mockReturnThis()
    this.beginFill = vi.fn().mockReturnThis()
    this.drawCircle = vi.fn().mockReturnThis()
    this.drawRect = vi.fn().mockReturnThis()
    this.endFill = vi.fn().mockReturnThis()
    this.destroy = vi.fn(() => {
      this.destroyed = true
    })
    mockGraphicsInstances.push(this)
    return this
  }),
}))

const { EffectsLayer } = await import('./EffectsLayer')

beforeEach(() => {
  resetStore()
  useAppStore.getState().batchUpdate((state) => {
    state.particleTrails = false
  })
  mockGraphicsInstances.length = 0
  mockContainerInstances.length = 0
  vi.restoreAllMocks()
})

afterEach(() => {
  resetStore()
})

describe('ParticlePool', () => {
  it('pre-allocates PARTICLE_POOL_SIZE slots on construction', () => {
    const pool = new ParticlePool()
    expect(pool.getPoolSize()).toBe(PARTICLE_POOL_SIZE)
    expect(mockGraphicsInstances).toHaveLength(PARTICLE_POOL_SIZE)
  })

  it('spawnBurst() activates PARTICLE_COUNT particles with birthTick and velocity in range', () => {
    const pool = new ParticlePool()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    pool.spawnBurst(100, 200, 0xff0000, 480)

    expect(pool.getActiveCount()).toBe(PARTICLE_COUNT)

    const particle = pool.getParticle(0)
    expect(particle.birthTick).toBe(480)
    expect(particle.birthX).toBe(100)
    expect(particle.birthY).toBe(200)
    expect(particle.color).toBe(0xff0000)
    expect(particle.active).toBe(true)
    expect(particle.type).toBe('spark')
    expect(particle.trailX[0]).toBe(particle.birthX)
    expect(particle.trailY[0]).toBe(particle.birthY)

    const speed = Math.hypot(particle.vx, particle.vy)
    expect(speed).toBeGreaterThanOrEqual(SPARK_SPEED_MIN)
    expect(speed).toBeLessThanOrEqual(SPARK_SPEED_MAX)
  })

  it('spawnBurst() skips silently when the pool is full', () => {
    const pool = new ParticlePool(4)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    pool.spawnBurst(10, 20, 0xffffff, 0)
    pool.spawnBurst(10, 20, 0xffffff, 1)

    expect(pool.getActiveCount()).toBe(4)
    expect(() => pool.spawnBurst(10, 20, 0xffffff, 2)).not.toThrow()
    expect(pool.getActiveCount()).toBe(4)
  })

  it('update() marks particles inactive after their lifetime', () => {
    const pool = new ParticlePool(6)
    const container = new MockContainer()

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    pool.spawnBurst(0, 0, 0xffffff, 0)
    pool.update(SPARK_LIFETIME_MAX + 1, container as never)

    expect(pool.getActiveCount()).toBe(0)
  })

  it('update() positions and alpha are derived from tick math only', () => {
    const pool = new ParticlePool(4)
    const container = new MockContainer()
    const particle = pool.getParticle(0)

    particle.active = true
    particle.birthTick = 0
    particle.birthX = 10
    particle.birthY = 20
    particle.vx = 0
    particle.vy = -2
    particle.lifetime = 80
    particle.size = 3
    particle.color = 0xabcdef
    particle.type = 'spark'

    pool.update(0, container as never)
    let graphic = mockGraphicsInstances[0]
    expect(graphic.drawCircle).toHaveBeenCalledWith(10, 20, 3)

    pool.update(24, container as never)
    graphic = mockGraphicsInstances[0]
    const expected = computeParticlePosition(particle, 24)
    expect(graphic.drawCircle).toHaveBeenCalledWith(expected.x, expected.y, 3)
    expect(graphic.beginFill).toHaveBeenCalledWith(0xabcdef, 0.6)
    expect(graphic.endFill).toHaveBeenCalled()

    pool.update(60, container as never)
    graphic = mockGraphicsInstances[0]
    expect(graphic.beginFill).toHaveBeenCalledWith(0xabcdef, computeParticleAlpha(particle, 60) * 0.6)
    expect(computeParticleAlpha(particle, 60)).toBeLessThan(1)
  })

  it('update() keeps spark alpha at 1.0 before SPARK_FADE_START ratio', () => {
    const particle = poolTestParticle('spark', 80)
    const fadeStartTick = Math.floor(particle.lifetime * SPARK_FADE_START) - 1
    expect(computeParticleAlpha(particle, fadeStartTick)).toBe(1)
  })

  it('update() keeps orb alpha at 1.0 before ORB_FADE_START ratio', () => {
    const particle = poolTestParticle('orb', 140)
    const fadeStartTick = Math.floor(particle.lifetime * ORB_FADE_START) - 1
    expect(computeParticleAlpha(particle, fadeStartTick)).toBe(1)
  })

  it('update() fades alpha to 0 at particle lifetime', () => {
    const particle = poolTestParticle('spark', 80)
    expect(computeParticleAlpha(particle, particle.lifetime)).toBe(0)
  })

  it('clear() sets all particles inactive', () => {
    const pool = new ParticlePool(8)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    pool.spawnBurst(0, 0, 0xffffff, 0)

    pool.clear()

    expect(pool.getActiveCount()).toBe(0)
    expect(mockGraphicsInstances.every((graphic) => graphic.visible === false)).toBe(true)
  })

  it('update() skips destroyed graphics objects without throwing', () => {
    const pool = new ParticlePool(2)
    const container = new MockContainer()
    const particle = pool.getParticle(0)

    particle.active = true
    particle.birthTick = 0
    particle.birthX = 10
    particle.birthY = 20
    particle.vx = 0
    particle.vy = -1
    particle.lifetime = 80
    particle.size = 2
    particle.color = 0xffffff
    particle.type = 'spark'
    mockGraphicsInstances[0].destroyed = true

    expect(() => pool.update(10, container as never)).not.toThrow()
    expect(pool.getActiveCount()).toBe(0)
  })

  it('two update() calls with the same currentTick produce identical positions', () => {
    const pool = new ParticlePool(4)
    const container = new MockContainer()
    const particle = pool.getParticle(0)

    particle.active = true
    particle.birthTick = 10
    particle.birthX = 5
    particle.birthY = 8
    particle.vx = 1
    particle.vy = -1.5
    particle.lifetime = SPARK_LIFETIME_MIN
    particle.size = 2
    particle.color = 0xffffff
    particle.type = 'spark'

    pool.update(20, container as never)
    const firstCall = mockGraphicsInstances[0].drawCircle.mock.calls.at(-1)

    pool.update(20, container as never)
    const secondCall = mockGraphicsInstances[0].drawCircle.mock.calls.at(-1)

    expect(firstCall).toEqual(secondCall)
  })

  it('particle at half lifetime moves upward from birthY', () => {
    const particle = {
      active: true,
      birthTick: 0,
      birthX: 0,
      birthY: 100,
      color: 0xffffff,
      lifetime: SPARK_LIFETIME_MIN,
      size: 2,
      trailAlpha: new Float32Array([0.5, 0.3, 0.15, 0.05]),
      trailX: new Float32Array(4),
      trailY: new Float32Array(4),
      type: 'spark' as const,
      vx: 0,
      vy: -2,
    }

    const position = computeParticlePosition(particle, particle.lifetime / 2)
    expect(position.y).toBeLessThan(100)
  })
})

describe('EffectsLayer', () => {
  it('applies bloom and particle toggles from store state', () => {
    const layer = new EffectsLayer()
    const layers = createMockRenderLayers()
    const noteLayer = layers.notes

    layer.init(layers)
    const particleContainer = mockContainerInstances[0]

    useAppStore.getState().batchUpdate((state) => {
      state.showBloom = true
      state.showParticles = true
    })
    layer.update(0, [], 1920, 1080)

    expect(noteLayer.filters).toHaveLength(1)
    expect(particleContainer?.visible).toBe(true)

    useAppStore.getState().batchUpdate((state) => {
      state.showBloom = false
      state.showParticles = false
    })
    layer.update(0, [], 1920, 1080)

    expect(noteLayer.filters).toEqual([])
    expect(particleContainer?.visible).toBe(false)

    layer.destroy()
  })

  it('spawns particles when a note startTick crosses currentTick and avoids duplicates', () => {
    const layer = new EffectsLayer()
    const spawnSpy = vi.spyOn(ParticlePool.prototype, 'spawnBurst')

    layer.init(createMockRenderLayers())
    useAppStore.getState().batchUpdate((state) => {
      state.showParticles = true
    })

    const note = createIndexedNote('note-1', 120, 60)
    layer.update(0, [], 1920, 1080)
    layer.update(120, [note], 1920, 1080)

    expect(spawnSpy).toHaveBeenCalledTimes(1)
    expect(spawnSpy).toHaveBeenCalledWith(
      expect.any(Number),
      1080 - KEYBOARD_HEIGHT,
      expect.any(Number),
      120,
      100,
    )

    layer.update(121, [note], 1920, 1080)
    expect(spawnSpy).toHaveBeenCalledTimes(1)

    layer.destroy()
    spawnSpy.mockRestore()
  })

  it('does not spawn particles for notes outside the tick window', () => {
    const layer = new EffectsLayer()
    const spawnSpy = vi.spyOn(ParticlePool.prototype, 'spawnBurst')

    layer.init(createMockRenderLayers())
    useAppStore.getState().batchUpdate((state) => {
      state.showParticles = true
    })

    const note = createIndexedNote('future-note', 500, 64)
    layer.update(0, [note], 1920, 1080)
    layer.update(100, [note], 1920, 1080)

    expect(spawnSpy).not.toHaveBeenCalled()

    layer.destroy()
    spawnSpy.mockRestore()
  })

  it('seek() clears spawned note ids and particles', () => {
    const layer = new EffectsLayer()
    const clearSpy = vi.spyOn(ParticlePool.prototype, 'clear')

    layer.init(createMockRenderLayers())
    useAppStore.getState().batchUpdate((state) => {
      state.showParticles = true
    })

    const note = createIndexedNote('note-1', 10, 60)
    layer.update(0, [], 1920, 1080)
    layer.update(10, [note], 1920, 1080)
    layer.seek(10)

    expect(clearSpy).toHaveBeenCalled()

    const spawnSpy = vi.spyOn(ParticlePool.prototype, 'spawnBurst')
    layer.update(10, [note], 1920, 1080)
    expect(spawnSpy).toHaveBeenCalledTimes(1)

    layer.destroy()
    clearSpy.mockRestore()
    spawnSpy.mockRestore()
  })

  it('reset() clears particle pool state safely and recreates graphics', () => {
    const layer = new EffectsLayer()

    layer.init(createMockRenderLayers())
    useAppStore.getState().batchUpdate((state) => {
      state.showParticles = true
    })

    const note = createIndexedNote('note-1', 10, 60)
    layer.update(10, [note], 1920, 1080)

    const particlePool = (layer as unknown as { particlePool: ParticlePool }).particlePool
    const previousGraphics = [...(particlePool as unknown as { graphics: Array<MockGraphics | null> }).graphics]
    expect(particlePool.getActiveCount()).toBeGreaterThan(0)

    expect(() => layer.reset()).not.toThrow()
    expect(particlePool.getActiveCount()).toBe(0)

    const nextGraphics = (particlePool as unknown as { graphics: Array<MockGraphics | null> }).graphics
    expect(nextGraphics.every((graphic) => graphic != null && graphic.destroyed === false)).toBe(true)
    expect(nextGraphics[0]).not.toBe(previousGraphics[0])

    layer.destroy()
  })

  it('throws NOT_INITIALIZED when update() is called before init()', () => {
    const layer = new EffectsLayer()
    expect(() => layer.update(0, [], 1920, 1080)).toThrowError(/not been initialized/i)
  })
})

function createIndexedNote(id: string, startTick: number, pitch: number): IndexedNote {
  const note: Note = {
    endTick: startTick + 120,
    id,
    pitch,
    startTick,
    velocity: 100,
    visualEndTick: startTick + 120,
  }

  return {
    note,
    trackId: 'track-1',
    trackIndex: 0,
  }
}

function createMockRenderLayers() {
  const overlay = new MockContainer()
  const notes = new MockContainer()

  return {
    background: new MockContainer(),
    hitLine: new MockContainer(),
    keyboard: new MockContainer(),
    keyboardGlow: new MockContainer(),
    laneLines: new MockContainer(),
    noteByNote: new MockContainer(),
    notes,
    overlay,
  }
}

interface MockGraphics {
  visible: boolean
  parent: unknown
  destroyed: boolean
  clear: ReturnType<typeof vi.fn>
  beginFill: ReturnType<typeof vi.fn>
  drawCircle: ReturnType<typeof vi.fn>
  drawRect: ReturnType<typeof vi.fn>
  endFill: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

function poolTestParticle(type: 'spark' | 'orb', lifetime: number) {
  return {
    active: true,
    birthTick: 0,
    birthX: 0,
    birthY: 0,
    color: 0xffffff,
    lifetime,
    size: 2,
    trailAlpha: new Float32Array([0.5, 0.3, 0.15, 0.05]),
    trailX: new Float32Array(4),
    trailY: new Float32Array(4),
    type,
    vx: 0,
    vy: -2,
  }
}

class MockContainer {
  children: unknown[] = []
  visible = true
  filters: unknown[] = []
  addChild = vi.fn((child: unknown) => {
    this.children.push(child)
  })
  removeChild = vi.fn((child: unknown) => {
    this.children = this.children.filter((candidate) => candidate !== child)
  })

  destroy = vi.fn()
}
