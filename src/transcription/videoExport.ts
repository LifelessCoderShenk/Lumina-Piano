import { ArrayBufferTarget, Muxer } from 'webm-muxer'
import { renderScore } from '../components/TranscriptorMode/ScoreSheet'
import { getBlackKeyWidth, getWhiteKeyBounds, isBlackKey, pitchToKeyX } from '../renderer/pianoMath'
import { writeAudioBufferToWav } from '../export/wavWriter'
import { buildScoreDocument } from './scoreModel'
import { scoreFontData } from './scoreFontData'
import { TRANSCRIPTION_SETTINGS } from './settings'
import type { RecordedCameraTake, ResolvedMediaSegment } from './mediaStorage'
import type { CapturedNote, TranscriptionSettings, WebcamOverlay } from './types'
import { VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS as FPS } from './videoExportSettings'
export { VIDEO_WIDTH, VIDEO_HEIGHT } from './videoExportSettings'

export interface VideoExportOptions {
  camera?: RecordedCameraTake | null
  cameraTimeline?: readonly ResolvedMediaSegment[]
  durationMs: number
  audio: AudioBuffer
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}
const PAPER = { x: 24, y: 70, width: 1232, height: 462 }
export function webcamVideoBounds(settings: TranscriptionSettings, overlayOverride?: WebcamOverlay) {
  const overlay = overlayOverride ?? settings.webcamOverlay ?? TRANSCRIPTION_SETTINGS.webcamOverlay!
  const width = Math.min(PAPER.width, Math.max(2, Math.round(PAPER.width * overlay.width / 2) * 2))
  const height = Math.min(PAPER.height, Math.max(2, Math.round((overlay.height == null ? width * 9 / 16 : PAPER.height * overlay.height) / 2) * 2))
  return { width, height, x: PAPER.x + Math.max(0, Math.min(PAPER.width - width, Math.round(PAPER.width * overlay.x))), y: PAPER.y + Math.max(0, Math.min(PAPER.height - height, Math.round(PAPER.height * overlay.y))) }
}

function cameraCropFilter(overlay: WebcamOverlay, box: ReturnType<typeof webcamVideoBounds>): string {
  const crop = 1 - 2 * overlay.crop
  const cropX = Math.max(0, Math.min(1, overlay.cropX ?? .5))
  const cropY = Math.max(0, Math.min(1, overlay.cropY ?? .5))
  return `crop=iw*${crop}:ih*${crop}:(iw-iw*${crop})*${cropX}:(ih-ih*${crop})*${cropY},scale=${box.width}:${box.height}:force_original_aspect_ratio=increase,crop=${box.width}:${box.height}:(iw-${box.width})*${cropX}:(ih-${box.height})*${cropY}`
}
export function videoFfmpegArgs(base: string, wav: string, cameraPath: string | null, cameraHasMic: boolean, output: string, format: 'mp4' | 'webm', duration: number, settings: TranscriptionSettings): string[] {
  const args = ['-y', '-i', base]
  if (cameraPath) args.push('-i', cameraPath)
  args.push('-i', wav)
  const audioIndex = cameraPath ? 2 : 1
  const filters: string[] = []
  if (cameraPath) {
    const overlay = settings.webcamOverlay ?? TRANSCRIPTION_SETTINGS.webcamOverlay!
    const box = webcamVideoBounds(settings)
    filters.push(`[1:v]setpts=PTS-STARTPTS,${cameraCropFilter(overlay, box)}${overlay.mirror ? ',hflip' : ''},drawbox=x=0:y=0:w=iw:h=ih:color=0x263447:t=3[face]`)
    filters.push(`[0:v][face]overlay=${box.x}:${box.y}:eof_action=pass:repeatlast=0[video]`)
  }
  filters.push(`[${audioIndex}:a]volume=${settings.exportAudioMix === 'recorded' ? 0 : settings.pianoVolume ?? 1},apad[piano]`)
  if (cameraPath && cameraHasMic && (settings.microphoneVolume ?? 1) > 0 && settings.exportAudioMix !== 'synth') {
    filters.push(`[1:a]asetpts=PTS-STARTPTS,volume=${settings.microphoneVolume ?? 1},apad[mic]`)
    filters.push('[piano][mic]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false[audio]')
  } else filters.push('[piano]alimiter=limit=0.95:level=false[audio]')
  args.push('-filter_complex', filters.join(';'), '-map', cameraPath ? '[video]' : '0:v', '-map', '[audio]', '-t', duration.toFixed(6), '-r', String(FPS))
  if (format === 'mp4') args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart')
  else args.push('-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-c:a', 'libopus', '-b:a', '160k')
  return [...args, output]
}

