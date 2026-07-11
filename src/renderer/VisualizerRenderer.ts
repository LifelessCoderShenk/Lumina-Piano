export type VisualizerEngine = 'pixi' | 'three'

export interface VisualizerRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>
  destroy(): Promise<void>
  resize(width: number, height: number): void
  renderFrame(tick: number): void
  getCanvas(): HTMLCanvasElement
}
