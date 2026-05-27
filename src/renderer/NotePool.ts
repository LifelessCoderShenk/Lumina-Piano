import * as PIXI from 'pixi.js'

export class NotePool {
  private pool: PIXI.Graphics[] = []
  private active: PIXI.Graphics[] = []

  prewarm(count: number): void {
    const targetCount = Math.max(0, Math.floor(count))

    while ((this.pool.length + this.active.length) < targetCount) {
      this.pool.push(this.createGraphic())
    }
  }

  acquire(): PIXI.Graphics {
    const graphic = this.pool.pop() ?? this.createGraphic()
    graphic.visible = true
    this.active.push(graphic)
    return graphic
  }

  release(graphic: PIXI.Graphics): void {
    graphic.clear()
    graphic.visible = false
    graphic.parent?.removeChild(graphic)

    const activeIndex = this.active.indexOf(graphic)
    if (activeIndex >= 0) {
      this.active.splice(activeIndex, 1)
    }

    this.pool.push(graphic)
  }

  releaseAll(): void {
    while (this.active.length > 0) {
      const graphic = this.active.pop()
      if (graphic != null) {
        graphic.clear()
        graphic.visible = false
        graphic.parent?.removeChild(graphic)
        this.pool.push(graphic)
      }
    }
  }

  destroy(): void {
    this.releaseAll()

    for (const graphic of this.pool) {
      graphic.destroy()
    }

    this.pool = []
  }

  private createGraphic(): PIXI.Graphics {
    const graphic = new PIXI.Graphics()
    graphic.visible = false
    return graphic
  }
}