export interface CameraInput { path: string; source: RecordedCameraTake }

/** Compose reusable webcam/microphone clips on the same timeline used by take preview. */
export function videoTimelineFfmpegArgs(base: string, wav: string, cameraInputs: readonly CameraInput[], segments: readonly ResolvedMediaSegment[], output: string, format: 'mp4' | 'webm', duration: number, settings: TranscriptionSettings): string[] {
  const args = ['-y', '-i', base]
  cameraInputs.forEach((input) => args.push('-i', input.path))
  args.push('-i', wav)
  const audioIndex = cameraInputs.length + 1
  const inputIndex = new Map(cameraInputs.map((input, index) => [input.source.id, index + 1]))
  const filters: string[] = []
  const videoPads = new Map<number, string>()
  const audioPads = new Map<number, string>()
  cameraInputs.forEach((input, inputOffset) => {
    const sourceIndex = inputOffset + 1
    const sourceSegments = segments.map((segment, index) => ({ segment, index })).filter(({ segment }) => segment.sourceId === input.source.id && segment.durationMs > 0)
    const videoSegments = sourceSegments.filter(({ segment }) => mediaKind(segment) === 'video')
    if (videoSegments.length === 1) videoPads.set(videoSegments[0].index, `${sourceIndex}:v`)
    else if (videoSegments.length > 1) {
      const labels = videoSegments.map(({ index }) => `sourceVideo${index}`)
      filters.push(`[${sourceIndex}:v]split=${labels.length}${labels.map((label) => `[${label}]`).join('')}`)
      videoSegments.forEach(({ index }, labelIndex) => videoPads.set(index, labels[labelIndex]))
    }
    const recordedAudioSegments = sourceSegments.filter(({ segment }) => mediaKind(segment) === 'audio' || (input.source.hasMicrophone && segment.kind == null && input.source.kind == null))
    if (recordedAudioSegments.length === 1) audioPads.set(recordedAudioSegments[0].index, `${sourceIndex}:a`)
    else if (recordedAudioSegments.length > 1) {
      const labels = recordedAudioSegments.map(({ index }) => `sourceAudio${index}`)
      filters.push(`[${sourceIndex}:a]asplit=${labels.length}${labels.map((label) => `[${label}]`).join('')}`)
      recordedAudioSegments.forEach(({ index }, labelIndex) => audioPads.set(index, labels[labelIndex]))
    }
  })
  let video = '0:v'
  const micLabels: string[] = []
  segments.forEach((segment, index) => {
    const sourceIndex = inputIndex.get(segment.sourceId)
    if (sourceIndex == null || segment.durationMs <= 0) return
    const config = settings.mediaSources?.find((source) => source.id === (segment.inputId ?? segment.source.inputId))
    const kind = mediaKind(segment)
    const rawTimelineStart = (segment.startMs + (kind === 'audio' ? config?.latencyMs ?? 0 : 0)) / 1000
    const sourceStart = Math.max(0, segment.sourceOffsetMs / 1000 - Math.min(0, rawTimelineStart))
    const timelineStart = Math.max(0, rawTimelineStart)
    const clipDuration = Math.max(0.001, segment.durationMs / 1000)
    if (kind === 'video') {
      const overlay = config?.overlay ?? settings.webcamOverlay ?? TRANSCRIPTION_SETTINGS.webcamOverlay!
      const box = webcamVideoBounds(settings, overlay)
      const face = `face${index}`
      const nextVideo = `video${index}`
      filters.push(`[${videoPads.get(index) ?? `${sourceIndex}:v`}]trim=start=${sourceStart.toFixed(6)}:duration=${clipDuration.toFixed(6)},setpts=PTS-STARTPTS+${timelineStart.toFixed(6)}/TB,${cameraCropFilter(overlay, box)}${overlay.mirror ? ',hflip' : ''},drawbox=x=0:y=0:w=iw:h=ih:color=0x263447:t=3[${face}]`)
      filters.push(`[${video}][${face}]overlay=${box.x}:${box.y}:enable='between(t,${timelineStart.toFixed(6)},${(timelineStart + clipDuration).toFixed(6)})':eof_action=pass:repeatlast=0[${nextVideo}]`)
      video = nextVideo
    }
    const includeLegacyMic = segment.source.hasMicrophone && segment.kind == null && segment.source.kind == null
    const sourceVolume = config?.volume ?? settings.microphoneVolume ?? 1
    if ((kind === 'audio' || includeLegacyMic) && sourceVolume > 0 && settings.exportAudioMix !== 'synth') {
      const mic = `mic${index}`
      filters.push(`[${audioPads.get(index) ?? `${sourceIndex}:a`}]atrim=start=${sourceStart.toFixed(6)}:duration=${clipDuration.toFixed(6)},asetpts=PTS-STARTPTS+${timelineStart.toFixed(6)}/TB,volume=${sourceVolume}[${mic}]`)
      micLabels.push(`[${mic}]`)
    }
  })
  filters.push(`[${audioIndex}:a]volume=${settings.exportAudioMix === 'recorded' ? 0 : settings.pianoVolume ?? 1},apad[piano]`)
  if (micLabels.length > 0) filters.push(`[piano]${micLabels.join('')}amix=inputs=${micLabels.length + 1}:duration=longest:normalize=0,alimiter=limit=0.95:level=false[audio]`)
  else filters.push('[piano]alimiter=limit=0.95:level=false[audio]')
  args.push('-filter_complex', filters.join(';'), '-map', `[${video}]`, '-map', '[audio]', '-t', duration.toFixed(6), '-r', String(FPS))
  if (format === 'mp4') args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart')
  else args.push('-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-c:a', 'libopus', '-b:a', '160k')
  return [...args, output]
}

