import { ArrayBufferTarget, Muxer } from 'webm-muxer'

import type { CameraOverlaySettings, VisualizerSettings } from '../store/types'
import {
  drawCompositeFrame,
  resolveCompositeVideoBitrate,
  type CompositePreviewLayout,
} from '../utils/compositeExport'
import { ExportError } from './errors'
import { mkdirExportDir, rmExportDir, writeExportFile } from './exportFileSystem'
import { runFFmpeg } from './ExportEngine'
import type { ExportResolution } from './types'
import { writeAudioBufferToWav } from './wavWriter'

const KEYFRAME_INTERVAL_SECONDS = 2
const FRAME_PROGRESS_SHARE = 0.9

export interface PerformanceVideoExportOptions {
  abortSignal?: AbortSignal
  cameraOverlay: CameraOverlaySettings
  expectedDurationSeconds?: number | null
  frameRate: VisualizerSettings['framerate']
  includeCameraAudio: boolean
  midiAudioBuffer?: AudioBuffer | null
  /** Position inside the rendered MIDI buffer at camera source time zero. */
  midiAudioSourceTimeAtExportStartSeconds?: number
  soundtrackBlob?: Blob | null
  /** Position inside the imported soundtrack at camera source time zero. */
  soundtrackSourceTimeAtExportStartSeconds?: number
  onAfterExportStop?(): void
  onBeforeDrawFrame?(cameraSourceTimeSeconds: number): void
  onBeforeExportStart?(details: { height: number; width: number }): void | Promise<void>
  onFinalizing?(): void
  onProgress?(progress: number): void
  outputPath: string
  outputResolution: ExportResolution
  previewLayout?: CompositePreviewLayout
}

interface PerformanceMuxOptions {
  cameraAudioPath?: string | null
  durationSeconds: number
  midiAudioPath?: string | null
  midiAudioSourceTimeAtExportStartSeconds?: number
  soundtrackAudioPath?: string | null
  soundtrackSourceTimeAtExportStartSeconds?: number
  outputPath: string
  videoPath: string
}

/**
 * Encodes Performance Video one timestamped frame at a time. Source playback
 * never drives the render clock, so a slow preview or GPU cannot drop frames
 * or change the camera/MIDI alignment in the saved file.
 */
