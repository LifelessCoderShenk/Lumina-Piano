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
    expect(filter).toContain('[2:a]atrim=start=0.000000:duration=3.000000,asetpts=PTS-STARTPTS,adelay=120.000:all=1,volume=0.8')
    expect(filter).not.toContain('[2:v]')

    const audioArgs = audioTimelineFfmpegArgs('piano.wav', [{ source: piano, path: 'piano.webm' }], [segments[1]], 'out.mp3', 4, settings)
    const audioFilter = audioArgs[audioArgs.indexOf('-filter_complex') + 1]
    expect(audioFilter).toContain('[1:a]atrim=start=0.000000:duration=3.000000')
    expect(audioFilter).toContain('amix=inputs=2')
  })
})

it('keeps the unfiltered video stream when only recorded audio is present', () => {
  const source: RecordedCameraTake = { id: 'mic', kind: 'audio', blob: new Blob(), durationMs: 500, hasMicrophone: true }
  const segments: ResolvedMediaSegment[] = [{ source, sourceId: source.id, kind: 'audio', startMs: 1000, sourceOffsetMs: 0, durationMs: 500 }]
  const settings = normalizeTranscriptionSettings({ exportAudioMix: 'recorded' })
  const video = videoTimelineFfmpegArgs('base.mp4', 'piano.wav', [{ source, path: 'mic.wav' }], segments, 'out.mp4', 'mp4', 2, settings)
  expect(video[video.indexOf('-map') + 1]).toBe('0:v')
  expect(video[video.indexOf('-filter_complex') + 1]).toContain('asetpts=PTS-STARTPTS,adelay=1000.000:all=1')
  const audio = audioTimelineFfmpegArgs('piano.wav', [{ source, path: 'mic.wav' }], segments, 'out.mp3', 2, settings)
  expect(audio[audio.indexOf('-filter_complex') + 1]).toContain('asetpts=PTS-STARTPTS,adelay=1000.000:all=1')
})

it('does not create unused audio split outputs for muted repeated clips', () => {
  const source: RecordedCameraTake = { id: 'camera', blob: new Blob(), durationMs: 2000, hasMicrophone: true }
  const segments = [0, 1000].map(startMs => ({ source, sourceId: source.id, startMs, sourceOffsetMs: 0, durationMs: 1000 }))
  for (const settings of [normalizeTranscriptionSettings({ exportAudioMix: 'synth' }), normalizeTranscriptionSettings({ microphoneVolume: 0 })]) {
    const video = videoTimelineFfmpegArgs('base.mp4', 'piano.wav', [{ source, path: 'camera.webm' }], segments, 'out.mp4', 'mp4', 2, settings)
    expect(video[video.indexOf('-filter_complex') + 1]).not.toContain('asplit=')
    const audio = audioTimelineFfmpegArgs('piano.wav', [{ source, path: 'camera.webm' }], segments, 'out.mp3', 2, settings)
    expect(audio[audio.indexOf('-filter_complex') + 1]).not.toContain('asplit=')
  }
})
it('clips negative audio latency at time zero instead of extending the segment', () => {
  const source: RecordedCameraTake = { id: 'mic', inputId: 'mic', kind: 'audio', blob: new Blob(), durationMs: 2000, hasMicrophone: true }
  const settings = normalizeTranscriptionSettings({ mediaSources: [{ id:'mic', kind:'audio', role:'piano', name:'Mic', deviceId:'test', enabled:true, volume:1, latencyMs:-200 }] })
  const segments = [{ source, sourceId:source.id, kind:'audio' as const, startMs:0, sourceOffsetMs:0, durationMs:1000 }]
  const args = audioTimelineFfmpegArgs('piano.wav', [{source,path:'mic.wav'}], segments, 'out.mp3', 2, settings)
  expect(args[args.indexOf('-filter_complex')+1]).toContain('atrim=start=0.200000:duration=0.800000')
})
