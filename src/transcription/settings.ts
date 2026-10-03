import type { KeySignature, TranscriptionMediaSource, TranscriptionSettings, WebcamOverlay } from './types'

export const KEY_SIGNATURES: readonly KeySignature[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']
export const FACE_CAMERA_OVERLAY: WebcamOverlay = { x: .74, y: .04, width: .24, height: .36, mirror: true, crop: 0, cropX: .5, cropY: .5 }
export const PIANO_CAMERA_OVERLAY: WebcamOverlay = { x: 0, y: .7, width: 1, height: .3, mirror: false, crop: 0, cropX: .5, cropY: .58 }
export const OVERHEAD_CAMERA_OVERLAY: WebcamOverlay = { x: .03, y: .48, width: .42, height: .48, mirror: false, crop: 0, cropX: .5, cropY: .5 }

export function defaultVideoOverlay(role: TranscriptionMediaSource['role'], index = 0): WebcamOverlay {
  const base = role === 'piano' ? PIANO_CAMERA_OVERLAY : role === 'overhead' ? OVERHEAD_CAMERA_OVERLAY : FACE_CAMERA_OVERLAY
  if (role === 'piano') return { ...base }
  const offset = Math.min(index, 3) * .025
  return { ...base, x: Math.max(0, Math.min(1 - base.width, base.x - offset)), y: Math.max(0, Math.min(1 - (base.height ?? .36), base.y + offset)) }
}

export const TRANSCRIPTION_SETTINGS: TranscriptionSettings = {
  bpm: 120, meter: '4/4', midiDeviceId: null, chordNamesEnabled: true, keyLabelsEnabled: false,
  title: 'Transcribed piano', tempoMode: 'manual', quantization: 'sixteenth', keySignature: 'auto',
  staffSplit: 60, minimumNoteMs: 20, chordToleranceMs: 25, countInBeats: 0, metronome: false,
  webcamEnabled: false, cameraDeviceId: null, microphoneEnabled: false, microphoneDeviceId: null,
  webcamOverlay: FACE_CAMERA_OVERLAY,
  pianoVolume: 1, microphoneVolume: 1, exportTiming: 'edited', exportAudioMix: 'combined', liveView: 'score', mediaSources: [],
}

export function normalizeTranscriptionSettings(value: Partial<TranscriptionSettings> = {}): TranscriptionSettings {
  const result = { ...TRANSCRIPTION_SETTINGS, ...value }
  const number = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  const overlay = value.webcamOverlay ?? TRANSCRIPTION_SETTINGS.webcamOverlay!
  const mediaSources = normalizeMediaSources(value.mediaSources, result)
  return {
    ...result, title: typeof value.title === 'string' ? value.title.slice(0, 120) : 'Transcribed piano',
    bpm: number(value.bpm, 120, 20, 300), meter: ['3/4', '4/4', '6/8'].includes(result.meter) ? result.meter : '4/4',
    tempoMode: result.tempoMode === 'auto' ? 'auto' : 'manual',
    quantization: ['eighth', 'eighth-triplet', 'sixteenth', 'sixteenth-triplet', 'none'].includes(result.quantization!) ? result.quantization : 'sixteenth',
    keySignature: result.keySignature === 'auto' || KEY_SIGNATURES.includes(result.keySignature as KeySignature) ? result.keySignature : 'auto',
    staffSplit: Math.round(number(value.staffSplit, 60, 21, 108)), minimumNoteMs: number(value.minimumNoteMs, 20, 0, 150),
    chordToleranceMs: number(value.chordToleranceMs, 25, 0, 60), countInBeats: [0, 3, 4, 6].includes(result.countInBeats!) ? result.countInBeats : 0,
    pianoVolume: number(value.pianoVolume, 1, 0, 2), microphoneVolume: number(value.microphoneVolume, 1, 0, 2),
    webcamEnabled: result.webcamEnabled === true, microphoneEnabled: result.microphoneEnabled === true, metronome: result.metronome === true,
    chordNamesEnabled: result.chordNamesEnabled !== false, keyLabelsEnabled: result.keyLabelsEnabled === true,
    midiDeviceId: typeof result.midiDeviceId === 'string' ? result.midiDeviceId : null,
    cameraDeviceId: typeof result.cameraDeviceId === 'string' ? result.cameraDeviceId : null,
    microphoneDeviceId: typeof result.microphoneDeviceId === 'string' ? result.microphoneDeviceId : null,
    exportTiming: result.exportTiming === 'original' ? 'original' : 'edited',
    exportAudioMix: result.exportAudioMix === 'synth' || result.exportAudioMix === 'recorded' ? result.exportAudioMix : 'combined',
    liveView: result.liveView === 'fallingKeys' ? 'fallingKeys' : 'score',
    mediaSources,
    webcamOverlay: normalizeOverlay(overlay, FACE_CAMERA_OVERLAY),
  }
}

function normalizeOverlay(value: Partial<WebcamOverlay> | undefined, fallback: WebcamOverlay): WebcamOverlay {
  const number = (candidate: unknown, defaultValue: number, min: number, max: number) => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : defaultValue
  const width = number(value?.width, fallback.width, .15, 1)
  const height = number(value?.height, fallback.height ?? .36, .12, 1)
  return {
    x: number(value?.x, fallback.x, 0, 1 - width),
    y: number(value?.y, fallback.y, 0, 1 - height),
    width,
    height,
    mirror: typeof value?.mirror === 'boolean' ? value.mirror : fallback.mirror,
    crop: number(value?.crop, fallback.crop, 0, .35),
    cropX: number(value?.cropX, fallback.cropX ?? .5, 0, 1),
    cropY: number(value?.cropY, fallback.cropY ?? .5, 0, 1),
  }
}

function normalizeMediaSources(value: readonly TranscriptionMediaSource[] | undefined, legacy: TranscriptionSettings): TranscriptionMediaSource[] {
  const defaults = TRANSCRIPTION_SETTINGS.webcamOverlay!
  const candidates: readonly TranscriptionMediaSource[] = Array.isArray(value) ? value : []
  const normalized = candidates.slice(0, 12).flatMap((source, index) => {
    if (!source || (source.kind !== 'video' && source.kind !== 'audio')) return []
    const kind = source.kind
    const role = ['face', 'piano', 'overhead', 'microphone', 'room', 'other'].includes(source.role) ? source.role : kind === 'video' ? 'face' : 'microphone'
    return [{
      id: typeof source.id === 'string' && source.id ? source.id : `media-${kind}-${index}`,
      kind,
      role,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 60) : kind === 'video' ? `Camera ${index + 1}` : `Audio ${index + 1}`,
      deviceId: typeof source.deviceId === 'string' && source.deviceId ? source.deviceId : null,
      enabled: source.enabled !== false,
      volume: typeof source.volume === 'number' && Number.isFinite(source.volume) ? Math.min(2, Math.max(0, source.volume)) : 1,
      latencyMs: typeof source.latencyMs === 'number' && Number.isFinite(source.latencyMs) ? Math.min(2000, Math.max(-2000, Math.round(source.latencyMs))) : 0,
      ...(kind === 'video' ? { overlay: normalizeOverlay(source.overlay, defaultVideoOverlay(role, index)) } : {}),
    } satisfies TranscriptionMediaSource]
  })
  if (normalized.length || !legacy.webcamEnabled) return normalized
  return [
    { id: 'legacy-camera', kind: 'video', role: 'face', name: 'Face camera', deviceId: legacy.cameraDeviceId ?? null, enabled: true, volume: 1, latencyMs: 0, overlay: normalizeOverlay(legacy.webcamOverlay, defaults) },
    ...(legacy.microphoneEnabled ? [{ id: 'legacy-microphone', kind: 'audio' as const, role: 'microphone' as const, name: 'Microphone', deviceId: legacy.microphoneDeviceId ?? null, enabled: true, volume: legacy.microphoneVolume ?? 1, latencyMs: 0 }] : []),
  ]
}
