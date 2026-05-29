import { ArrayBufferTarget, Muxer } from 'webm-muxer'

import { mkdirExportDir, rmExportDir } from './exportFileSystem'
import { writeAudioBufferToWav } from './wavWriter'

import * as Tone from 'tone'

import { cameraSystem } from '../camera/CameraSystem'
import { effectsLayer } from '../effects/EffectsLayer'
import { playbackEngine } from '../playback/PlaybackEngine'
import { renderer } from '../renderer/Renderer'
import type { AppState } from '../store/store'
import { getAppState } from '../store/store'
import { secondsToTick, tickToSeconds } from '../tempo/tempoMap'
import { ExportError } from './errors'
import type { ExportProgress, ExportResolution, ExportSettings } from './types'
import { RESOLUTIONS } from './types'

const AUDIO_PROGRESS_START = 0.85
const COMBINING_PROGRESS = 0.95
const KEYFRAME_INTERVAL_SECONDS = 2
const STANDARD_VIDEO_BITRATE = 8_000_000
const UHD_VIDEO_BITRATE = 40_000_000
const AUDIO_PROGRESS_STEPS_PER_SECOND = 10
const OFFLINE_AUDIO_ATTACK_SECONDS = 0.01
const OFFLINE_AUDIO_RELEASE_SECONDS = 0.5
const OFFLINE_AUDIO_LEAD_IN_SECONDS = 0.1
const OFFLINE_AUDIO_TAIL_SECONDS = 0.1
const OFFLINE_AUDIO_MIN_SCHEDULE_OFFSET_SECONDS = 0.001
const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

const SALAMANDER_SAMPLE_URLS = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
} as const

export type ProgressCallback = (
  framesRendered: number,
  totalFrames: number,
  estimatedSecondsRemaining: number,
) => void

