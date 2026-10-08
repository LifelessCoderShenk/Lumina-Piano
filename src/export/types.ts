export interface ExportSettings {
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