function mediaKind(segment: ResolvedMediaSegment): 'video' | 'audio' {
  return segment.kind ?? segment.source.kind ?? 'video'
}

/** Mix reusable recorded audio segments against the same take clock used by video export. */
export function audioTimelineFfmpegArgs(wav: string, mediaInputs: readonly CameraInput[], segments: readonly ResolvedMediaSegment[], output: string, duration: number, settings: TranscriptionSettings): string[] {
  const args = ['-y', '-i', wav]
  mediaInputs.forEach((input) => args.push('-i', input.path))
  const filters: string[] = []
  const inputIndex = new Map(mediaInputs.map((input, index) => [input.source.id, index + 1]))
  const pads = new Map<number, string>()
  mediaInputs.forEach((input, inputOffset) => {
    const sourceIndex = inputOffset + 1
    const audioSegments = segments.map((segment, index) => ({ segment, index })).filter(({ segment }) => segment.sourceId === input.source.id && segment.durationMs > 0 && (mediaKind(segment) === 'audio' || (segment.source.hasMicrophone && segment.kind == null && segment.source.kind == null)))
    if (audioSegments.length === 1) pads.set(audioSegments[0].index, `${sourceIndex}:a`)
    else if (audioSegments.length > 1) {
      const labels = audioSegments.map(({ index }) => `audioSource${index}`)
      filters.push(`[${sourceIndex}:a]asplit=${labels.length}${labels.map((label) => `[${label}]`).join('')}`)
      audioSegments.forEach(({ index }, labelIndex) => pads.set(index, labels[labelIndex]))
    }
  })
  filters.push(`[0:a]volume=${settings.exportAudioMix === 'recorded' ? 0 : settings.pianoVolume ?? 1},apad[piano]`)
  const recorded: string[] = []
  segments.forEach((segment, index) => {
    const sourceIndex = inputIndex.get(segment.sourceId)
    if (sourceIndex == null || segment.durationMs <= 0 || (mediaKind(segment) !== 'audio' && !(segment.source.hasMicrophone && segment.kind == null && segment.source.kind == null))) return
    const config = settings.mediaSources?.find((source) => source.id === (segment.inputId ?? segment.source.inputId))
    const volume = config?.volume ?? settings.microphoneVolume ?? 1
    if (volume <= 0 || settings.exportAudioMix === 'synth') return
    const label = `recorded${index}`
    const rawTimelineStart = (segment.startMs + (config?.latencyMs ?? 0)) / 1000
    const sourceStart = Math.max(0, segment.sourceOffsetMs / 1000 - Math.min(0, rawTimelineStart))
    filters.push(`[${pads.get(index) ?? `${sourceIndex}:a`}]atrim=start=${sourceStart.toFixed(6)}:duration=${Math.max(.001, segment.durationMs / 1000).toFixed(6)},asetpts=PTS-STARTPTS+${Math.max(0, rawTimelineStart).toFixed(6)}/TB,volume=${volume}[${label}]`)
    recorded.push(`[${label}]`)
  })
  if (recorded.length) filters.push(`[piano]${recorded.join('')}amix=inputs=${recorded.length + 1}:duration=longest:normalize=0,alimiter=limit=0.95:level=false[audio]`)
  else filters.push('[piano]alimiter=limit=0.95:level=false[audio]')
  args.push('-filter_complex', filters.join(';'), '-map', '[audio]', '-t', duration.toFixed(6), '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', output)
  return args
}

