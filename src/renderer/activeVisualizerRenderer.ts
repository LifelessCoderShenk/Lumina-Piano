export interface ActiveVisualizerRenderer {
  getKeyX(pitch: number): number
  getKeyboardY(): number
  setKeyboardOpacity(opacity: number): void
}

const activeVisualizerRendererRef: { current: ActiveVisualizerRenderer | null } = {
  current: null,
}

export function registerActiveVisualizerRenderer(renderer: ActiveVisualizerRenderer | null): void {
  activeVisualizerRendererRef.current = renderer
}

export function clearActiveVisualizerRenderer(renderer: ActiveVisualizerRenderer | null): void {
  if (renderer == null || activeVisualizerRendererRef.current === renderer) {
    activeVisualizerRendererRef.current = null
  }
}

export function getActiveVisualizerRenderer(): ActiveVisualizerRenderer | null {
  return activeVisualizerRendererRef.current
}
