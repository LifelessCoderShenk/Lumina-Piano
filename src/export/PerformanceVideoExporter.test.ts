import { describe, expect, it } from 'vitest'

import {
  createPerformanceMuxArgs,
  resolvePerformanceFrameCount,
  resolvePerformanceFrameTimestampMicros,
} from './PerformanceVideoExporter'

describe('deterministic Performance Video export', () => {
  it('creates every frame from the fixed export clock at 30 and 60 FPS', () => {
    expect(resolvePerformanceFrameCount(1.01, 30)).toBe(31)
    expect(resolvePerformanceFrameCount(1.01, 60)).toBe(61)
    expect(resolvePerformanceFrameTimestampMicros(0, 60)).toBe(0)
    expect(resolvePerformanceFrameTimestampMicros(1, 60)).toBe(16_667)
    expect(resolvePerformanceFrameTimestampMicros(60, 60)).toBe(1_000_000)
  })

  it('mixes linked camera audio with MIDI trimmed to its positive timeline offset', () => {
    const args = createPerformanceMuxArgs({
      cameraAudioPath: 'C:/Temp/camera.webm',
      durationSeconds: 12,
      midiAudioPath: 'C:/Temp/midi.wav',
      midiAudioSourceTimeAtExportStartSeconds: 0.5,
      outputPath: 'C:/Videos/take.mp4',
      videoPath: 'C:/Temp/frames.webm',
    })

    expect(args).toContain('C:/Temp/camera.webm')
    expect(args).toContain('C:/Temp/midi.wav')
    expect(args).toContain('C:/Videos/take.mp4')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args.join(' ')).toContain('atrim=start=0.5:duration=12')
    expect(args.join(' ')).toContain('amix=inputs=2')
  })

  it('delays MIDI for a negative offset and keeps WebM video lossless between stages', () => {
    const args = createPerformanceMuxArgs({
      durationSeconds: 5,
      midiAudioPath: 'C:/Temp/midi.wav',
      midiAudioSourceTimeAtExportStartSeconds: -0.25,
      outputPath: 'C:/Videos/take.webm',
      videoPath: 'C:/Temp/frames.webm',
    })

    expect(args.join(' ')).toContain('adelay=250:all=1')
    expect(args).toContain('copy')
    expect(args).toContain('libopus')
  })

  it('exports silent video without creating an audio map', () => {
    const args = createPerformanceMuxArgs({
      durationSeconds: 2,
      outputPath: 'C:/Videos/take.webm',
      videoPath: 'C:/Temp/frames.webm',
    })

    expect(args).toContain('-an')
    expect(args).not.toContain('-filter_complex')
  })

  it('mixes an independently offset imported soundtrack with camera and MIDI audio', () => {
    const args = createPerformanceMuxArgs({
      cameraAudioPath: 'C:/Temp/camera.webm',
      durationSeconds: 8,
      midiAudioPath: 'C:/Temp/midi.wav',
      outputPath: 'C:/Videos/take.mp4',
      soundtrackAudioPath: 'C:/Temp/master.wav',
      soundtrackSourceTimeAtExportStartSeconds: -0.75,
      videoPath: 'C:/Temp/frames.webm',
    })

    expect(args).toContain('C:/Temp/master.wav')
    expect(args.join(' ')).toContain('adelay=750:all=1')
    expect(args.join(' ')).toContain('amix=inputs=3')
  })
})
