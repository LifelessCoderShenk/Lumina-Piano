import { ArrayBufferTarget, Muxer } from 'webm-muxer'

import { mkdirExportDir, rmExportDir } from './exportFileSystem'
import { writeAudioBufferToWav } from './wavWriter'
import { ExportQualityProbe } from './exportQuality'
import { renderOfflineMidiAudioBuffer } from '../audio/renderOfflineMidiAudio'

import { cameraSystem } from '../camera/CameraSystem'
import { getActiveVisualizerRenderer } from '../renderer/activeVisualizerRenderer'
import { playbackEngine } from '../playback/PlaybackEngine'
import type { VisualizerRenderer } from '../renderer/VisualizerRenderer'
import type { AppState } from '../store/store'
import { getAppState } from '../store/store'
import type { VisualizerSettings } from '../store/types'
import { secondsToTick, tickToSeconds } from '../tempo/tempoMap'
import { resolveExportDimensions } from './exportDimensions'
import { ExportError } from './errors'
import type { ExportProgress, ExportResolution, ExportSettings } from './types'

const AUDIO_PROGRESS_START = 0.85
const COMBINING_PROGRESS = 0.95
const KEYFRAME_INTERVAL_SECONDS = 2
const MIN_VP9_VIDEO_BITRATE = 8_000_000
const MAX_VP9_VIDEO_BITRATE = 80_000_000
const VP9_BITS_PER_PIXEL_PER_FRAME = 0.16
const AUDIO_PROGRESS_STEPS_PER_SECOND = 10
const EXPORT_LEAD_IN_SECONDS = 0
const EXPORT_TAIL_SECONDS = 0
const EXPORT_POSTPROCESS_SCALE = 2
const EXPORT_POSTPROCESS_MAX_WIDTH = 3840
const EXPORT_POSTPROCESS_MAX_HEIGHT = 2160
const OFFLINE_AUDIO_MIN_SCHEDULE_OFFSET_SECONDS = 0.001

export type ProgressCallback = (
  framesRendered: number,
  totalFrames: number,
  estimatedSecondsRemaining: number,
) => void

export type ExportProgressListener = (progress: ExportProgress) => void
export type ExportErrorListener = (message: string) => void

interface ExportTimeline {
  leadInSeconds: number
  songDurationSeconds: number
  tailSeconds: number
  totalDurationSeconds: number
}

export interface ExportJobSettings extends ExportSettings {
  fps: VisualizerSettings['framerate']
  resolution: ExportResolution
  aspectRatio: VisualizerSettings['aspectRatio']
  resolutionTier: VisualizerSettings['resolution']
}

export class ExportEngine {
  private isRunning = false
  private shouldCancel = false
  private tempDir: string | null = null
  private progressListener: ExportProgressListener | null = null
  private completeListener: ((outputPath: string) => void) | null = null
  private errorListener: ExportErrorListener | null = null

  onProgress(listener: ExportProgressListener | null): void {
    this.progressListener = listener
  }

  onComplete(listener: ((outputPath: string) => void) | null): void {
    this.completeListener = listener
  }

  onError(listener: ExportErrorListener | null): void {
    this.errorListener = listener
  }

