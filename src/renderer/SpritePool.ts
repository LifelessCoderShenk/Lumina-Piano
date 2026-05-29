import * as PIXI from 'pixi.js'

export class SpritePool {
  private pool: PIXI.Sprite[] = []
  private active: PIXI.Sprite[] = []

  prewarm(count: number): void {
    const targetCount = Math.max(0, Math.floor(count))

    while ((this.pool.length + this.active.length) < targetCount) {
      this.pool.push(this.createSprite())
    }
  }

  acquire(): PIXI.Sprite {
    const sprite = this.pool.pop() ?? this.createSprite()
    sprite.visible = true
    this.active.push(sprite)
    return sprite
  }

  releaseAll(): void {
    while (this.active.length > 0) {
      const sprite = this.active.pop()
      if (sprite != null) {
        sprite.parent?.removeChild(sprite)
        sprite.texture = PIXI.Texture.EMPTY
        sprite.visible = false
        sprite.alpha = 1
        sprite.position.set(0, 0)
        sprite.scale.set(1, 1)
        this.pool.push(sprite)
      }
    }
  }

  destroy(): void {
    this.releaseAll()

    for (const sprite of this.pool) {
      sprite.destroy()
    }

    this.pool = []
  }

  private createSprite(): PIXI.Sprite {
    const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
    sprite.visible = false
    return sprite
  }
}