async function scoreImage(notes: readonly CapturedNote[], settings: TranscriptionSettings, page: number): Promise<HTMLImageElement> {
  const score = buildScoreDocument(notes, settings)
  const host = document.createElement('div')
  renderScore(host, { ...score, measures: score.measures.slice(page * 2, page * 2 + 2) }, PAPER.width, settings.chordNamesEnabled, { measuresPerSystem: 2 })
  const svg = host.querySelector('svg')!
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = `@font-face{font-family:Bravura;src:url(${scoreFontData})}`
  svg.prepend(style)
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  const image = new Image()
  try { image.src = url; await image.decode(); return image }
  finally { URL.revokeObjectURL(url) }
}

export function drawPerformanceFrame(context: CanvasRenderingContext2D, image: CanvasImageSource, notes: readonly CapturedNote[], settings: TranscriptionSettings, timeMs: number, pageProgress: number): void {
  context.fillStyle = '#0b0e12'; context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT)
  context.fillStyle = '#edf2f8'; context.font = 'bold 23px Arial'; context.fillText(settings.title || 'Transcribed piano', 28, 36, 950)
  context.font = '15px Arial'; context.fillStyle = '#a9bdd4'; context.fillText(`${settings.bpm} BPM · ${settings.meter} · ${(timeMs / 1000).toFixed(1)} s`, 990, 34)
  context.fillStyle = '#f3efe5'; context.fillRect(PAPER.x, PAPER.y, PAPER.width, PAPER.height)
  context.drawImage(image, PAPER.x, PAPER.y + 120, PAPER.width, 260)
  context.fillStyle = '#2e65a2'; context.fillRect(PAPER.x + 24, PAPER.y + PAPER.height - 24, (PAPER.width - 48) * Math.max(0, Math.min(1, pageProgress)), 3)
  const active = new Set(notes.filter((note) => note.startMs <= timeMs && note.endMs > timeMs).map((note) => note.pitch))
  const top = 560
  for (const black of [false, true]) for (let pitch = 21; pitch <= 108; pitch++) {
    if (isBlackKey(pitch) !== black) continue
    const bounds = black ? { x: pitchToKeyX(pitch, VIDEO_WIDTH), width: getBlackKeyWidth(VIDEO_WIDTH) } : getWhiteKeyBounds(pitch, VIDEO_WIDTH)
    context.fillStyle = active.has(pitch) ? black ? '#367eca' : '#8fbdef' : black ? '#14181e' : '#edece8'
    context.fillRect(bounds.x, top, bounds.width - 1, black ? 91 : 160)
  }
}