  async export(settings: ExportSettings): Promise<void> {
    if (this.isRunning) {
      throw new ExportError('An export is already in progress.', 'ALREADY_RUNNING')
    }

    const state = getAppState()
    if (!state.isProjectLoaded || state.projectData == null || state.precomputedTempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const activeRenderer = getActiveVisualizerRenderer()
    if (activeRenderer == null || !activeRenderer.isReady()) {
      throw new ExportError('Renderer has not been initialized.', 'NOT_INITIALIZED')
    }

    assertWebCodecsAvailable()

    const jobSettings = validateSettings(settings, state.visualizerSettings)
    const exportTimeline = createExportTimeline(state.projectData.totalTicks, state.precomputedTempoMap)
    const totalFrames = getTotalFrames(jobSettings.fps, exportTimeline.totalDurationSeconds)
    const store = getAppState()
    const previousPlayback = {
      currentTick: store.currentTick,
      isPlaying: store.isPlaying,
    }
    const previousViewport = {
      height: store.viewportHeight,
      width: store.viewportWidth,
    }
    const liveLayoutContext = activeRenderer.getRenderLayoutContext?.()

    this.isRunning = true
    this.shouldCancel = false
    store.setIsExporting(true)
    this.tempDir = await getTempDir()
    if (previousPlayback.isPlaying) {
      playbackEngine.pause()
    }

    let beganOfflineRender = false
    try {
      activeRenderer.beginOfflineRender()
      beganOfflineRender = true
      await mkdirExportDir(this.tempDir)
      const exportResizeOptions = {
        pixelRatio: 1,
        postprocessScale: getExportPostprocessScale(jobSettings.resolution),
        ...(liveLayoutContext == null ? {} : { layoutContext: liveLayoutContext }),
      }
      activeRenderer.resize(jobSettings.resolution.width, jobSettings.resolution.height, exportResizeOptions)
      cameraSystem.setViewportSize(jobSettings.resolution.width, jobSettings.resolution.height)
      await delay(50)

      const webmBuffer = await this.exportWithWebCodecs(
        jobSettings,
        totalFrames,
        exportTimeline,
        activeRenderer,
        (framesRendered, total, remaining) => {
          this.emitProgress({
            estimatedSecondsRemaining: remaining,
            framesRendered,
            phase: 'frames',
            progress: framesRendered / total,
            totalFrames: total,
          })
        },
      )

      const tempWebmPath = joinExportPath(this.tempDir, 'export.webm')
      await saveEncodedVideoFile(webmBuffer, tempWebmPath)
      const audioPath = jobSettings.includeAudio
        ? await this.renderOfflineAudio(
          joinExportPath(this.tempDir, 'export-audio.wav'),
          state,
          exportTimeline,
          (stepsCompleted, totalSteps, remaining) => {
            this.emitProgress({
              estimatedSecondsRemaining: remaining,
              framesRendered: totalFrames,
              phase: 'audio',
              progress: AUDIO_PROGRESS_START + ((stepsCompleted / totalSteps) * (COMBINING_PROGRESS - AUDIO_PROGRESS_START)),
              totalFrames,
            })
          },
        )
        : null

      this.emitProgress({
        estimatedSecondsRemaining: 0,
        framesRendered: totalFrames,
        phase: 'combining',
        progress: COMBINING_PROGRESS,
        totalFrames,
      })

      await this.combineWithFFmpeg(tempWebmPath, audioPath, jobSettings.outputPath)

      this.emitProgress({
        estimatedSecondsRemaining: 0,
        framesRendered: totalFrames,
        phase: 'done',
        progress: 1,
        totalFrames,
      })

      this.completeListener?.(jobSettings.outputPath)
    } catch (error: unknown) {
      console.error('[Export] Inner error caught:', error)

      const exportError = error instanceof ExportError
        ? error
        : new ExportError(
          error instanceof Error ? error.message : String(error),
          'FRAME_RENDER_FAILED',
          error,
        )

      this.errorListener?.(exportError.message)
      throw exportError
    } finally {
      playbackEngine.pause()
      if (liveLayoutContext == null) {
        activeRenderer.resize(previousViewport.width, previousViewport.height)
      } else {
        activeRenderer.resize(previousViewport.width, previousViewport.height, { layoutContext: liveLayoutContext })
      }
      cameraSystem.setViewportSize(previousViewport.width, previousViewport.height)
      playbackEngine.seek(previousPlayback.currentTick)

      if (beganOfflineRender) {
        activeRenderer.endOfflineRender()
      }

      if (previousPlayback.isPlaying) {
        playbackEngine.play()
      }

      if (this.tempDir != null) {
        await this.cleanup(this.tempDir)
        this.tempDir = null
      }

      getAppState().setIsExporting(false)
      this.isRunning = false
      this.shouldCancel = false
    }
  }

  cancel(): void {
    this.shouldCancel = true
  }

  private async exportWithWebCodecs(
    settings: ExportJobSettings,
    totalFrames: number,
    exportTimeline: ExportTimeline,
    activeRenderer: VisualizerRenderer,
    onVideoProgress: ProgressCallback,
  ): Promise<ArrayBuffer> {
    const state = getAppState()
    const projectData = state.projectData
    const tempoMap = state.precomputedTempoMap

    if (projectData == null || tempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const target = new ArrayBufferTarget()
    const canvas = activeRenderer.getCanvas()
    const muxer = new Muxer({
      firstTimestampBehavior: 'offset',
      target,
      video: {
        codec: 'V_VP9',
        frameRate: settings.fps,
        height: settings.resolution.height,
        width: settings.resolution.width,
      },
    })
    const frameDurationMicros = Math.round(1_000_000 / settings.fps)
    const keyframeInterval = Math.max(1, settings.fps * KEYFRAME_INTERVAL_SECONDS)
    const videoStartTime = performance.now()
    let videoEncoderError: unknown = null
    const qualityProbe = new ExportQualityProbe(totalFrames, settings.resolution.width, settings.resolution.height)
    let qualityProbeFinished = false

    const videoEncoder = new VideoEncoder({
      error: (error) => {
        videoEncoderError = error
      },
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta)
        qualityProbe.decode(chunk)
      },
    })

    videoEncoder.configure({
      bitrate: getVp9VideoBitrate(settings.resolution.width, settings.resolution.height, settings.fps),
      codec: 'vp09.00.10.08',
      framerate: settings.fps,
      height: settings.resolution.height,
      latencyMode: 'quality',
      width: settings.resolution.width,
    })

    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        this.assertNotCancelled()
        throwIfEncoderErrored(videoEncoderError, 'FRAME_RENDER_FAILED')

        const frameTimeSeconds = frame / settings.fps
        const songTimeSeconds = clamp(
          frameTimeSeconds - exportTimeline.leadInSeconds,
          0,
          exportTimeline.songDurationSeconds,
        )
        const tick = Math.min(projectData.totalTicks, secondsToTick(songTimeSeconds, tempoMap))
        const timestampMicros = Math.round(frameTimeSeconds * 1_000_000)

        activeRenderer.renderFrame(tick, {
          animationTimeSeconds: frameTimeSeconds,
        })
        const videoFrame = new VideoFrame(canvas, {
          duration: frameDurationMicros,
          timestamp: timestampMicros,
        })

        if (qualityProbe.shouldCapture(frame)) {
          await qualityProbe.captureRawFrame(frame, videoFrame)
        }

        videoEncoder.encode(videoFrame, {
          keyFrame: frame % keyframeInterval === 0,
        })
        videoFrame.close()

        if (videoEncoder.encodeQueueSize > settings.fps * 2) {
          await videoEncoder.flush()
        }

        const elapsed = (performance.now() - videoStartTime) / 1000
        const framesPerSecond = elapsed > 0 ? (frame + 1) / elapsed : 0
        const remaining = framesPerSecond > 0 ? (totalFrames - frame - 1) / framesPerSecond : 0
        onVideoProgress(frame + 1, totalFrames, remaining)

        if (frame % 10 === 0) {
          await delay(0)
        }
      }

