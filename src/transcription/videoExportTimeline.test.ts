import { describe, expect, it } from 'vitest'
import { normalizeTranscriptionSettings } from './settings'
import type { RecordedCameraTake, ResolvedMediaSegment } from './mediaStorage'
import { audioTimelineFfmpegArgs, videoTimelineFfmpegArgs } from './videoExport'

describe('performance video take timeline', () => {
  it('trims and places reusable webcam and microphone segments at their take times', () => {
    const first: RecordedCameraTake = { id: 'camera-a', blob: new Blob(), durationMs: 8000, hasMicrophone: true }
    const second: RecordedCameraTake = { id: 'camera-b', blob: new Blob(), durationMs: 4000, hasMicrophone: false }
    const segments: ResolvedMediaSegment[] = [
      { source: first, sourceId: first.id, sourceOffsetMs: 1000, startMs: 0, durationMs: 2000 },
      { source: second, sourceId: second.id, sourceOffsetMs: 500, startMs: 2000, durationMs: 1500 },
      { source: first, sourceId: first.id, sourceOffsetMs: 5000, startMs: 3500, durationMs: 1000 },
    ]
    const args = videoTimelineFfmpegArgs('score.webm', 'piano.wav', [
      { source: first, path: 'camera-a.webm' },
      { source: second, path: 'camera-b.webm' },
    ], segments, 'out.mp4', 'mp4', 5, normalizeTranscriptionSettings({ microphoneVolume: 0.65 }))
    const filter = args[args.indexOf('-filter_complex') + 1]

    expect(args.slice(0, 8)).toEqual(['-y', '-i', 'score.webm', '-i', 'camera-a.webm', '-i', 'camera-b.webm', '-i'])
    expect(filter).toContain('[1:v]split=2[sourceVideo0][sourceVideo2]')
    expect(filter).toContain('[sourceVideo0]trim=start=1.000000:duration=2.000000')
    expect(filter).toContain("enable='between(t,2.000000,3.500000)'")
    expect(filter).toContain('[1:a]asplit=2[sourceAudio0][sourceAudio2]')
    expect(filter).toContain('[sourceAudio2]atrim=start=5.000000:duration=1.000000')
    expect(filter).not.toContain('[2:a]')
    expect(filter).toContain('amix=inputs=3')
    expect(args).toContain('[video2]')
  })

  it('overlays each video with its own layout and mixes audio-only inputs with latency correction', () => {
    const face: RecordedCameraTake = { id: 'face-asset', inputId: 'face', kind: 'video', blob: new Blob(), durationMs: 3000, hasMicrophone: false }
    const piano: RecordedCameraTake = { id: 'piano-asset', inputId: 'piano-audio', kind: 'audio', blob: new Blob(), durationMs: 3000, hasMicrophone: true }
    const segments: ResolvedMediaSegment[] = [
      { source: face, sourceId: face.id, inputId: 'face', kind: 'video', sourceOffsetMs: 0, startMs: 0, durationMs: 3000 },
      { source: piano, sourceId: piano.id, inputId: 'piano-audio', kind: 'audio', sourceOffsetMs: 0, startMs: 0, durationMs: 3000 },
    ]
    const settings = normalizeTranscriptionSettings({ mediaSources: [
      { id: 'face', kind: 'video', role: 'face', name: 'Face', deviceId: 'cam', enabled: true, volume: 1, latencyMs: 0, overlay: { x: .1, y: .2, width: .3, mirror: false, crop: .1 } },
      { id: 'piano-audio', kind: 'audio', role: 'piano', name: 'Piano audio', deviceId: 'line', enabled: true, volume: .8, latencyMs: 120 },
    ] })
    const args = videoTimelineFfmpegArgs('score.webm', 'piano.wav', [{ source: face, path: 'face.webm' }, { source: piano, path: 'piano.webm' }], segments, 'out.mp4', 'mp4', 4, settings)
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('crop=iw*0.8:ih*0.8')
    expect(filter).toContain('[2:a]atrim=start=0.000000:duration=3.000000,asetpts=PTS-STARTPTS+0.120000/TB,volume=0.8')
    expect(filter).not.toContain('[2:v]')

    const audioArgs = audioTimelineFfmpegArgs('piano.wav', [{ source: piano, path: 'piano.webm' }], [segments[1]], 'out.mp3', 4, settings)
    const audioFilter = audioArgs[audioArgs.indexOf('-filter_complex') + 1]
    expect(audioFilter).toContain('[1:a]atrim=start=0.000000:duration=3.000000')
    expect(audioFilter).toContain('amix=inputs=2')
  })
})
