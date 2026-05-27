import * as PIXI from 'pixi.js'

export interface Particle {
  birthTick: number
  birthX: number
  birthY: number
  vx: number
  vy: number
  size: number
  color: number
  active: boolean
}

export const PARTICLE_COUNT = 10
export const PARTICLE_MIN_SIZE = 2
export const PARTICLE_MAX_SIZE = 4
export const PARTICLE_LIFETIME_TICKS = 96
export const PARTICLE_SPEED_MIN = 1.5
export const PARTICLE_SPEED_MAX = 4.0
export const PARTICLE_SPREAD_ANGLE = 140
export const PARTICLE_FADE_START = 0.6
export const PARTICLE_GRAVITY = 0.08
export const PARTICLE_POOL_SIZE = 256

export class ParticlePool {
  private readonly pool: Particle[]
  private readonly graphics: PIXI.Graphics[]
  private configuredCount = PARTICLE_COUNT
  private configuredSizeMultiplier = 1

  constructor(size: number = PARTICLE_POOL_SIZE) {
    const poolSize = Math.max(0, Math.floor(size))
    this.pool = Array.from({ length: poolSize }, () => createInactiveParticle())
    this.graphics = this.pool.map(() => new PIXI.Graphics())
  }

  spawnBurst(
    screenX: number,
    screenY: number,
    color: number,
    currentTick: number,
  ): void {
    const burstCount = Math.max(0, Math.floor(this.configuredCount))
    const normalizedSizeMultiplier = Number.isFinite(this.configuredSizeMultiplier)
      ? Math.max(0, this.configuredSizeMultiplier)
      : 1

    for (let index = 0; index < burstCount; index += 1) {
      const slot = this.findInactiveSlot()
      if (slot == null) {
        return
      }

      const angleDeg = -90 + (Math.random() - 0.5) * PARTICLE_SPREAD_ANGLE
      const angleRad = (angleDeg * Math.PI) / 180
      const speed = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN)

      slot.birthTick = currentTick
      slot.birthX = screenX
      slot.birthY = screenY
      slot.vx = Math.cos(angleRad) * speed
      slot.vy = Math.sin(angleRad) * speed
      slot.size = (PARTICLE_MIN_SIZE + Math.random() * (PARTICLE_MAX_SIZE - PARTICLE_MIN_SIZE)) * normalizedSizeMultiplier
      slot.color = color
      slot.active = true
    }
  }

  update(currentTick: number, container: PIXI.Container): void {
    for (let index = 0; index < this.pool.length; index += 1) {
      const particle = this.pool[index]
      const graphic = this.graphics[index]

      if (!particle.active) {
        graphic.visible = false
        continue
      }

      const ticksAlive = currentTick - particle.birthTick

      if (ticksAlive >= PARTICLE_LIFETIME_TICKS) {
        particle.active = false
        graphic.visible = false
        continue
      }

      const x = particle.birthX + particle.vx * ticksAlive
      const y = particle.birthY + particle.vy * ticksAlive + 0.5 * PARTICLE_GRAVITY * ticksAlive * ticksAlive
      const alpha = computeParticleAlpha(ticksAlive)

      graphic.clear()
      graphic.beginFill(particle.color, alpha)
      graphic.drawCircle(x, y, particle.size)
      graphic.endFill()
      graphic.visible = true

      if (graphic.parent == null) {
        container.addChild(graphic)
      }
    }
  }

  clear(): void {
    for (let index = 0; index < this.pool.length; index += 1) {
      this.pool[index].active = false
      this.graphics[index].visible = false
      this.graphics[index].clear()
    }
  }

  getPoolSize(): number {
    return this.pool.length
  }

  getActiveCount(): number {
    return this.pool.reduce((count, particle) => (particle.active ? count + 1 : count), 0)
  }

  getParticle(index: number): Particle {
    return this.pool[index]
  }

  setBurstConfig(count: number, sizeMultiplier: number): void {
    this.configuredCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : PARTICLE_COUNT
    this.configuredSizeMultiplier = Number.isFinite(sizeMultiplier) ? Math.max(0, sizeMultiplier) : 1
  }

  private findInactiveSlot(): Particle | null {
    for (const particle of this.pool) {
      if (!particle.active) {
        return particle
      }
    }

    return null
  }
}

export function computeParticleAlpha(ticksAlive: number): number {
  const lifeRatio = ticksAlive / PARTICLE_LIFETIME_TICKS

  if (lifeRatio < PARTICLE_FADE_START) {
    return 1
  }

  return 1 - ((lifeRatio - PARTICLE_FADE_START) / (1 - PARTICLE_FADE_START))
}

export function computeParticlePosition(particle: Particle, ticksAlive: number): { x: number; y: number } {
  return {
    x: particle.birthX + particle.vx * ticksAlive,
    y: particle.birthY + particle.vy * ticksAlive + 0.5 * PARTICLE_GRAVITY * ticksAlive * ticksAlive,
  }
}

function createInactiveParticle(): Particle {
  return {
    active: false,
    birthTick: 0,
    birthX: 0,
    birthY: 0,
    color: 0xffffff,
    size: 0,
    vx: 0,
    vy: 0,
  }
}