      await videoEncoder.flush()
      throwIfEncoderErrored(videoEncoderError, 'FRAME_RENDER_FAILED')
      const qualityResults = await qualityProbe.finish()
      qualityProbeFinished = true
      if (qualityResults.length > 0) {
        const averagePsnr = qualityResults.reduce((total, result) => total + result.psnrDb, 0) / qualityResults.length
        console.info(
          `[Export quality] ${settings.resolution.width}x${settings.resolution.height} @ ${settings.fps} FPS: `
          + `${qualityResults.length} raw-vs-VP9 samples, ${formatPsnr(averagePsnr)} average PSNR.`,
        )
      }
    } finally {
      if (!qualityProbeFinished) {
        await qualityProbe.finish()
      }
      videoEncoder.close()
    }

    muxer.finalize()
    return target.buffer
  }

  private async renderOfflineAudio(
    outputPath: string,
    state: AppState,
    exportTimeline: ExportTimeline,
    onAudioProgress: ProgressCallback,
  ): Promise<string> {
    const projectData = state.projectData
    const tempoMap = state.precomputedTempoMap
    if (projectData == null || tempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const totalDurationSeconds = Math.max(
      exportTimeline.totalDurationSeconds,
      OFFLINE_AUDIO_MIN_SCHEDULE_OFFSET_SECONDS,
    )
    const totalSteps = Math.max(1, Math.ceil(totalDurationSeconds * AUDIO_PROGRESS_STEPS_PER_SECOND))
    const renderStartedAt = performance.now()
    const progressTimer = setInterval(() => {
      const elapsedSeconds = (performance.now() - renderStartedAt) / 1000
      const completedSteps = Math.min(totalSteps - 1, Math.floor(elapsedSeconds * AUDIO_PROGRESS_STEPS_PER_SECOND))
      const remaining = Math.max(0, totalDurationSeconds - elapsedSeconds)
      onAudioProgress(completedSteps, totalSteps, remaining)
    }, 100)

    try {
      const audioBuffer = await renderOfflineMidiAudioBuffer(
        state,
        totalDurationSeconds,
        exportTimeline.leadInSeconds,
        true,
      )
      if (audioBuffer == null) {
        throw new ExportError('Unable to render MIDI audio.', 'AUDIO_RENDER_FAILED')
      }

      this.assertNotCancelled()
      await writeAudioBufferToWav(audioBuffer, outputPath)
      onAudioProgress(totalSteps, totalSteps, 0)
      return outputPath
    } catch (error: unknown) {
      console.error('[Export] Inner error caught:', error)

      if (error instanceof ExportError) {
        throw error
      }

      throw new ExportError(
        error instanceof Error ? error.message : String(error),
        'AUDIO_RENDER_FAILED',
        error,
      )
    } finally {
      clearInterval(progressTimer)
    }
  }

  private async combineWithFFmpeg(inputWebmPath: string, audioPath: string | null, outputPath: string): Promise<void> {
    const args = audioPath == null
      ? [
        '-i',
        inputWebmPath,
        '-c:v',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ]
      : [
        '-i',
        inputWebmPath,
        '-i',
        audioPath,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        '-y',
        outputPath,
      ]

    await runFFmpeg(args)
  }

  private async cleanup(tempDir: string): Promise<void> {
    try {
      await rmExportDir(tempDir)
    } catch (error: unknown) {
      if (isEnospcError(error)) {
        throw new ExportError('Disk is full while cleaning up export files.', 'DISK_FULL', error)
      }
    }
  }

  private emitProgress(progress: ExportProgress): void {
    getAppState().setExportProgress(
      progress.progress,
      progress.framesRendered,
      progress.totalFrames,
      progress.estimatedSecondsRemaining,
    )
    this.progressListener?.(progress)
  }

  private assertNotCancelled(): void {
    if (this.shouldCancel) {
      throw new ExportError('Export cancelled.', 'CANCELLED')
    }
  }
}

