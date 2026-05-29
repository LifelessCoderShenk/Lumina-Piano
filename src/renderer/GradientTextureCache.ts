import * as PIXI from 'pixi.js'

export type GradientDirection = 'vertical' | 'horizontal'

const CACHE_HEIGHT_BUCKET = 4
const TEXTURE_WIDTH = 64
const TOP_RADIUS = 8

export class GradientTextureCache {
  private cache = new Map<string, PIXI.Texture>()

  getTexture(
    topColor: string,
    bottomColor: string,
    height: number,
    direction: GradientDirection,
  ): PIXI.Texture {
    const bucketedHeight = getHeightBucket(height)
    const key = `${topColor}|${bottomColor}|${direction}|${bucketedHeight}`
    const cachedTexture = this.cache.get(key)

    if (cachedTexture != null) {
      return cachedTexture
    }

    const canvas = document.createElement('canvas')
    canvas.width = TEXTURE_WIDTH
    canvas.height = bucketedHeight

    const context = canvas.getContext('2d')
    if (context == null) {
      return PIXI.Texture.WHITE
    }

    const gradient = direction === 'horizontal'
      ? context.createLinearGradient(0, 0, canvas.width, 0)
      : context.createLinearGradient(0, 0, 0, canvas.height)

    gradient.addColorStop(0, topColor)
    gradient.addColorStop(1, bottomColor)

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = gradient
    drawTopRoundedRectPath(context, 0, 0, canvas.width, canvas.height, TOP_RADIUS)
    context.fill()

    const texture = PIXI.Texture.from(canvas)
    this.cache.set(key, texture)
    return texture
  }

  clear(): void {
    for (const texture of this.cache.values()) {
      texture.destroy(true)
    }

    this.cache.clear()
  }

  destroy(): void {
    this.clear()
  }
}

function getHeightBucket(height: number): number {
  const normalizedHeight = Math.max(2, Math.ceil(height))
  return Math.max(2, Math.round(normalizedHeight / CACHE_HEIGHT_BUCKET) * CACHE_HEIGHT_BUCKET)
}

function drawTopRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const clampedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  context.beginPath()
  context.moveTo(x, y + height)
  context.lineTo(x, y + clampedRadius)
  context.quadraticCurveTo(x, y, x + clampedRadius, y)
  context.lineTo(x + width - clampedRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  context.lineTo(x + width, y + height)
  context.closePath()
}
