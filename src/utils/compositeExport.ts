export interface CompositeCrop {
  bottom: number
  left: number
  right: number
  top: number
}

export interface CompositeExportOptions {
  crop?: Partial<CompositeCrop>
  onAfterExportStop?: () => void
  onBeforeExportStart?: (exportVideo: HTMLVideoElement) => Promise<void> | void
  onProgress?: (progress: number) => void
}

const DEFAULT_CROP: CompositeCrop = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
}

export async function compositeExport(
  recordingBlob: Blob,
  pixiCanvas: HTMLCanvasElement,
  outputName: string,
  options: CompositeExportOptions = {},
): Promise<void> {
  if (typeof MediaRecorder !== 'function') {
    throw new Error('MediaRecorder is unavailable')
  }

  const exportVideo = document.createElement('video')
  const recordingUrl = URL.createObjectURL(recordingBlob)
  exportVideo.src = recordingUrl
  exportVideo.muted = true
  exportVideo.playsInline = true

  let animationFrameId: number | null = null
  const crop = normalizeCrop(options.crop)

  try {
    await waitForVideoMetadata(exportVideo)

    const width = exportVideo.videoWidth || 1920
    const height = exportVideo.videoHeight || 1080
    const compositeCanvas = document.createElement('canvas')
    compositeCanvas.width = width
    compositeCanvas.height = height

    const context = compositeCanvas.getContext('2d')
    if (context == null) {
      throw new Error('Composite canvas context unavailable')
    }

    const compositeStream = compositeCanvas.captureStream(60)
    const exportChunks: BlobPart[] = []

    await new Promise<void>(async (resolve, reject) => {
      const exportRecorder = new MediaRecorder(compositeStream, {
        mimeType: 'video/webm;codecs=vp9',
      })

      let exportFinished = false

      const cleanup = () => {
        if (animationFrameId != null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        exportVideo.pause()
        exportVideo.removeEventListener('ended', finalizeExport)
      }

      const finalizeExport = () => {
        if (exportFinished) {
          return
        }

        exportFinished = true
        cleanup()
        options.onAfterExportStop?.()
        if (exportRecorder.state !== 'inactive') {
          exportRecorder.stop()
        }
      }

      exportRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data != null) {
          exportChunks.push(event.data)
        }
      }

      exportRecorder.onerror = () => {
        cleanup()
        reject(new Error('Composite export recorder failed'))
      }

      exportRecorder.onstop = () => {
        try {
          const finalBlob = new Blob(exportChunks, { type: 'video/webm' })
          const exportUrl = URL.createObjectURL(finalBlob)
          const link = document.createElement('a')
          link.href = exportUrl
          link.download = `${sanitizeFileName(outputName)}.webm`
          link.click()
          URL.revokeObjectURL(exportUrl)
          resolve()
        } catch (error) {
          reject(error)
        }
      }

      exportVideo.addEventListener('ended', finalizeExport)
      exportVideo.currentTime = 0
      const startedExternally = options.onBeforeExportStart != null
      await options.onBeforeExportStart?.(exportVideo)
      if (!startedExternally) {
        await exportVideo.play()
      }
      exportRecorder.start()

      const drawExportFrame = () => {
        if (exportFinished) {
          return
        }

        context.fillStyle = '#000000'
        context.fillRect(0, 0, width, height)
        context.drawImage(pixiCanvas, 0, 0, width, height * 0.6)

        const sourceVideoWidth = Math.max(1, exportVideo.videoWidth)
        const sourceVideoHeight = Math.max(1, exportVideo.videoHeight)
        const normalizedCropLeft = Math.min(crop.left, Math.max(0, sourceVideoWidth - 1))
        const normalizedCropTop = Math.min(crop.top, Math.max(0, sourceVideoHeight - 1))
        const normalizedCropRight = Math.min(
          crop.right,
          Math.max(0, sourceVideoWidth - normalizedCropLeft - 1),
        )
        const normalizedCropBottom = Math.min(
          crop.bottom,
          Math.max(0, sourceVideoHeight - normalizedCropTop - 1),
        )
        const sourceWidth = Math.max(
          1,
          sourceVideoWidth - normalizedCropLeft - normalizedCropRight,
        )
        const sourceHeight = Math.max(
          1,
          sourceVideoHeight - normalizedCropTop - normalizedCropBottom,
        )

        context.drawImage(
          exportVideo,
          normalizedCropLeft,
          normalizedCropTop,
          sourceWidth,
          sourceHeight,
          0,
          height * 0.6,
          width,
          height * 0.4,
        )

        if (exportVideo.ended) {
          finalizeExport()
          return
        }

        const progress = exportVideo.duration > 0
          ? Math.min(1, exportVideo.currentTime / exportVideo.duration)
          : 0
        options.onProgress?.(progress)
        animationFrameId = requestAnimationFrame(drawExportFrame)
      }

      animationFrameId = requestAnimationFrame(drawExportFrame)
    })
  } finally {
    if (animationFrameId != null) {
      cancelAnimationFrame(animationFrameId)
    }
    URL.revokeObjectURL(recordingUrl)
  }
}

function normalizeCrop(crop: CompositeExportOptions['crop']): CompositeCrop {
  return {
    bottom: clampCropValue(crop?.bottom),
    left: clampCropValue(crop?.left),
    right: clampCropValue(crop?.right),
    top: clampCropValue(crop?.top),
  }
}

function clampCropValue(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, value)
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
}

async function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  const hasMetadata =
    video.readyState >= HTMLMediaElement.HAVE_METADATA ||
    Number.isFinite(video.duration) ||
    video.videoWidth > 0 ||
    video.videoHeight > 0

  if (hasMetadata) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoadedMetadata = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Unable to load export video metadata'))
    }

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
    video.addEventListener('error', handleError, { once: true })
    if (typeof video.load === 'function') {
      video.load()
    }
  })
}