export async function runFFmpeg(args: string[]): Promise<void> {
  const electronApi = getElectronApi()
  if (electronApi == null || typeof electronApi.ffmpeg.run !== 'function') {
    throw new ExportError('FFmpeg bridge is unavailable.', 'FFMPEG_FAILED')
  }

  try {
    await electronApi.ffmpeg.run(args)
  } catch (error: unknown) {
    console.error('[Export] Inner error caught:', error)
    throw new ExportError(
      error instanceof Error ? error.message : String(error),
      'FFMPEG_FAILED',
      error,
    )
  }
}

export function validateSettings(
  settings: ExportSettings,
  visualizerSettings: VisualizerSettings,
): ExportJobSettings {
  if (visualizerSettings.framerate !== 30 && visualizerSettings.framerate !== 60) {
    throw new ExportError('Export fps is invalid.', 'INVALID_SETTINGS', settings)
  }

  if (!['720p', '1080p', '4K'].includes(visualizerSettings.resolution)) {
    throw new ExportError('Export resolution is invalid.', 'INVALID_SETTINGS', settings)
  }

  if (!['fit', '16:9', '9:16', '1:1', '4:3'].includes(visualizerSettings.aspectRatio)) {
    throw new ExportError('Export aspect ratio is invalid.', 'INVALID_SETTINGS', settings)
  }

  if (!settings.outputPath.toLowerCase().endsWith('.mp4')) {
    throw new ExportError('Export output path must end with .mp4.', 'INVALID_SETTINGS', settings)
  }

  return {
    ...settings,
    aspectRatio: visualizerSettings.aspectRatio,
    fps: visualizerSettings.framerate,
    resolution: resolveExportDimensions(visualizerSettings.resolution, visualizerSettings.aspectRatio),
    resolutionTier: visualizerSettings.resolution,
  }
}

export function getVp9VideoBitrate(width: number, height: number, fps: number): number {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps)
  return Math.round(clamp(
    pixelsPerSecond * VP9_BITS_PER_PIXEL_PER_FRAME,
    MIN_VP9_VIDEO_BITRATE,
    MAX_VP9_VIDEO_BITRATE,
  ))
}

