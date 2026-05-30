import * as PIXI from 'pixi.js'

import { getAppState } from '../store/store'

export type ParticleType = 'spark' | 'orb'

export interface Particle {
  type: ParticleType
  birthTick: number
  lifetime: number
  birthX: number
  birthY: number
  vx: number
  vy: number
  size: number
  color: number
  active: boolean
  trailX: Float32Array
  trailY: Float32Array
  trailAlpha: Float32Array
}

export const SPARK_COUNT = 6
export const SPARK_SIZE_MIN = 1.5
export const SPARK_SIZE_MAX = 3.0
export const SPARK_SPEED_MIN = 3.0
export const SPARK_SPEED_MAX = 6.0
export const SPARK_SPREAD_ANGLE = 160
export const SPARK_LIFETIME_MIN = 60
export const SPARK_LIFETIME_MAX = 80
export const SPARK_FADE_START = 0.5

export const ORB_COUNT = 4
export const ORB_SIZE_MIN = 3.0
export const ORB_SIZE_MAX = 6.0
export const ORB_SPEED_MIN = 0.8
export const ORB_SPEED_MAX = 2.0
export const ORB_SPREAD_ANGLE = 80
export const ORB_LIFETIME_MIN = 120
export const ORB_LIFETIME_MAX = 160
export const ORB_FADE_START = 0.4

export const PARTICLE_COUNT = SPARK_COUNT + ORB_COUNT
export const PARTICLE_POOL_SIZE = 256
export const PARTICLE_GRAVITY = 0.04
export const TRAIL_LENGTH = 4
export const TRAIL_ALPHA_FALLOFF = [0.5, 0.3, 0.15, 0.05] as const
export const VELOCITY_SIZE_BOOST = 0.3
export const VELOCITY_COUNT_BOOST = 2