export type ExportProgressListener = (progress: ExportProgress) => void
export type ExportErrorListener = (message: string) => void

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
    console.log('[Export] Starting export with settings:', settings)
    console.log('[Export] Project loaded:', !!getAppState().projectData)
    console.log('[Export] TempoMap loaded:', !!getAppState().precomputedTempoMap)
    console.log('[Export] Total ticks:', getAppState().projectData?.totalTicks)
    console.log('[Export] Output path:', settings.outputPath)

    if (this.isRunning) {
      throw new ExportError('An export is already in progress.', 'ALREADY_RUNNING')
    }

    const state = getAppState()
    if (!state.isProjectLoaded || state.projectData == null || state.precomputedTempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    if (!renderer.isReady()) {
      throw new ExportError('Renderer has not been initialized.', 'NOT_INITIALIZED')
    }

    assertWebCodecsAvailable()

    const resolution = validateSettings(settings)
    const totalFrames = getTotalFrames(settings.fps, state.projectData.totalTicks, state.precomputedTempoMap)
    const store = getAppState()
    const previousPlayback = {
      currentTick: store.currentTick,
      isPlaying: store.isPlaying,
    }
    const previousViewport = {
      height: store.viewportHeight,
      width: store.viewportWidth,
    }

    this.isRunning = true
    this.shouldCancel = false
    store.setIsExporting(true)
    this.tempDir = await getTempDir()
    if (previousPlayback.isPlaying) {
      playbackEngine.pause()
    }

    try {
      await mkdirExportDir(this.tempDir)
      renderer.resize(resolution.width, resolution.height)
      cameraSystem.setViewportSize(resolution.width, resolution.height)
      effectsLayer.seek(0)
      await delay(50)

      const webmBuffer = await this.exportWithWebCodecs(
        settings,
        resolution,
        totalFrames,
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
      const audioPath = settings.includeAudio
        ? await this.renderOfflineAudio(
          joinExportPath(this.tempDir, 'export-audio.wav'),
          state,
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

      await this.combineWithFFmpeg(tempWebmPath, audioPath, settings.outputPath)

      this.emitProgress({
        estimatedSecondsRemaining: 0,
        framesRendered: totalFrames,
        phase: 'done',
        progress: 1,
        totalFrames,
      })

      this.completeListener?.(settings.outputPath)
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
      playbackEngine.seek(previousPlayback.currentTick)
      if (previousPlayback.isPlaying) {
        playbackEngine.play()
      }

      renderer.resize(previousViewport.width, previousViewport.height)
      cameraSystem.setViewportSize(previousViewport.width, previousViewport.height)
      effectsLayer.seek(getAppState().currentTick)

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
    settings: ExportSettings,
    resolution: ExportResolution,
    totalFrames: number,
    onVideoProgress: ProgressCallback,
  ): Promise<ArrayBuffer> {
    const state = getAppState()
    const projectData = state.projectData
    const tempoMap = state.precomputedTempoMap

    if (projectData == null || tempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const ticksPerFrame = Math.max(1, secondsToTick(1 / settings.fps, tempoMap))
    const target = new ArrayBufferTarget()
    const canvas = renderer.getCanvas()
    const muxer = new Muxer({
      firstTimestampBehavior: 'offset',
      target,
      video: {
        codec: 'V_VP9',
        frameRate: settings.fps,
        height: resolution.height,
        width: resolution.width,
      },
    })
    const frameDurationMicros = Math.round(1_000_000 / settings.fps)
    const keyframeInterval = Math.max(1, settings.fps * KEYFRAME_INTERVAL_SECONDS)
    const videoStartTime = performance.now()
    let videoEncoderError: unknown = null

    const videoEncoder = new VideoEncoder({
      error: (error) => {
        videoEncoderError = error
      },
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta)
      },
    })

    videoEncoder.configure({
      bitrate: resolution.width >= 3840 ? UHD_VIDEO_BITRATE : STANDARD_VIDEO_BITRATE,
      codec: 'vp09.00.10.08',
      framerate: settings.fps,
      height: resolution.height,
      latencyMode: 'quality',
      width: resolution.width,
    })

    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        this.assertNotCancelled()
        throwIfEncoderErrored(videoEncoderError, 'FRAME_RENDER_FAILED')

        const tick = Math.min(frame * ticksPerFrame, projectData.totalTicks)
        const timestampMicros = Math.round((frame / settings.fps) * 1_000_000)

        renderer.renderFrame(tick)
        const videoFrame = new VideoFrame(canvas, {
          duration: frameDurationMicros,
          timestamp: timestampMicros,
        })

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
    } finally {
      videoEncoder.close()
    }

    muxer.finalize()
    return target.buffer
  }

  private async renderOfflineAudio(
    outputPath: string,
    state: AppState,
    onAudioProgress: ProgressCallback,
  ): Promise<string> {
    const projectData = state.projectData
    const tempoMap = state.precomputedTempoMap
    if (projectData == null || tempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const songDurationSeconds = tickToSeconds(projectData.totalTicks, tempoMap)
    const totalDurationSeconds = songDurationSeconds + OFFLINE_AUDIO_LEAD_IN_SECONDS + OFFLINE_AUDIO_TAIL_SECONDS
    const totalSteps = Math.max(1, Math.ceil(totalDurationSeconds * AUDIO_PROGRESS_STEPS_PER_SECOND))
    const scheduledNotes = countScheduledNotes(projectData, state)
    console.log('[Export] Total scheduled notes:', scheduledNotes)
    Tone.Transport.cancel()
    Tone.Transport.swing = 0
    Tone.Transport.loop = false
    Tone.Transport.loopStart = 0
    Tone.Transport.loopEnd = 0
    Tone.Transport.position = 0

    const renderStartedAt = performance.now()
    const progressTimer = setInterval(() => {
      const elapsedSeconds = (performance.now() - renderStartedAt) / 1000
      const completedSteps = Math.min(totalSteps - 1, Math.floor(elapsedSeconds * AUDIO_PROGRESS_STEPS_PER_SECOND))
      const remaining = Math.max(0, totalDurationSeconds - elapsedSeconds)
      onAudioProgress(completedSteps, totalSteps, remaining)
    }, 100)

    try {
      const audioBuffer = await Tone.Offline(async () => {
        const sampler = new Tone.Sampler({
          attack: OFFLINE_AUDIO_ATTACK_SECONDS,
          baseUrl: SALAMANDER_BASE_URL,
          release: OFFLINE_AUDIO_RELEASE_SECONDS,
          urls: SALAMANDER_SAMPLE_URLS,
        }).toDestination()

        await Tone.loaded()

        for (const track of projectData.tracks) {
          if (!shouldPlayTrack(track.id, state)) {
            continue
          }

          for (const note of track.notes) {
            const noteStartSeconds = OFFLINE_AUDIO_LEAD_IN_SECONDS + tickToSeconds(note.startTick, tempoMap)
            const noteEndSeconds = OFFLINE_AUDIO_LEAD_IN_SECONDS + tickToSeconds(note.endTick, tempoMap)
            const durationSeconds = Math.max(0, noteEndSeconds - noteStartSeconds)
            const scheduleTime = Math.max(noteStartSeconds, OFFLINE_AUDIO_MIN_SCHEDULE_OFFSET_SECONDS)
            const pitch = Tone.Frequency(note.pitch, 'midi').toNote()

            sampler.triggerAttackRelease(
              pitch,
              durationSeconds,
              scheduleTime,
              note.velocity / 127,
            )
          }
        }
      }, totalDurationSeconds)

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

export function validateSettings(settings: ExportSettings): ExportResolution {
  const resolution = RESOLUTIONS[settings.resolution]
  if (resolution == null) {
    throw new ExportError('Export resolution is invalid.', 'INVALID_SETTINGS', settings)
  }

  if (settings.fps !== 30 && settings.fps !== 60) {
    throw new ExportError('Export fps is invalid.', 'INVALID_SETTINGS', settings)
  }

  if (!settings.outputPath.toLowerCase().endsWith('.mp4')) {
    throw new ExportError('Export output path must end with .mp4.', 'INVALID_SETTINGS', settings)
  }

  return resolution
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
  fps: ExportSettings['fps'],
  totalTicks: number,
  tempoMap: NonNullable<AppState['precomputedTempoMap']>,
): number {
  const ticksPerFrame = Math.max(1, secondsToTick(1 / fps, tempoMap))
  return Math.max(1, Math.ceil(totalTicks / ticksPerFrame))
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
