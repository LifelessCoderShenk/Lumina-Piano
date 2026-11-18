/** First trial build: every video export is watermarked, including signed-in users.
 * No local preference or account metadata can enable paid exports.
 */
export function drawTrialWatermark(context: CanvasRenderingContext2D, width: number, height: number) {
  const size = Math.max(14, Math.round(height * 0.022))
  const margin = Math.max(12, Math.round(width * 0.018))
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  context.font = `600 ${size}px Arial, sans-serif`
  context.textAlign = 'right'
  context.textBaseline = 'bottom'
  context.lineWidth = Math.max(3, size / 5)
  context.strokeStyle = 'rgba(0, 0, 0, 0.85)'
  context.fillStyle = 'rgba(255, 255, 255, 0.9)'
  const label = 'Lumina Piano · Trial'
  context.strokeText(label, width - margin, height - margin)
  context.fillText(label, width - margin, height - margin)
  context.restore()
}

export function trialFrameComposer(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Could not create trial export canvas.')
  return () => {
    context.drawImage(source, 0, 0)
    drawTrialWatermark(context, canvas.width, canvas.height)
    return canvas
  }
}
