export interface ExportSettings {
  resolution: '720p' | '1080p' | '4K'
  fps: 30 | 60
  outputPath: string
  includeAudio: boolean
}

export interface ExportResolution {
  width: number
  height: number
}

export interface ExportProgress {
  progress: number
  framesRendered: number
  totalFrames: number
  estimatedSecondsRemaining: number
  phase: 'frames' | 'audio' | 'combining' | 'done'
}

export const RESOLUTIONS: Record<ExportSettings['resolution'], ExportResolution> = {
  '720p': { height: 720, width: 1280 },
  '1080p': { height: 1080, width: 1920 },
  '4K': { height: 2160, width: 3840 },
}
