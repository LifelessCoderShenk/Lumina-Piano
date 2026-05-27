import { ArrayBufferTarget, Muxer } from 'webm-muxer'

import { mkdirExportDir, rmExportDir } from './exportFileSystem'

import * as Tone from 'tone'

import { cameraSystem } from '../camera/CameraSystem'
import { effectsLayer } from '../effects/EffectsLayer'
import { renderer } from '../renderer/Renderer'
import type { AppState } from '../store/store'
import { getAppState } from '../store/store'
import { secondsToTick, tickToSeconds } from '../tempo/tempoMap'
import { ExportError } from './errors'
import type { ExportProgress, ExportResolution, ExportSettings } from './types'
import { RESOLUTIONS } from './types'

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'
const EXPORT_AUDIO_CHANNELS = 2
const EXPORT_AUDIO_SAMPLE_RATE = 48_000
const EXPORT_AUDIO_BITRATE = 192_000
const OPUS_FRAME_DURATION_SECONDS = 0.02
const AUDIO_PROGRESS_START = 0.85
const COMBINING_PROGRESS = 0.95
const KEYFRAME_INTERVAL_SECONDS = 2
const STANDARD_VIDEO_BITRATE = 8_000_000
const UHD_VIDEO_BITRATE = 40_000_000

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
    const previousViewport = {
      height: store.viewportHeight,
      width: store.viewportWidth,
    }

    this.isRunning = true
    this.shouldCancel = false
    store.setIsExporting(true)
    this.tempDir = await getTempDir()

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
        (chunksEncoded, totalChunks, remaining) => {
          this.emitProgress({
            estimatedSecondsRemaining: remaining,
            framesRendered: totalFrames,
            phase: 'audio',
            progress: AUDIO_PROGRESS_START + ((chunksEncoded / totalChunks) * (COMBINING_PROGRESS - AUDIO_PROGRESS_START)),
            totalFrames,
          })
        },
      )

      this.emitProgress({
        estimatedSecondsRemaining: 0,
        framesRendered: totalFrames,
        phase: 'combining',
        progress: COMBINING_PROGRESS,
        totalFrames,
      })

      const tempWebmPath = joinExportPath(this.tempDir, 'export.webm')
      await saveEncodedVideoFile(webmBuffer, tempWebmPath)
      await this.combineWithFFmpeg(tempWebmPath, settings.outputPath)

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
    onAudioProgress: ProgressCallback,
  ): Promise<ArrayBuffer> {
    const state = getAppState()
    const projectData = state.projectData
    const tempoMap = state.precomputedTempoMap

    if (projectData == null || tempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const ticksPerFrame = Math.max(1, secondsToTick(1 / settings.fps, tempoMap))
    let audioBuffer: AudioBuffer | null = null
    if (settings.includeAudio) {
      console.log('[Export] Starting audio render...')
      audioBuffer = await this.renderAudioBuffer()
    }
    const target = new ArrayBufferTarget()
    const canvas = renderer.getCanvas()
    const muxer = new Muxer({
      audio: audioBuffer != null
        ? {
          codec: 'A_OPUS',
          numberOfChannels: EXPORT_AUDIO_CHANNELS,
          sampleRate: audioBuffer.sampleRate,
        }
        : undefined,
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

    if (audioBuffer != null) {
      console.log('[Export] Audio buffer duration:', audioBuffer.duration, 'seconds')
      console.log('[Export] Audio buffer length:', audioBuffer.length, 'samples')
      console.log('[Export] Audio channels:', audioBuffer.numberOfChannels)
      console.log('[Audio] Buffer sampleRate:', audioBuffer.sampleRate)
      console.log('[Audio] Buffer duration:', audioBuffer.duration)
      console.log('[Audio] Buffer length:', audioBuffer.length)
      const totalSamples = audioBuffer.length
      const sampleRate = audioBuffer.sampleRate
      console.log('[Audio] Encoder configured sampleRate:', sampleRate)
      const opusFrameSize = Math.max(1, Math.round(sampleRate * OPUS_FRAME_DURATION_SECONDS))
      const totalChunks = Math.max(1, Math.ceil(totalSamples / opusFrameSize))
      const leftChannel = audioBuffer.getChannelData(0)
      const rightChannel = audioBuffer.numberOfChannels > 1
        ? audioBuffer.getChannelData(1)
        : leftChannel
      const audioStartTime = performance.now()
      let audioEncoderError: unknown = null

      const audioEncoder = new AudioEncoder({
        error: (error) => {
          console.error('[Export] AudioEncoder error:', error)
          audioEncoderError = error
        },
        output: (chunk, meta) => {
          console.log('[Export] Audio chunk added, size:', chunk.byteLength)
          muxer.addAudioChunk(chunk, meta)
        },
      })

      audioEncoder.configure({
        bitrate: EXPORT_AUDIO_BITRATE,
        codec: 'opus',
        numberOfChannels: EXPORT_AUDIO_CHANNELS,
        sampleRate,
      })

      try {
        for (let offset = 0, chunkIndex = 0; offset < totalSamples; offset += opusFrameSize, chunkIndex += 1) {
          this.assertNotCancelled()
          throwIfEncoderErrored(audioEncoderError, 'AUDIO_RENDER_FAILED')

          const frameSize = Math.min(opusFrameSize, totalSamples - offset)
          const left = new Float32Array(opusFrameSize)
          const right = new Float32Array(opusFrameSize)

          left.set(leftChannel.slice(offset, offset + frameSize))
          if (audioBuffer.numberOfChannels > 1) {
            right.set(rightChannel.slice(offset, offset + frameSize))
          } else {
            right.set(left)
          }

          const interleaved = new Float32Array(opusFrameSize * EXPORT_AUDIO_CHANNELS)
          for (let index = 0; index < opusFrameSize; index += 1) {
            interleaved[index * 2] = left[index]
            interleaved[(index * 2) + 1] = right[index]
          }

          const audioData = new AudioData({
            data: interleaved,
            format: 'f32',
            numberOfChannels: EXPORT_AUDIO_CHANNELS,
            numberOfFrames: opusFrameSize,
            sampleRate,
            timestamp: Math.round(offset * (1_000_000 / sampleRate)),
          })

          audioEncoder.encode(audioData)
          audioData.close()

          if (audioEncoder.encodeQueueSize > 32) {
            await audioEncoder.flush()
          }

          const elapsed = (performance.now() - audioStartTime) / 1000
          const chunksPerSecond = elapsed > 0 ? (chunkIndex + 1) / elapsed : 0
          const remaining = chunksPerSecond > 0 ? (totalChunks - chunkIndex - 1) / chunksPerSecond : 0
          onAudioProgress(chunkIndex + 1, totalChunks, remaining)
        }

        console.log('[Export] Audio chunks encoded, flushing...')
        await audioEncoder.flush()
        console.log('[Export] Audio encoder flushed')
        throwIfEncoderErrored(audioEncoderError, 'AUDIO_RENDER_FAILED')
      } finally {
        audioEncoder.close()
      }
    }

    muxer.finalize()
    return target.buffer
  }

  private async renderAudioBuffer(): Promise<AudioBuffer> {
    const state = getAppState()
    const projectData = state.projectData
    const tempoMap = state.precomputedTempoMap

    if (projectData == null || tempoMap == null) {
      throw new ExportError('No project is loaded.', 'NO_PROJECT')
    }

    const durationSeconds = tickToSeconds(projectData.totalTicks, tempoMap) + 2

    try {
      const buffer = await Tone.Offline(async () => {
        const sampler = new Tone.Sampler({
          baseUrl: SALAMANDER_BASE_URL,
          urls: SALAMANDER_SAMPLE_URLS,
        }).toDestination()

        await Tone.loaded()

        for (const track of projectData.tracks) {
          if (!shouldPlayTrack(track.id, state)) {
            continue
          }

          for (const note of track.notes) {
            const startSec = tickToSeconds(note.startTick, tempoMap)
            const endSec = tickToSeconds(note.endTick, tempoMap)
            const duration = Math.max(0, endSec - startSec)

            sampler.triggerAttackRelease(
              Tone.Frequency(note.pitch, 'midi').toNote(),
              duration,
              startSec,
              note.velocity / 127,
            )
          }
        }
      }, durationSeconds, EXPORT_AUDIO_CHANNELS, EXPORT_AUDIO_SAMPLE_RATE)

      let maxSample = 0
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const channelData = buffer.getChannelData(channel)
        for (let index = 0; index < channelData.length; index += 1) {
          const magnitude = Math.abs(channelData[index] ?? 0)
          if (magnitude > maxSample) {
            maxSample = magnitude
          }
        }
      }

      console.log('[Audio] Max sample value:', maxSample)

      if (maxSample > 1) {
        const scale = 0.95 / maxSample
        console.log('[Audio] Normalizing clipped audio with scale:', scale)

        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const channelData = buffer.getChannelData(channel)
          for (let index = 0; index < channelData.length; index += 1) {
            channelData[index] *= scale
          }
        }
      }

      return buffer as unknown as AudioBuffer
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
    }
  }

  private async combineWithFFmpeg(inputWebmPath: string, outputPath: string): Promise<void> {
    await runFFmpeg([
      '-i',
      inputWebmPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ])
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
    typeof VideoFrame === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof AudioData === 'undefined'
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