export async function exportPerformanceVideoDeterministically(
  recordingBlob: Blob,
  visualizerCanvas: HTMLCanvasElement,
  options: PerformanceVideoExportOptions,
): Promise<{ outputPath: string }> {
  assertWebCodecsAvailable()
  throwIfAborted(options.abortSignal)

  const sourceVideo = document.createElement('video')
  const sourceUrl = URL.createObjectURL(recordingBlob)
  sourceVideo.src = sourceUrl
  sourceVideo.muted = true
  sourceVideo.playsInline = true

  let tempDir: string | null = null
  let videoEncoder: VideoEncoder | null = null

  try {
    await waitForVideoMetadata(sourceVideo, options.abortSignal)
    await waitForVideoData(sourceVideo, options.abortSignal)

    const sourceDurationSeconds = normalizeDuration(sourceVideo.duration)
    const expectedDurationSeconds = normalizeDuration(options.expectedDurationSeconds)
    const durationSeconds = expectedDurationSeconds ?? sourceDurationSeconds
    if (durationSeconds == null) {
      throw new ExportError('Recording duration is unavailable.', 'FRAME_RENDER_FAILED')
    }
    if (
      sourceDurationSeconds != null &&
      expectedDurationSeconds != null &&
      sourceDurationSeconds + 0.1 < expectedDurationSeconds
    ) {
      throw new ExportError(
        'Recording source is shorter than its verified recording duration.',
        'FRAME_RENDER_FAILED',
      )
    }

    const width = Math.max(1, Math.round(options.outputResolution.width))
    const height = Math.max(1, Math.round(options.outputResolution.height))
    const frameRate = options.frameRate === 30 ? 30 : 60
    const totalFrames = resolvePerformanceFrameCount(durationSeconds, frameRate)
    const frameDurationMicros = Math.round(1_000_000 / frameRate)
    const keyframeInterval = Math.max(1, frameRate * KEYFRAME_INTERVAL_SECONDS)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context == null) {
      throw new ExportError('Composite canvas context is unavailable.', 'FRAME_RENDER_FAILED')
    }

    await options.onBeforeExportStart?.({ height, width })
    throwIfAborted(options.abortSignal)

    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      firstTimestampBehavior: 'offset',
      target,
      video: {
        codec: 'V_VP9',
        frameRate,
        height,
        width,
      },
    })
    let encoderError: unknown = null
    videoEncoder = new VideoEncoder({
      error: (error) => {
        encoderError = error
      },
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    })
    videoEncoder.configure({
      bitrate: resolveCompositeVideoBitrate(width, height, frameRate),
      codec: 'vp09.00.10.08',
      framerate: frameRate,
      height,
      latencyMode: 'quality',
      width,
    })

    const startedAt = performance.now()
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      throwIfAborted(options.abortSignal)
      throwIfEncoderErrored(encoderError)

      const cameraSourceTimeSeconds = Math.min(
        frameIndex / frameRate,
        Math.max(0, (sourceDurationSeconds ?? durationSeconds) - 0.000_001),
      )
      if (frameIndex > 0) {
        await seekVideo(sourceVideo, cameraSourceTimeSeconds, options.abortSignal)
      }
      options.onBeforeDrawFrame?.(cameraSourceTimeSeconds)
      drawCompositeFrame(
        context,
        sourceVideo,
        visualizerCanvas,
        options.cameraOverlay,
        options.previewLayout,
        width,
        height,
      )

      const frame = new VideoFrame(canvas, {
        duration: frameDurationMicros,
        timestamp: resolvePerformanceFrameTimestampMicros(frameIndex, frameRate),
      })
      videoEncoder.encode(frame, { keyFrame: frameIndex % keyframeInterval === 0 })
      frame.close()

      if (videoEncoder.encodeQueueSize > frameRate * 2) {
        await videoEncoder.flush()
      }

      options.onProgress?.(((frameIndex + 1) / totalFrames) * FRAME_PROGRESS_SHARE)
      if (frameIndex % 10 === 0) {
        await yieldToBrowser()
      }
    }

    await videoEncoder.flush()
    throwIfEncoderErrored(encoderError)
    muxer.finalize()
    videoEncoder.close()
    videoEncoder = null

    throwIfAborted(options.abortSignal)
    options.onFinalizing?.()
    options.onProgress?.(FRAME_PROGRESS_SHARE)

    tempDir = await getTempDir()
    await mkdirExportDir(tempDir)
    const videoPath = joinPath(tempDir, 'performance-frames.webm')
    await writeExportFile(videoPath, new Uint8Array(target.buffer))

    let cameraAudioPath: string | null = null
    if (options.includeCameraAudio) {
      cameraAudioPath = joinPath(tempDir, 'camera-source.webm')
      await writeExportFile(cameraAudioPath, new Uint8Array(await recordingBlob.arrayBuffer()))
    }

    let midiAudioPath: string | null = null
    const midiSourceTime = options.midiAudioSourceTimeAtExportStartSeconds ?? 0
    const hasAudibleMidi = options.midiAudioBuffer != null && (
      midiSourceTime < 0 || midiSourceTime < options.midiAudioBuffer.duration
    )
    if (options.midiAudioBuffer != null && hasAudibleMidi) {
      midiAudioPath = joinPath(tempDir, 'midi-audio.wav')
      await writeAudioBufferToWav(options.midiAudioBuffer, midiAudioPath)
    }

    let soundtrackAudioPath: string | null = null
    if (options.soundtrackBlob != null) {
      soundtrackAudioPath = joinPath(tempDir, `soundtrack${audioFileExtension(options.soundtrackBlob.type)}`)
      await writeExportFile(soundtrackAudioPath, new Uint8Array(await options.soundtrackBlob.arrayBuffer()))
    }

    throwIfAborted(options.abortSignal)
    await runFFmpeg(createPerformanceMuxArgs({
      cameraAudioPath,
      durationSeconds,
      midiAudioPath,
      midiAudioSourceTimeAtExportStartSeconds: midiSourceTime,
      soundtrackAudioPath,
      soundtrackSourceTimeAtExportStartSeconds: options.soundtrackSourceTimeAtExportStartSeconds,
      outputPath: options.outputPath,
      videoPath,
    }))
    throwIfAborted(options.abortSignal)
    options.onProgress?.(1)
    console.info(
      `[Performance export] Encoded ${totalFrames} deterministic frames at ${frameRate} FPS in `
      + `${Math.max(0, (performance.now() - startedAt) / 1000).toFixed(1)}s.`,
    )
    return { outputPath: options.outputPath }
  } finally {
    videoEncoder?.close()
    sourceVideo.pause()
    sourceVideo.removeAttribute('src')
    sourceVideo.load()
    URL.revokeObjectURL(sourceUrl)
    options.onAfterExportStop?.()
    if (tempDir != null) {
      await rmExportDir(tempDir).catch((error) => {
        console.warn('[Performance export] Unable to remove temporary files.', error)
      })
    }
  }
}