function formatPsnr(psnrDb: number): string {
  return Number.isFinite(psnrDb) ? `${psnrDb.toFixed(1)} dB` : 'lossless'
}

function shouldPlayTrack(trackId: string, state: AppState): boolean {
  const anySoloed = Object.values(state.trackSoloed).some(Boolean)
  if (anySoloed) {
    return state.trackSoloed[trackId] === true
  }

  return state.trackMuted[trackId] !== true
}

function countScheduledNotes(
  projectData: NonNullable<AppState['projectData']>,
  state: AppState,
): number {
  let count = 0

  for (const track of projectData.tracks) {
    if (!shouldPlayTrack(track.id, state)) {
      continue
    }

    count += track.notes.length
  }

  return count
}

function getTotalFrames(
  fps: VisualizerSettings['framerate'],
  totalDurationSeconds: number,
): number {
  return Math.max(1, Math.ceil(totalDurationSeconds * fps))
}

function getExportPostprocessScale(resolution: ExportResolution): number {
  return clamp(
    Math.min(
      EXPORT_POSTPROCESS_SCALE,
      EXPORT_POSTPROCESS_MAX_WIDTH / resolution.width,
      EXPORT_POSTPROCESS_MAX_HEIGHT / resolution.height,
    ),
    1,
    EXPORT_POSTPROCESS_SCALE,
  )
}

function isEnospcError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOSPC'
  )
}

function throwIfEncoderErrored(error: unknown, code: 'FRAME_RENDER_FAILED' | 'AUDIO_RENDER_FAILED'): void {
  if (error == null) {
    return
  }

  throw new ExportError(
    error instanceof Error ? error.message : String(error),
    code,
    error,
  )
}

function assertWebCodecsAvailable(): void {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined'
  ) {
    throw new ExportError('WebCodecs is unavailable in this environment.', 'FRAME_RENDER_FAILED')
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function createExportTimeline(
  totalTicks: number,
  tempoMap: NonNullable<AppState['precomputedTempoMap']>,
): ExportTimeline {
  const songDurationSeconds = tickToSeconds(totalTicks, tempoMap)

  return {
    leadInSeconds: EXPORT_LEAD_IN_SECONDS,
    songDurationSeconds,
    tailSeconds: EXPORT_TAIL_SECONDS,
    totalDurationSeconds: EXPORT_LEAD_IN_SECONDS + songDurationSeconds + EXPORT_TAIL_SECONDS,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const exportEngine = new ExportEngine()

export { ExportError }
export type { ExportProgress, ExportResolution, ExportSettings } from './types'

function getElectronApi() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

async function getTempDir(): Promise<string> {
  const electronApi = getElectronApi()

  if (electronApi == null || typeof electronApi.export.getTempDir !== 'function') {
    throw new ExportError('Export temp directory bridge is unavailable.', 'FRAME_RENDER_FAILED')
  }

  try {
    return await electronApi.export.getTempDir()
  } catch (error: unknown) {
    console.error('[Export] Inner error caught:', error)
    throw new ExportError(
      error instanceof Error ? error.message : String(error),
      'FRAME_RENDER_FAILED',
      error,
    )
  }
}

function joinExportPath(basePath: string, fileName: string): string {
  const separator = basePath.includes('\\') ? '\\' : '/'
  const normalizedBasePath =
    basePath.endsWith('\\') || basePath.endsWith('/')
      ? basePath.slice(0, -1)
      : basePath

  return `${normalizedBasePath}${separator}${fileName}`
}

async function saveEncodedVideoFile(buffer: ArrayBuffer, outputPath: string): Promise<void> {
  const electronApi = getElectronApi()

  if (electronApi == null || typeof electronApi.export.saveFile !== 'function') {
    throw new ExportError('Export save bridge is unavailable.', 'FRAME_RENDER_FAILED')
  }

  try {
    const bytes = new Uint8Array(buffer)
    await electronApi.export.saveFile({
      buffer: Array.from(bytes),
      outputPath,
    })
  } catch (error: unknown) {
    if (isEnospcError(error)) {
      throw new ExportError('Disk is full while writing video.', 'DISK_FULL', error)
    }

    console.error('[Export] Inner error caught:', error)
    throw new ExportError(
      error instanceof Error ? error.message : String(error),
      'FRAME_RENDER_FAILED',
      error,
    )
  }
}