/** Offline frames use explicit timestamps; export speed cannot change musical timing. */
export async function exportPerformanceVideo(notes: readonly CapturedNote[], settings: TranscriptionSettings, outputPath: string, format: 'mp4' | 'webm', options: VideoExportOptions): Promise<void> {
  if (typeof VideoEncoder === 'undefined') throw new Error('Video export requires a desktop build with WebCodecs support.')
  const assertActive = () => { if (options.signal?.aborted) throw new DOMException('Export canceled', 'AbortError') }
  const duration = Math.max(options.durationMs / 1000, ...notes.map((note) => note.endMs / 1000), 0.1) + 1
  const directory = await window.electronAPI.export.getTempDir()
  await window.electronFS.mkdir(directory)
  let encoder: VideoEncoder | null = null
  try {
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({ target, video: { codec: 'V_VP9', width: VIDEO_WIDTH, height: VIDEO_HEIGHT, frameRate: FPS }, firstTimestampBehavior: 'offset' })
    let failure: Error | null = null
    encoder = new VideoEncoder({ output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata), error: (error) => { failure = error } })
    encoder.configure({ codec: 'vp09.00.10.08', width: VIDEO_WIDTH, height: VIDEO_HEIGHT, bitrate: 4_000_000, framerate: FPS })
    await document.fonts.ready
    const canvas = document.createElement('canvas'); canvas.width = VIDEO_WIDTH; canvas.height = VIDEO_HEIGHT
    const context = canvas.getContext('2d')!
    const measureMs = 60000 / settings.bpm * Number(settings.meter.split('/')[0]) * 4 / Number(settings.meter.split('/')[1])
    const count = Math.ceil(duration * FPS)
    let image: HTMLImageElement | null = null; let currentPage = -1
    const lastPage = Math.max(0, Math.ceil(buildScoreDocument(notes, settings).measures.length / 2) - 1)
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      assertActive(); if (failure) throw failure
      const time = frameIndex * 1000 / FPS
      const page = Math.min(lastPage, Math.floor(time / (measureMs * 2)))
      if (page !== currentPage) { image = await scoreImage(notes, settings, page); currentPage = page }
      drawPerformanceFrame(context, image!, notes, settings, time, (time - page * measureMs * 2) / (measureMs * 2))
      const frame = new VideoFrame(canvas, { timestamp: Math.round(frameIndex * 1_000_000 / FPS), duration: Math.round(1_000_000 / FPS) })
      try { encoder.encode(frame, { keyFrame: frameIndex % (FPS * 2) === 0 }) } finally { frame.close() }
      if (encoder.encodeQueueSize > 6) await encoder.flush()
      if (frameIndex % 15 === 0) { options.onProgress?.(0.7 * frameIndex / count); await new Promise((resolve) => setTimeout(resolve, 0)) }
    }
    await encoder.flush(); if (failure) throw failure
    muxer.finalize(); assertActive()
    const base = `${directory}/score.webm`; const wav = `${directory}/piano.wav`
    await window.electronFS.writeFile(base, new Uint8Array(target.buffer))
    await writeAudioBufferToWav(options.audio, wav)
    const timeline = options.cameraTimeline?.filter((segment) => segment.durationMs > 0) ?? []
    const uniqueSources = [...new Map(timeline.map((segment) => [segment.source.id, segment.source])).values()]
    const cameraInputs: CameraInput[] = uniqueSources.map((source, index) => ({ source, path: `${directory}/camera-${index}.webm` }))
    for (const input of cameraInputs) await window.electronFS.writeFile(input.path, new Uint8Array(await input.source.blob.arrayBuffer()))
    const cameraPath = timeline.length === 0 && options.camera ? `${directory}/camera.webm` : null
    if (cameraPath && options.camera) await window.electronFS.writeFile(cameraPath, new Uint8Array(await options.camera.blob.arrayBuffer()))
    options.onProgress?.(0.75)
    const result = `${directory}/performance.${format}`
    await window.electronAPI.ffmpeg.run(timeline.length > 0
      ? videoTimelineFfmpegArgs(base, wav, cameraInputs, timeline, result, format, duration, settings)
      : videoFfmpegArgs(base, wav, cameraPath, options.camera?.hasMicrophone ?? false, result, format, duration, settings))
    assertActive()
    await window.electronFS.writeFile(outputPath, await window.electronFS.readFile(result))
    options.onProgress?.(1)
  } finally {
    if (encoder?.state !== 'closed') encoder?.close()
    await window.electronFS.rm(directory)
  }
}
