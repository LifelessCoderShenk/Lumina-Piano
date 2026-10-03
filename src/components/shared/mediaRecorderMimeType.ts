const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const
const AUDIO_RECORDING_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm'] as const

/**
 * Prefer VP9, but never make camera capture depend on one encoder being
 * present. Electron builds and individual GPU stacks differ here.
 */
export function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }

  return RECORDING_MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

export function createRecordingMediaRecorder(stream: MediaStream): MediaRecorder {
  const hasVideo = typeof stream.getVideoTracks !== 'function' || stream.getVideoTracks().length > 0
  const mimeType = hasVideo
    ? getSupportedRecordingMimeType()
    : AUDIO_RECORDING_MIME_CANDIDATES.find((candidate) => typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(candidate))
  const videoBitsPerSecond = resolveCameraRecordingBitrate(stream)
  const options: MediaRecorderOptions = {
    audioBitsPerSecond: 192_000,
    ...(mimeType == null ? {} : { mimeType }),
    ...(hasVideo ? { videoBitsPerSecond } : {}),
  }

  return new MediaRecorder(stream, options)
}

/**
 * Do not let Chromium's low screen-recording default soften the source before
 * the Camera/Record compositor ever sees it. Track settings are optional, so
 * use a high-quality 1080p fallback until metadata becomes available.
 */
export function resolveCameraRecordingBitrate(stream: MediaStream): number {
  // Some browser shims (and older Electron test environments) expose a
  // stream that MediaRecorder can consume without the track inspection API.
  // Keep the capture path resilient and fall back to the quality baseline.
  const videoTracks = typeof stream.getVideoTracks === 'function'
    ? stream.getVideoTracks()
    : []
  const settings = videoTracks[0]?.getSettings?.()
  const width = Math.max(1, Math.round(settings?.width ?? 1920))
  const height = Math.max(1, Math.round(settings?.height ?? 1080))
  const frameRate = Math.max(1, settings?.frameRate ?? 30)
  return Math.min(45_000_000, Math.max(8_000_000, Math.round(width * height * frameRate * 0.18)))
}
