/*
INPUT: Render dimensions, playback ticks, and optional animation timing.
OUTPUT: The renderer-agnostic visualizer interface implemented by Pixi and Three renderers.
PURPOSE: Allows application views such as Transcriptor to reuse the existing keyboard renderer without depending on its internals.
*/

import type { RenderLayoutContext } from './layoutConstants'

export type VisualizerEngine = 'pixi' | 'three'

export interface VisualizerResizeOptions {
  layoutContext?: Partial<RenderLayoutContext>
  pixelRatio?: number
  postprocessScale?: number
}

export interface VisualizerRenderFrameOptions {
  animationTimeSeconds?: number
}

export interface LiveMidiNote {
  id: string
  pitch: number
  startedAtMs: number
  velocity: number
}

export interface VisualizerRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>
  destroy(): Promise<void>
  isReady(): boolean
  beginOfflineRender(): void
  endOfflineRender(): void
  getRenderLayoutContext?(): RenderLayoutContext
  resize(width: number, height: number, options?: VisualizerResizeOptions): void
  renderFrame(tick: number, options?: VisualizerRenderFrameOptions): void
  getCanvas(): HTMLCanvasElement
}
