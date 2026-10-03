import type { CameraOverlaySettings } from '../store/types'
import type { ExportResolution } from '../export/types'
import { resolveCameraOrientationGeometry } from '../components/shared/cameraOrientation'
import { writeExportFile } from '../export/exportFileSystem'

export interface CompositeCrop {
  bottom: number
  left: number
  right: number
  top: number
}

export interface CompositeExportOptions {
  /** Complete preview transform snapshot. New callers should use this. */
  cameraOverlay?: CameraOverlaySettings
  /** Untransformed CSS dimensions of the preview visualizer wrapper. */
  previewLayout?: CompositePreviewLayout
  /** Selected destination for the WebM composite. Omit only for legacy download callers. */
  outputPath?: string
  /** Snapshot output rate for the composed camera + visualizer stream. */
  frameRate?: 30 | 60
  /** Explicit final canvas size. Defaults to the recorded camera dimensions. */
  outputResolution?: ExportResolution
  abortSignal?: AbortSignal
  /** @deprecated Use cameraOverlay; retained for callers during migration. */
  crop?: Partial<CompositeCrop>
  /** Duration measured from the recording Blob before export starts. */
  expectedDurationSeconds?: number | null
  /** True when the original camera stream contained a microphone track. */
  includeCameraAudio?: boolean
  /** Deterministically rendered MIDI audio; null means no MIDI audio to mix. */
  midiAudioBuffer?: AudioBuffer | null
  /** Position inside the MIDI buffer when camera source time is zero. Negative values delay MIDI. */
  midiAudioSourceTimeAtExportStartSeconds?: number
  /** Reports a non-fatal export degradation, such as an unavailable audio mix. */
  onWarning?: (message: string) => void
  onAfterExportStop?: () => void
  onBeforeExportStart?: (
    exportVideo: HTMLVideoElement,
    outputResolution: ExportResolution,
  ) => Promise<void> | void
  /** Called immediately before the visualizer canvas is sampled for each composite frame. */
  onBeforeDrawFrame?: (cameraSourceTimeSeconds: number) => void
  onProgress?: (progress: number) => void
}

export interface CompositeExportResult {
  blob: Blob
  outputPath: string | null
}

export interface CompositePreviewLayout {
  /** Height of the complete live composite, including the camera area. */
  compositeHeight?: number
  visualizerHeight: number
  visualizerWidth: number
}

export interface CompositeDrawPlan {
  camera: {
    centerX: number
    centerY: number
    destinationHeight: number
    destinationY: number
    coverScale: number
    sourceCrop: NonNullable<ReturnType<typeof resolveCameraOrientationGeometry>>['sourceCrop']
    transform: NonNullable<ReturnType<typeof resolveCameraOrientationGeometry>>['exportTransform']
  }
  visualizer: {
    height: number
    offsetX: number
    offsetY: number
    scale: number
  }
}

const VISUALIZER_HEIGHT_FRACTION = 0.6
const PORTRAIT_VISUALIZER_HEIGHT_FRACTION = 0.65