export function createPerformanceMuxArgs(options: PerformanceMuxOptions): string[] {
  const args = ['-y', '-i', options.videoPath]
  const filters: string[] = []
  const audioLabels: string[] = []
  const duration = formatSeconds(options.durationSeconds)
  let inputIndex = 1

  if (options.cameraAudioPath != null) {
    args.push('-i', options.cameraAudioPath)
    filters.push(`[${inputIndex}:a:0]atrim=duration=${duration},asetpts=PTS-STARTPTS[camera]`)
    audioLabels.push('[camera]')
    inputIndex += 1
  }

  if (options.midiAudioPath != null) {
    args.push('-i', options.midiAudioPath)
    const sourceTime = Number.isFinite(options.midiAudioSourceTimeAtExportStartSeconds)
      ? options.midiAudioSourceTimeAtExportStartSeconds ?? 0
      : 0
    if (sourceTime >= 0) {
      filters.push(
        `[${inputIndex}:a:0]atrim=start=${formatSeconds(sourceTime)}:duration=${duration},`
        + 'asetpts=PTS-STARTPTS[midi]',
      )
    } else {
      const delayMilliseconds = Math.max(0, Math.round(-sourceTime * 1000))
      filters.push(
        `[${inputIndex}:a:0]asetpts=PTS-STARTPTS,adelay=${delayMilliseconds}:all=1,`
        + `atrim=duration=${duration}[midi]`,
      )
    }
    audioLabels.push('[midi]')
    inputIndex += 1
  }

  if (options.soundtrackAudioPath != null) {
    args.push('-i', options.soundtrackAudioPath)
    appendOffsetAudioFilter(
      filters,
      inputIndex,
      'soundtrack',
      options.soundtrackSourceTimeAtExportStartSeconds,
      duration,
    )
    audioLabels.push('[soundtrack]')
  }

  args.push('-map', '0:v:0')
  if (audioLabels.length > 0) {
    if (audioLabels.length === 1) {
      filters.push(`${audioLabels[0]}anull[aout]`)
    } else {
      filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,`
        + `atrim=duration=${duration}[aout]`)
    }
    args.push('-filter_complex', filters.join(';'), '-map', '[aout]')
  } else {
    args.push('-an')
  }

  if (options.outputPath.toLowerCase().endsWith('.mp4')) {
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p')
    if (audioLabels.length > 0) args.push('-c:a', 'aac', '-b:a', '192k')
    args.push('-movflags', '+faststart')
  } else {
    args.push('-c:v', 'copy')
    if (audioLabels.length > 0) args.push('-c:a', 'libopus', '-b:a', '192k')
  }

  args.push('-t', duration, options.outputPath)
  return args
}

function appendOffsetAudioFilter(
  filters: string[],
  inputIndex: number,
  label: string,
  sourceTimeAtExportStartSeconds: number | undefined,
  duration: string,
) {
  const sourceTime = Number.isFinite(sourceTimeAtExportStartSeconds)
    ? sourceTimeAtExportStartSeconds ?? 0
    : 0
  if (sourceTime >= 0) {
    filters.push(
      `[${inputIndex}:a:0]atrim=start=${formatSeconds(sourceTime)}:duration=${duration},`
      + `asetpts=PTS-STARTPTS[${label}]`,
    )
    return
  }

  const delayMilliseconds = Math.max(0, Math.round(-sourceTime * 1000))
  filters.push(
    `[${inputIndex}:a:0]asetpts=PTS-STARTPTS,adelay=${delayMilliseconds}:all=1,`
    + `atrim=duration=${duration}[${label}]`,
  )
}

function audioFileExtension(mimeType: string): string {
  if (mimeType.includes('wav')) return '.wav'
  if (mimeType.includes('mpeg')) return '.mp3'
  if (mimeType.includes('mp4')) return '.m4a'
  if (mimeType.includes('ogg')) return '.ogg'
  if (mimeType.includes('flac')) return '.flac'
  return '.audio'
}

export function resolvePerformanceFrameCount(durationSeconds: number, frameRate: 30 | 60): number {
  return Math.max(1, Math.ceil(Math.max(0, durationSeconds) * frameRate))
}

export function resolvePerformanceFrameTimestampMicros(frameIndex: number, frameRate: 30 | 60): number {
  return Math.round((Math.max(0, Math.floor(frameIndex)) / frameRate) * 1_000_000)
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ExportError('Export cancelled.', 'CANCELLED')
  }
}

function throwIfEncoderErrored(error: unknown): void {
  if (error == null) return
  throw new ExportError(
    error instanceof Error ? error.message : String(error),
    'FRAME_RENDER_FAILED',
    error,
  )
}

function assertWebCodecsAvailable(): void {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new ExportError('WebCodecs is unavailable in this environment.', 'FRAME_RENDER_FAILED')
  }
}

async function waitForVideoMetadata(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return
  await waitForMediaEvent(video, 'loadedmetadata', signal)
}

async function waitForVideoData(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return
  await waitForMediaEvent(video, 'loadeddata', signal)
}

async function seekVideo(video: HTMLVideoElement, timeSeconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  if (Math.abs(video.currentTime - timeSeconds) < 0.000_001) return
  const seeked = waitForMediaEvent(video, 'seeked', signal)
  video.currentTime = timeSeconds
  await seeked
}

async function waitForMediaEvent(
  video: HTMLVideoElement,
  eventName: 'loadeddata' | 'loadedmetadata' | 'seeked',
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent)
      video.removeEventListener('error', handleError)
      signal?.removeEventListener('abort', handleAbort)
    }
    const handleEvent = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new ExportError('Unable to decode the recorded camera video.', 'FRAME_RENDER_FAILED'))
    }
    const handleAbort = () => {
      cleanup()
      reject(new ExportError('Export cancelled.', 'CANCELLED'))
    }
    video.addEventListener(eventName, handleEvent, { once: true })
    video.addEventListener('error', handleError, { once: true })
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function normalizeDuration(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

function formatSeconds(value: number): string {
  return Math.max(0, value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

async function getTempDir(): Promise<string> {
  const api = window.electronAPI
  if (api == null || typeof api.export.getTempDir !== 'function') {
    throw new ExportError('Export temp directory bridge is unavailable.', 'FRAME_RENDER_FAILED')
  }
  return api.export.getTempDir()
}

function joinPath(basePath: string, fileName: string): string {
  const separator = basePath.includes('\\') ? '\\' : '/'
  const normalized = basePath.endsWith('\\') || basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return `${normalized}${separator}${fileName}`
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}
