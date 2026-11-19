/** First trial build: every video export is watermarked, including signed-in users.
 * No local preference or account metadata can enable paid exports.
 */
// Same Lucide Piano mark used by the website brand; cached vector stays crisp at 4K.
let symbol: Path2D | undefined
export function drawTrialWatermark(context: CanvasRenderingContext2D, width: number, height: number) {
  symbol ??= new Path2D('M18.5 8c-1.4 0-2.6-.8-3.2-2A6.87 6.87 0 0 0 2 9v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8.5C22 9.6 20.4 8 18.5 8 M2 14h20 M6 14v4 M10 14v4 M14 14v4 M18 14v4')
  const unit = Math.max(0.75, height / 1080)
  const margin = 24 * unit
  const centerX = width - margin - 26 * unit
  const baseline = height - margin
  const iconSize = 30 * unit
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalAlpha = 0.8
  context.globalCompositeOperation = 'source-over'
  context.shadowColor = 'rgba(0, 0, 0, 0.7)'
  context.shadowBlur = 3 * unit
  context.shadowOffsetX = 0
  context.shadowOffsetY = unit
  context.strokeStyle = '#fff'
  context.fillStyle = '#fff'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.setTransform(iconSize / 24, 0, 0, iconSize / 24, centerX - iconSize / 2, baseline - 49 * unit)
  context.lineWidth = 1.5
  context.stroke(symbol)
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.font = `500 ${12 * unit}px Arial, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'bottom'
  context.fillText('Lumina', centerX, baseline)
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

