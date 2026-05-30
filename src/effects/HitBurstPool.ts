import * as PIXI from 'pixi.js'

export interface HitBurst {
  active: boolean
  birthTick: number
  color: number
  lifetime: number
  maxRadius: number
  velocity: number
  x: number
  y: number
}

const HIT_BURST_POOL_SIZE = 128
const HIT_BURST_MAX_RADIUS = 60

export class HitBurstPool {
  private readonly bursts: HitBurst[]
  private readonly graphics: PIXI.Graphics[]

  constructor(size: number = HIT_BURST_POOL_SIZE) {
    const poolSize = Math.max(0, Math.floor(size))
    this.bursts = Array.from({ length: poolSize }, () => createInactiveBurst())
    this.graphics = this.bursts.map(() => new PIXI.Graphics())
  }

  spawn(x: number, y: number, color: number, currentTick: number, lifetime: number, velocity: number): void {
    const burst = this.findInactiveSlot()
    if (burst == null) {
      return
    }

    burst.active = true
    burst.birthTick = currentTick
    burst.color = color
    burst.lifetime = Math.max(1, lifetime)
    burst.maxRadius = HIT_BURST_MAX_RADIUS * (0.75 + ((velocity / 127) * 0.45))
    burst.velocity = Math.max(0, Math.min(127, velocity))
    burst.x = x
    burst.y = y
  }

  update(currentTick: number, container: PIXI.Container): void {
    for (let index = 0; index < this.bursts.length; index += 1) {
      const burst = this.bursts[index]
      const graphic = this.graphics[index]

      if (!burst.active) {
        graphic.visible = false
        continue
      }

      const ticksAlive = currentTick - burst.birthTick
      if (ticksAlive >= burst.lifetime) {
        burst.active = false
        graphic.visible = false
        continue
      }

      const lifeRatio = ticksAlive / burst.lifetime
      const radius = burst.maxRadius * lifeRatio
      const velocityAlpha = 0.35 + ((burst.velocity / 127) * 0.45)
      const fade = 1 - lifeRatio
      const whiteAlpha = velocityAlpha * fade * (1 - Math.min(1, lifeRatio * 1.5))
      const colorAlpha = velocityAlpha * fade * 0.8

      graphic.clear()
      graphic.beginFill(burst.color, Math.max(0, colorAlpha))
      graphic.drawCircle(burst.x, burst.y, radius)
      graphic.endFill()

      graphic.beginFill(0xffffff, Math.max(0, whiteAlpha))
      graphic.drawCircle(burst.x, burst.y, radius * 0.55)
      graphic.endFill()
      graphic.visible = true

      if (graphic.parent == null) {
        container.addChild(graphic)
      }
    }
  }

  clear(): void {
    for (let index = 0; index < this.bursts.length; index += 1) {
      this.bursts[index].active = false
      this.graphics[index].visible = false
      this.graphics[index].clear()
    }
  }

  destroy(): void {
    this.clear()

    for (const graphic of this.graphics) {
      graphic.destroy()
    }
  }

  private findInactiveSlot(): HitBurst | null {
    for (const burst of this.bursts) {
      if (!burst.active) {
        return burst
      }
    }

    return null
  }
}

function createInactiveBurst(): HitBurst {
  return {
    active: false,
    birthTick: 0,
    color: 0xffffff,
    lifetime: 1,
    maxRadius: HIT_BURST_MAX_RADIUS,
    velocity: 0,
    x: 0,
    y: 0,
  }
}
