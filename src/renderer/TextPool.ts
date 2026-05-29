import * as PIXI from 'pixi.js'

interface TextPoolOptions {
  fontSize: number
  fill: number
  compactFontSize?: number
  compactFill?: number
  anchorX?: number
  anchorY?: number
  fontFamily?: string
  fontWeight?: string
  dropShadow?: boolean
  dropShadowColor?: number
  dropShadowDistance?: number
  dropShadowBlur?: number
  resolution?: number
  prewarmCount?: number
}

export class TextPool {
  private pool: PIXI.Text[] = []
  private active: PIXI.Text[] = []
  private style: PIXI.TextStyle
  private compactStyle: PIXI.TextStyle
  private readonly anchorX: number
  private readonly anchorY: number
  private resolution: number
  private options: TextPoolOptions

  constructor(options: TextPoolOptions) {
    this.options = { ...options }
    this.anchorX = options.anchorX ?? 0.5
    this.anchorY = options.anchorY ?? 0.5
    this.resolution = options.resolution ?? getDefaultTextResolution()

    this.style = createTextStyle(this.options, options.fill, options.fontSize)
    this.compactStyle = createTextStyle(
      this.options,
      options.compactFill ?? options.fill,
      options.compactFontSize ?? options.fontSize,
    )

    this.prewarm(options.prewarmCount ?? 0)
  }

  prewarm(count: number): void {
    const targetCount = Math.max(0, Math.floor(count))

    while ((this.pool.length + this.active.length) < targetCount) {
      this.pool.push(this.createText())
    }
  }

  acquire(compact = false): PIXI.Text {
    const text = this.pool.pop() ?? this.createText()
    text.visible = true
    text.style = compact ? this.compactStyle : this.style
    text.resolution = this.resolution
    text.scale.set(1)
    this.active.push(text)
    return text
  }

  updateStyles(nextOptions: Partial<TextPoolOptions>): void {
    const mergedOptions: TextPoolOptions = {
      ...this.options,
      ...nextOptions,
    }
    if (areTextPoolOptionsEqual(this.options, mergedOptions)) {
      return
    }

    this.options = mergedOptions
    this.resolution = this.options.resolution ?? getDefaultTextResolution()
    this.style = createTextStyle(this.options, this.options.fill, this.options.fontSize)
    this.compactStyle = createTextStyle(
      this.options,
      this.options.compactFill ?? this.options.fill,
      this.options.compactFontSize ?? this.options.fontSize,
    )

    for (const text of this.active) {
      text.style = this.style
      text.resolution = this.resolution
    }

    for (const text of this.pool) {
      text.style = this.style
      text.resolution = this.resolution
    }
  }

  release(text: PIXI.Text): void {
    text.text = ''
    text.visible = false
    text.parent?.removeChild(text)

    const activeIndex = this.active.indexOf(text)
    if (activeIndex >= 0) {
      this.active.splice(activeIndex, 1)
    }

    this.pool.push(text)
  }

  releaseAll(): void {
    while (this.active.length > 0) {
      const text = this.active.pop()
      if (text != null) {
        text.text = ''
        text.visible = false
        text.parent?.removeChild(text)
        this.pool.push(text)
      }
    }
  }

  destroy(): void {
    this.releaseAll()

    for (const text of this.pool) {
      text.destroy()
    }

    this.pool = []
  }

  private createText(): PIXI.Text {
    const text = new PIXI.Text('', this.style)
    text.anchor.set(this.anchorX, this.anchorY)
    text.resolution = this.resolution
    text.visible = false
    return text
  }
}

function createTextStyle(options: TextPoolOptions, fill: number, fontSize: number): PIXI.TextStyle {
  const resolution = options.resolution ?? getDefaultTextResolution()
  const style = new PIXI.TextStyle({
    align: 'center',
    dropShadow: options.dropShadow ?? true,
    dropShadowBlur: options.dropShadowBlur ?? 1,
    dropShadowColor: options.dropShadowColor ?? 0x000000,
    dropShadowDistance: options.dropShadowDistance ?? 1,
    fill,
    fontFamily: options.fontFamily ?? 'Arial, sans-serif',
    fontSize,
    fontWeight: options.fontWeight ?? 'bold',
  })

  ;(style as PIXI.TextStyle & { resolution?: number }).resolution = resolution
  return style
}

function getDefaultTextResolution(): number {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
    return 2
  }

  return Math.max(2, window.devicePixelRatio * 2)
}

function areTextPoolOptionsEqual(left: TextPoolOptions, right: TextPoolOptions): boolean {
  return (
    left.anchorX === right.anchorX &&
    left.anchorY === right.anchorY &&
    left.compactFill === right.compactFill &&
    left.compactFontSize === right.compactFontSize &&
    left.dropShadow === right.dropShadow &&
    left.dropShadowBlur === right.dropShadowBlur &&
    left.dropShadowColor === right.dropShadowColor &&
    left.dropShadowDistance === right.dropShadowDistance &&
    left.fill === right.fill &&
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.prewarmCount === right.prewarmCount &&
    left.resolution === right.resolution
  )
}