export async function compositeExport(
  recordingBlob: Blob,
  pixiCanvas: HTMLCanvasElement,
  outputName: string,
  options: CompositeExportOptions = {},
): Promise<CompositeExportResult> {
  if (typeof MediaRecorder !== 'function') {
    throw new Error('MediaRecorder is unavailable')
  }

  const exportVideo = document.createElement('video')
  const recordingUrl = URL.createObjectURL(recordingBlob)
  exportVideo.src = recordingUrl
  exportVideo.muted = true
  exportVideo.playsInline = true

  let animationFrameId: number | null = null
  let audioSession: CompositeAudioSession | null = null
  const cameraOverlay = normalizeCameraOverlay(options.cameraOverlay, options.crop)

  try {
    await waitForVideoMetadata(exportVideo)
    const expectedDurationSeconds = normalizeDuration(options.expectedDurationSeconds)
    const sourceDurationSeconds = normalizeDuration(exportVideo.duration)
    const verifiedDurationSeconds = expectedDurationSeconds ?? sourceDurationSeconds
    if (
      expectedDurationSeconds != null &&
      sourceDurationSeconds != null &&
      Math.abs(expectedDurationSeconds - sourceDurationSeconds) > 0.1
    ) {
      console.warn(
        `[Composite export] Recording duration mismatch: probe=${expectedDurationSeconds}s, source=${sourceDurationSeconds}s.`,
      )
      if (sourceDurationSeconds < expectedDurationSeconds) {
        throw new Error('Recording source is shorter than its verified recording duration')
      }
    }

    const width = Math.max(1, Math.round(options.outputResolution?.width ?? exportVideo.videoWidth ?? 1920))
    const height = Math.max(1, Math.round(options.outputResolution?.height ?? exportVideo.videoHeight ?? 1080))
    const compositeCanvas = document.createElement('canvas')
    compositeCanvas.width = width
    compositeCanvas.height = height

    const context = compositeCanvas.getContext('2d')
    if (context == null) {
      throw new Error('Composite canvas context unavailable')
    }

    const videoStream = compositeCanvas.captureStream(options.frameRate ?? 60)
    audioSession = await createCompositeAudioSession(exportVideo, options)
    if (
      audioSession == null &&
      (options.includeCameraAudio === true || options.midiAudioBuffer != null)
    ) {
      options.onWarning?.('Audio could not be added to this export; the video was saved without audio.')
    }
    const compositeStream = createMuxedCompositeStream(videoStream, audioSession)
    const exportChunks: BlobPart[] = []

    return await new Promise<CompositeExportResult>(async (resolve, reject) => {
      const exportRecorder = new MediaRecorder(
        compositeStream,
        resolveCompositeRecorderOptions(width, height, options.frameRate ?? 60),
      )

      let exportFinished = false
      let exportFailed = false
      let drawExportFrame: () => void

      const cleanup = () => {
        if (animationFrameId != null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        exportVideo.pause()
        exportVideo.removeEventListener('ended', handleSourceEnded)
        options.abortSignal?.removeEventListener('abort', handleAbort)
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

      const hasReachedVerifiedDuration = () => (
        verifiedDurationSeconds != null &&
        exportVideo.currentTime >= verifiedDurationSeconds - (1 / 60)
      )

      const handleSourceEnded = () => {
        if (verifiedDurationSeconds == null || hasReachedVerifiedDuration()) {
          finalizeExport()
          return
        }

        // An early `ended` must not silently turn a long recording into a
        // short export. Ask the source to resume and surface a failure instead
        // of writing a truncated file if it cannot.
        void exportVideo.play()
          .then(() => {
            if (!exportFinished) {
              animationFrameId = requestAnimationFrame(drawExportFrame)
            }
          })
          .catch(() => {
            cleanup()
            reject(new Error('Recording source ended before its verified duration'))
          })
      }

      exportRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data != null) {
          exportChunks.push(event.data)
        }
      }

      exportRecorder.onerror = () => {
        exportFailed = true
        cleanup()
        reject(new Error('Composite export recorder failed'))
      }

      exportRecorder.onstop = () => {
        if (exportFailed) return
        void (async () => {
          try {
            if (options.abortSignal?.aborted) {
              return
            }
            const finalBlob = new Blob(exportChunks, { type: 'video/webm' })
            const outputPath = options.outputPath?.trim()
            if (outputPath != null && outputPath.length > 0) {
              await writeExportFile(outputPath, new Uint8Array(await finalBlob.arrayBuffer()))
              resolve({ blob: finalBlob, outputPath })
              return
            }

            const exportUrl = URL.createObjectURL(finalBlob)
            const link = document.createElement('a')
            link.href = exportUrl
            link.download = `${sanitizeFileName(outputName)}.webm`
            link.click()
            URL.revokeObjectURL(exportUrl)
            resolve({ blob: finalBlob, outputPath: null })
          } catch (error) {
            reject(error)
          }
        })()
      }

      const handleAbort = () => {
        if (exportFinished) {
          return
        }
        exportFinished = true
        cleanup()
        if (exportRecorder.state !== 'inactive') {
          exportRecorder.stop()
        }
        reject(new Error('Composite export cancelled'))
      }

      exportVideo.addEventListener('ended', handleSourceEnded)
      if (options.abortSignal?.aborted) {
        handleAbort()
        return
      }
      options.abortSignal?.addEventListener('abort', handleAbort, { once: true })
      exportVideo.currentTime = 0
      exportRecorder.start(1000)
      const startedExternally = options.onBeforeExportStart != null
      try {
        const beforeExportResult = options.onBeforeExportStart?.(exportVideo, { height, width })
        if (beforeExportResult != null) await beforeExportResult
        if (!startedExternally) await exportVideo.play()
      } catch (error) {
        exportFailed = true
        cleanup()
        if (exportRecorder.state !== 'inactive') exportRecorder.stop()
        reject(error)
        return
      }
      audioSession?.startMidiAt(options.midiAudioSourceTimeAtExportStartSeconds ?? 0)

      drawExportFrame = () => {
        if (exportFinished) {
          return
        }

        if (options.abortSignal?.aborted) {
          handleAbort()
          return
        }

        try {
          options.onBeforeDrawFrame?.(exportVideo.currentTime)
        } catch (error) {
          exportFailed = true
          cleanup()
          if (exportRecorder.state !== 'inactive') exportRecorder.stop()
          reject(error)
          return
        }
        drawCompositeFrame(
          context,
          exportVideo,
          pixiCanvas,
          cameraOverlay,
          options.previewLayout,
          width,
          height,
        )

        if (hasReachedVerifiedDuration()) {
          finalizeExport()
          return
        }

        if (exportVideo.ended) {
          handleSourceEnded()
          return
        }

        const progress = verifiedDurationSeconds != null
          ? Math.min(1, exportVideo.currentTime / verifiedDurationSeconds)
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
    audioSession?.dispose()
    URL.revokeObjectURL(recordingUrl)
  }
}

interface CompositeAudioSession {
  dispose(): void
  startMidiAt(sourceTimeAtExportStartSeconds: number): void
  stream: MediaStream
}

async function createCompositeAudioSession(
  exportVideo: HTMLVideoElement,
  options: CompositeExportOptions,
): Promise<CompositeAudioSession | null> {
  if (!options.includeCameraAudio && options.midiAudioBuffer == null) {
    return null
  }

  const AudioContextConstructor = globalThis.AudioContext
  if (AudioContextConstructor == null) {
    console.warn('[Composite export] AudioContext is unavailable; exporting video without audio.')
    return null
  }

  const context = new AudioContextConstructor()
  let cameraSource: MediaElementAudioSourceNode | null = null
  let midiSource: AudioBufferSourceNode | null = null

  try {
    if (context.state === 'suspended') {
      await context.resume()
    }

    const destination = context.createMediaStreamDestination()
    if (options.includeCameraAudio) {
      // This detached export element has no speaker route. Its decoded camera
      // audio flows solely into the captured media destination.
      exportVideo.muted = false
      cameraSource = context.createMediaElementSource(exportVideo)
      cameraSource.connect(destination)
    }

    if (options.midiAudioBuffer != null) {
      midiSource = context.createBufferSource()
      midiSource.buffer = options.midiAudioBuffer
      midiSource.connect(destination)
    }

    return {
      dispose: () => {
        try {
          midiSource?.stop()
          midiSource?.disconnect()
          cameraSource?.disconnect()
          destination.disconnect()
          void context.close()
        } catch {
          // Cleanup is best effort after a completed or failed export.
        }
      },
      startMidiAt: (sourceTimeAtExportStartSeconds) => {
        if (midiSource == null) return
        const sourceTime = Number.isFinite(sourceTimeAtExportStartSeconds)
          ? sourceTimeAtExportStartSeconds
          : 0
        const sourceDuration = midiSource.buffer?.duration
        if (sourceDuration != null && Number.isFinite(sourceDuration) && sourceTime >= sourceDuration) {
          return
        }
        const delaySeconds = Math.max(0, -sourceTime)
        const sourceOffsetSeconds = Math.max(0, sourceTime)
        const contextTime = Number.isFinite(context.currentTime) ? context.currentTime : 0
        midiSource.start(contextTime + delaySeconds, sourceOffsetSeconds)
      },
      stream: destination.stream,
    }
  } catch (error) {
    try {
      cameraSource?.disconnect()
      midiSource?.disconnect()
      await context.close()
    } catch {
      // Preserve the primary setup error below.
    }
    console.warn('[Composite export] Unable to create audio mix; continuing without unavailable audio.', error)
    return null
  }
}

function createMuxedCompositeStream(videoStream: MediaStream, audioSession: CompositeAudioSession | null): MediaStream {
  const audioTracks = audioSession?.stream.getAudioTracks() ?? []
  if (audioTracks.length === 0) {
    return videoStream
  }

  return new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioTracks,
  ])
}

/**
 * Chromium's MediaRecorder default is tuned for screen sharing, not a
 * native-resolution camera composite. Supply a conservative VP9 bitrate
 * based on output pixels so a 1080p/4K camera source is not re-encoded into
 * soft, blocky video before it reaches disk.
 */
export function resolveCompositeRecorderOptions(
  width: number,
  height: number,
  frameRate: number,
): MediaRecorderOptions | undefined {
  const supportedMimeType = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((mimeType) => (
    typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(mimeType)
  ))

  if (supportedMimeType == null) {
    return undefined
  }

  return {
    audioBitsPerSecond: 192_000,
    mimeType: supportedMimeType,
    videoBitsPerSecond: resolveCompositeVideoBitrate(width, height, frameRate),
  }
}

/** Uses a VP9-quality pixel budget while preventing unreasonable file sizes. */
export function resolveCompositeVideoBitrate(width: number, height: number, frameRate: number): number {
  const pixelRate = Math.max(1, Math.round(width)) * Math.max(1, Math.round(height)) * Math.max(1, frameRate)
  return Math.min(45_000_000, Math.max(6_000_000, Math.round(pixelRate * 0.18)))
}

/** Captures untransformed preview dimensions before a native-size export starts. */
export function getCompositePreviewLayout(
  visualizerElement: HTMLElement | null,
  fallbackCanvas: HTMLCanvasElement,
): CompositePreviewLayout {
  const visualizerHeight = Math.max(1, visualizerElement?.clientHeight || fallbackCanvas.clientHeight || fallbackCanvas.height || 1)
  const visualizerWidth = Math.max(1, visualizerElement?.clientWidth || fallbackCanvas.clientWidth || fallbackCanvas.width || 1)
  const containingHeight = visualizerElement?.parentElement?.clientHeight ?? 0

  return {
    compositeHeight: containingHeight > visualizerHeight ? containingHeight : undefined,
    visualizerHeight,
    visualizerWidth,
  }
}

/**
 * Converts the actual live split into the output canvas dimensions. Camera
 * alignment can expand the visualizer beyond the normal 60%, so exporting a
 * hard-coded 60/40 split makes the saved composition visibly jump.
 */
export function resolveCompositeVisualizerSize(
  outputWidth: number,
  outputHeight: number,
  previewLayout?: CompositePreviewLayout,
): { height: number; width: number } {
  const liveFraction = previewLayout?.compositeHeight != null
    ? previewLayout.visualizerHeight / previewLayout.compositeHeight
    : VISUALIZER_HEIGHT_FRACTION
  const portraitMinimum = outputHeight / outputWidth >= 1.5
    ? PORTRAIT_VISUALIZER_HEIGHT_FRACTION
    : 0
  const visualizerHeight = Math.max(
    1,
    Math.round(outputHeight * clamp(Math.max(liveFraction, portraitMinimum), 0.05, 0.95)),
  )

  return { height: visualizerHeight, width: Math.max(1, Math.round(outputWidth)) }
}

export function resolveCompositeDrawPlan(
  cameraOverlay: CameraOverlaySettings,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  previewLayout?: CompositePreviewLayout,
): CompositeDrawPlan | null {
  const geometry = resolveCameraOrientationGeometry(cameraOverlay, sourceWidth, sourceHeight)
  if (geometry == null) {
    return null
  }

  const visualizerSize = resolveCompositeVisualizerSize(outputWidth, outputHeight, previewLayout)
  const destinationY = visualizerSize.height
  const destinationHeight = outputHeight - destinationY
  const isQuarterTurn = geometry.exportTransform.rotationDegrees === 90 || geometry.exportTransform.rotationDegrees === 270
  const rotatedCropWidth = isQuarterTurn ? geometry.sourceCrop.height : geometry.sourceCrop.width
  const rotatedCropHeight = isQuarterTurn ? geometry.sourceCrop.width : geometry.sourceCrop.height
  const visualizerHeight = visualizerSize.height
  const layout = previewLayout ?? {
    visualizerHeight,
    visualizerWidth: outputWidth,
  }

  return {
    camera: {
      centerX: outputWidth / 2,
      centerY: destinationY + (destinationHeight / 2),
      destinationHeight,
      destinationY,
      coverScale: Math.max(outputWidth / rotatedCropWidth, destinationHeight / rotatedCropHeight),
      sourceCrop: geometry.sourceCrop,
      transform: geometry.exportTransform,
    },
    visualizer: {
      height: visualizerHeight,
      offsetX: cameraOverlay.offsetX * (outputWidth / layout.visualizerWidth),
      offsetY: cameraOverlay.offsetY * (visualizerHeight / layout.visualizerHeight),
      scale: cameraOverlay.scale,
    },
  }
}

/** Draws one complete camera + visualizer frame for either live or offline export. */
export function drawCompositeFrame(
  context: CanvasRenderingContext2D,
  cameraVideo: HTMLVideoElement,
  visualizerCanvas: HTMLCanvasElement,
  cameraOverlay: CameraOverlaySettings,
  previewLayout: CompositePreviewLayout | undefined,
  outputWidth: number,
  outputHeight: number,
): void {
  context.fillStyle = '#000000'
  context.fillRect(0, 0, outputWidth, outputHeight)
  drawCameraFrame(context, cameraVideo, cameraOverlay, previewLayout, outputWidth, outputHeight)
  drawVisualizerFrame(context, visualizerCanvas, cameraOverlay, previewLayout, outputWidth, outputHeight)
}

function drawCameraFrame(
  context: CanvasRenderingContext2D,
  exportVideo: HTMLVideoElement,
  cameraOverlay: CameraOverlaySettings,
  previewLayout: CompositePreviewLayout | undefined,
  outputWidth: number,
  outputHeight: number,
): void {
  const plan = resolveCompositeDrawPlan(
    cameraOverlay,
    Math.max(1, exportVideo.videoWidth),
    Math.max(1, exportVideo.videoHeight),
    outputWidth,
    outputHeight,
    previewLayout,
  )
  if (plan == null) {
    return
  }

  context.save()
  context.beginPath()
  context.rect(0, plan.camera.destinationY, outputWidth, plan.camera.destinationHeight)
  context.clip()
  context.translate(plan.camera.centerX, plan.camera.centerY)
  context.rotate((plan.camera.transform.rotationDegrees * Math.PI) / 180)
  context.scale(plan.camera.transform.flipX, plan.camera.transform.flipY)
  context.drawImage(
    exportVideo,
    plan.camera.sourceCrop.left,
    plan.camera.sourceCrop.top,
    plan.camera.sourceCrop.width,
    plan.camera.sourceCrop.height,
    -(plan.camera.sourceCrop.width * plan.camera.coverScale) / 2,
    -(plan.camera.sourceCrop.height * plan.camera.coverScale) / 2,
    plan.camera.sourceCrop.width * plan.camera.coverScale,
    plan.camera.sourceCrop.height * plan.camera.coverScale,
  )
  context.restore()
}

function drawVisualizerFrame(
  context: CanvasRenderingContext2D,
  pixiCanvas: HTMLCanvasElement,
  cameraOverlay: CameraOverlaySettings,
  previewLayout: CompositePreviewLayout | undefined,
  outputWidth: number,
  outputHeight: number,
): void {
  const layout = previewLayout ?? getCompositePreviewLayout(null, pixiCanvas)
  const plan = resolveCompositeDrawPlan(
    cameraOverlay,
    1,
    1,
    outputWidth,
    outputHeight,
    layout,
  )
  if (plan == null) {
    return
  }

  // The preview applies these transforms only to the visualizer wrapper. Draw
  // it after the camera so its z-order and any intentional overlap match CSS.
  context.save()
  context.translate(plan.visualizer.offsetX, plan.visualizer.offsetY)
  context.scale(plan.visualizer.scale, plan.visualizer.scale)
  context.drawImage(pixiCanvas, 0, 0, outputWidth, plan.visualizer.height)
  context.restore()
}

function normalizeCameraOverlay(
  overlay: CameraOverlaySettings | undefined,
  legacyCrop: CompositeExportOptions['crop'],
): CameraOverlaySettings {
  if (overlay != null) {
    return overlay
  }

  const crop = normalizeCrop(legacyCrop)
  return {
    cropBottom: crop.bottom,
    cropLeft: crop.left,
    cropRight: crop.right,
    cropTop: crop.top,
    flipHorizontal: false,
    flipVertical: false,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    scale: 1,
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
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

function normalizeDuration(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null
}