const SPARK_BIRTH_X_SPREAD = 8
const ORB_BIRTH_X_SPREAD = 4

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
    velocity: number = 64,
  ): void {
    const velT = (velocity - 64) / 63
    const velBoost = Math.max(0, velT)
    const extraParticles = Math.round(velBoost * VELOCITY_COUNT_BOOST)
    const configuredCountScale = Number.isFinite(this.configuredCount)
      ? Math.max(0, this.configuredCount) / PARTICLE_COUNT
      : 1
    const configuredSizeMultiplier = Number.isFinite(this.configuredSizeMultiplier)
      ? Math.max(0, this.configuredSizeMultiplier)
      : 1
    const sizeMultiplier = configuredSizeMultiplier * (1 + (velBoost * VELOCITY_SIZE_BOOST))
    const sparkCount = Math.max(0, Math.round(SPARK_COUNT * configuredCountScale) + extraParticles)
    const orbCount = Math.max(0, Math.round(ORB_COUNT * configuredCountScale))

    for (let index = 0; index < sparkCount; index += 1) {
      const slot = this.findInactiveSlot()
      if (slot == null) {
        return
      }

      populateParticle(
        slot,
        'spark',
        screenX,
        screenY,
        color,
        currentTick,
        sizeMultiplier,
        SPARK_SPREAD_ANGLE,
        SPARK_SPEED_MIN,
        SPARK_SPEED_MAX,
        SPARK_LIFETIME_MIN,
        SPARK_LIFETIME_MAX,
        SPARK_BIRTH_X_SPREAD,
      )
    }

    for (let index = 0; index < orbCount; index += 1) {
      const slot = this.findInactiveSlot()
      if (slot == null) {
        return
      }

      populateParticle(
        slot,
        'orb',
        screenX,
        screenY,
        color,
        currentTick,
        sizeMultiplier,
        ORB_SPREAD_ANGLE,
        ORB_SPEED_MIN,
        ORB_SPEED_MAX,
        ORB_LIFETIME_MIN,
        ORB_LIFETIME_MAX,
        ORB_BIRTH_X_SPREAD,
      )
    }
  }

  update(currentTick: number, container: PIXI.Container): void {
    const showTrails = getAppState().particleTrails

    for (let index = 0; index < this.pool.length; index += 1) {
      const particle = this.pool[index]
      const graphic = this.graphics[index]

      if (!particle.active) {
        graphic.visible = false
        continue
      }

      const ticksAlive = currentTick - particle.birthTick
      if (ticksAlive >= particle.lifetime) {
        particle.active = false
        graphic.visible = false
        continue
      }

      const x = computeParticleX(particle, ticksAlive)
      const y = computeParticleY(particle, ticksAlive)
      const alpha = computeParticleAlpha(particle, ticksAlive)

      graphic.clear()

      if (showTrails) {
        drawTrails(graphic, particle, alpha)
        shiftTrailHistory(particle, x, y)
      }

      drawParticle(graphic, particle, x, y, alpha)
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

export function computeParticleAlpha(particle: Particle, ticksAlive: number): number {
  const fadeStart = particle.type === 'spark' ? SPARK_FADE_START : ORB_FADE_START
  const lifeRatio = ticksAlive / particle.lifetime

  if (lifeRatio < fadeStart) {
    return 1
  }

  return 1 - ((lifeRatio - fadeStart) / (1 - fadeStart))
}

export function computeParticlePosition(particle: Particle, ticksAlive: number): { x: number; y: number } {
  return {
    x: computeParticleX(particle, ticksAlive),
    y: computeParticleY(particle, ticksAlive),
  }
}

function createInactiveParticle(): Particle {
  return {
    active: false,
    birthTick: 0,
    birthX: 0,
    birthY: 0,
    color: 0xffffff,
    lifetime: 0,
    size: 0,
    trailAlpha: new Float32Array(TRAIL_ALPHA_FALLOFF),
    trailX: new Float32Array(TRAIL_LENGTH),
    trailY: new Float32Array(TRAIL_LENGTH),
    type: 'spark',
    vx: 0,
    vy: 0,
  }
}

function populateParticle(
  particle: Particle,
  type: ParticleType,
  screenX: number,
  screenY: number,
  color: number,
  currentTick: number,
  sizeMultiplier: number,
  spreadAngle: number,
  speedMin: number,
  speedMax: number,
  lifetimeMin: number,
  lifetimeMax: number,
  birthXSpread: number,
): void {
  const angleDeg = -90 + ((Math.random() - 0.5) * spreadAngle)
  const angleRad = (angleDeg * Math.PI) / 180
  const speed = speedMin + (Math.random() * (speedMax - speedMin))

  particle.type = type
  particle.birthTick = currentTick
  particle.lifetime = lifetimeMin + (Math.random() * (lifetimeMax - lifetimeMin))
  particle.birthX = screenX + ((Math.random() - 0.5) * birthXSpread)
  particle.birthY = screenY
  particle.vx = Math.cos(angleRad) * speed
  particle.vy = Math.sin(angleRad) * speed
  particle.size = (
    (type === 'spark' ? SPARK_SIZE_MIN : ORB_SIZE_MIN) +
    (Math.random() * ((type === 'spark' ? SPARK_SIZE_MAX : ORB_SIZE_MAX) - (type === 'spark' ? SPARK_SIZE_MIN : ORB_SIZE_MIN)))
  ) * sizeMultiplier
  particle.color = color
  particle.active = true
  particle.trailX.fill(particle.birthX)
  particle.trailY.fill(particle.birthY)
}

function computeParticleX(particle: Particle, ticksAlive: number): number {
  return particle.birthX + (particle.vx * ticksAlive)
}

function computeParticleY(particle: Particle, ticksAlive: number): number {
  const gravity = particle.type === 'spark' ? PARTICLE_GRAVITY : PARTICLE_GRAVITY * 0.3
  return particle.birthY + (particle.vy * ticksAlive) + (0.5 * gravity * ticksAlive * ticksAlive)
}

function drawTrails(graphic: PIXI.Graphics, particle: Particle, alpha: number): void {
  for (let trailIndex = TRAIL_LENGTH - 1; trailIndex >= 0; trailIndex -= 1) {
    const trailAlpha = alpha * particle.trailAlpha[trailIndex]
    if (trailAlpha < 0.01) {
      continue
    }

    const trailSize = particle.size * (1 - ((trailIndex + 1) / (TRAIL_LENGTH + 1)))
    graphic.beginFill(particle.color, trailAlpha)
    graphic.drawCircle(
      particle.trailX[trailIndex],
      particle.trailY[trailIndex],
      Math.max(0.5, trailSize),
    )
    graphic.endFill()
  }
}

function shiftTrailHistory(particle: Particle, x: number, y: number): void {
  for (let trailIndex = TRAIL_LENGTH - 1; trailIndex > 0; trailIndex -= 1) {
    particle.trailX[trailIndex] = particle.trailX[trailIndex - 1]
    particle.trailY[trailIndex] = particle.trailY[trailIndex - 1]
  }

  particle.trailX[0] = x
  particle.trailY[0] = y
}

function drawParticle(
  graphic: PIXI.Graphics,
  particle: Particle,
  x: number,
  y: number,
  alpha: number,
): void {
  if (particle.type === 'spark') {
    graphic.beginFill(particle.color, alpha * 0.6)
    graphic.drawCircle(x, y, particle.size)
    graphic.endFill()

    graphic.beginFill(0xffffff, alpha)
    graphic.drawCircle(x, y, particle.size * 0.5)
    graphic.endFill()
    return
  }

  graphic.beginFill(particle.color, alpha * 0.15)
  graphic.drawCircle(x, y, particle.size * 1.8)
  graphic.endFill()

  graphic.beginFill(particle.color, alpha * 0.35)
  graphic.drawCircle(x, y, particle.size * 1.2)
  graphic.endFill()

  graphic.beginFill(particle.color, alpha * 0.8)
  graphic.drawCircle(x, y, particle.size)
  graphic.endFill()

  graphic.beginFill(0xffffff, alpha * 0.6)
  graphic.drawCircle(x, y, particle.size * 0.4)
  graphic.endFill()
}
