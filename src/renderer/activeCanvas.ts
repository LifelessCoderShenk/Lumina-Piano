const activeVisualizerCanvasRef: { current: HTMLCanvasElement | null } = {
  current: null,
}

export function registerActiveVisualizerCanvas(canvas: HTMLCanvasElement | null): void {
  activeVisualizerCanvasRef.current = canvas
}

export function clearActiveVisualizerCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas == null || activeVisualizerCanvasRef.current === canvas) {
    activeVisualizerCanvasRef.current = null
  }
}

export function getActiveVisualizerCanvas(): HTMLCanvasElement | null {
  return activeVisualizerCanvasRef.current
}
