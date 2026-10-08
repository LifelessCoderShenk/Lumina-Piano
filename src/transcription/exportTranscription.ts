import { VexFlow } from 'vexflow'
import { scoreFontData } from './scoreFontData'
import { Midi } from '@tonejs/midi'
import { decomposeTicksForNotation, renderScore } from '../components/TranscriptorMode/ScoreSheet'
import { writeAudioBufferToWav } from '../export/wavWriter'
import { buildScoreDocument } from './scoreModel'
import type { CapturedNote, ScoreDocument, TranscriptionSettings, TranscriptionInputEvent } from './types'
import type { RecordedCameraTake, ResolvedMediaSegment } from './mediaStorage'
import { audioTimelineFfmpegArgs, exportPerformanceVideo, type CameraInput } from './videoExport'

export type TranscriptionExportFormat = 'pdf' | 'mid' | 'mp3' | 'mp4' | 'webm'
export interface TranscriptionExportOptions {
  originalNotes?: readonly CapturedNote[]
  events?: readonly TranscriptionInputEvent[]
  camera?: RecordedCameraTake | null
  cameraTimeline?: readonly ResolvedMediaSegment[]
  durationMs?: number
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}
export function exportFileName(title: string | undefined): string {
  return (title || 'Transcribed piano').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || 'transcription'
}
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/** Export original performance timing; notation quantization never changes MIDI/audio. */
export function createTranscriptionMidi(notes: readonly CapturedNote[], settings: TranscriptionSettings, events: readonly TranscriptionInputEvent[] = []): Uint8Array {
  const midi = new Midi()
  midi.header.name = settings.title || 'Transcribed piano'
  midi.header.setTempo(settings.bpm)
  const [numerator, denominator] = settings.meter.split('/').map(Number)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [numerator, denominator] })
  const groups = new Map<string, CapturedNote[]>()
  notes.forEach((note) => { const id = `${note.sourceId ?? 'midi'}:${note.channel}`; groups.set(id, [...(groups.get(id) ?? []), note]) })
  const usedChannels = new Set<number>()
  for (const group of groups.values()) {
    const channel = group[0].channel
    const track = midi.addTrack()
    track.name = settings.title || 'Transcribed piano'
    const preferred = channel % 16
    track.channel = usedChannels.has(preferred) ? Array.from({ length: 16 }, (_, i) => i).find((i) => i !== 9 && !usedChannels.has(i)) ?? preferred : preferred
    usedChannels.add(track.channel)
    track.instrument.number = 0
    for (const note of group) {
      const end = events.length ? note.keyEndMs ?? note.endMs : note.endMs
      track.addNote({ midi: note.pitch, time: note.startMs / 1000, duration: Math.max(1, end - note.startMs) / 1000, velocity: note.velocity / 127 })
    }
    for (const event of events) {
      if (event.type === 'controlchange' && event.controller === 64 && event.channel === channel && (event.sourceId ?? 'midi') === (group[0].sourceId ?? 'midi')) track.addCC({ number: 64, value: (event.value ?? 0) / 127, time: event.timestampMs / 1000 })
    }
  }
  return midi.toArray()
}

export function getPrintMeasuresPerSystem(score: ScoreDocument): 2 | 3 {
  const dense = score.measures.some((measure) => [...measure.trebleVoices, ...measure.bassVoices].some((voice) =>
    voice.events.reduce((count, event) => count + decomposeTicksForNotation(event.durationTicks).length, 0) > 8,
  ))
  return dense ? 2 : 3
}

export async function createScorePrintHtml(notes: readonly CapturedNote[], settings: TranscriptionSettings): Promise<string> {
  await document.fonts.ready
  VexFlow.setFonts('Bravura', 'Academico')
  const score = buildScoreDocument(notes, settings)
  const title = escapeHtml(settings.title || 'Transcribed piano')
  const pages: string[] = []
  const measuresPerSystem = getPrintMeasuresPerSystem(score)
  const measuresPerPage = measuresPerSystem * 4
  // Exactly four complete grand-staff systems on each full page.
  for (let offset = 0; offset < score.measures.length; offset += measuresPerPage) {
    const host = document.createElement('div')
    renderScore(host, { ...score, measures: score.measures.slice(offset, offset + measuresPerPage) }, 1200, settings.chordNamesEnabled, { measuresPerSystem, systemHeight: 280 })
    host.querySelector('svg')?.removeAttribute('style')
    pages.push(`<section><h1>${title}</h1><p>${settings.bpm} BPM · ${settings.meter} · ${score.keySignature} · Measures ${offset + 1}–${Math.min(offset + measuresPerPage, score.measures.length)}</p>${host.innerHTML}<footer>${pages.length + 1}</footer></section>`)
  }
  return `<!doctype html><html><head><title>Transcribed piano</title><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><style>@font-face{font-family:Bravura;src:url(${scoreFontData}) format('woff2')}@page{size:A4 portrait;margin:14mm}body{margin:0;color:#111;font-family:Arial,sans-serif}section{break-after:page}section:last-child{break-after:auto}h1{font-size:20px;margin:0 0 8px}p{font-size:12px}svg{display:block;width:100%;height:auto}footer{text-align:center;font-size:11px;margin-top:16px}</style></head><body>${pages.join('')}</body></html>`
}

/** Local piano-like synthesis works offline and does not alter live playback. */
export async function renderTranscriptionAudio(notes: readonly CapturedNote[], minimumDuration = 0, volume = 1): Promise<AudioBuffer> {
  const duration = Math.max(minimumDuration, notes.reduce((end, note) => Math.max(end, note.endMs / 1000), 0) + 1)
  const context = new OfflineAudioContext(1, Math.ceil(duration * 44100), 44100)
  const master = context.createGain()
  master.gain.value = 0.2 * volume
  const compressor = context.createDynamicsCompressor()
  master.connect(compressor).connect(context.destination)
  for (const note of notes) {
    const start = note.startMs / 1000
    const end = Math.max(start + 0.001, note.endMs / 1000)
    const envelope = context.createGain()
    const peak = note.velocity / 127
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + Math.min(0.004, (end - start) / 2))
    envelope.gain.setTargetAtTime(peak * 0.3, start + Math.min(0.004, (end - start) / 2), 0.3)
    envelope.gain.cancelAndHoldAtTime(end)
    envelope.gain.setTargetAtTime(0, end, 0.12)
    envelope.connect(master)
    for (const [harmonic, gain] of [[1, 1], [2, 0.3], [3, 0.12]]) {
      const frequency = 440 * 2 ** ((note.pitch - 69) / 12) * harmonic
      if (frequency >= 22050) continue
      const oscillator = context.createOscillator()
      const level = context.createGain()
      oscillator.frequency.value = frequency
      level.gain.value = gain
      oscillator.connect(level).connect(envelope)
      oscillator.start(start)
      oscillator.stop(end + 0.9)
    }
  }
  return context.startRendering()
}

export async function exportTranscription(editedNotes: readonly CapturedNote[], settings: TranscriptionSettings, format: TranscriptionExportFormat, options: TranscriptionExportOptions = {}): Promise<string | null> {
  const notes = format !== 'pdf' && settings.exportTiming === 'original' ? options.originalNotes ?? editedNotes : editedNotes
  if (notes.length === 0) throw new Error('Record some notes before exporting.')
  const api = window.electronAPI
  if (!api?.export || !window.electronFS) throw new Error('Export requires the desktop app.')
  if (format === 'pdf' && !api.export.saveScorePdf) throw new Error('Restart the desktop app to enable PDF export.')
  const outputPath = await api.showSaveDialog({ defaultPath: `${exportFileName(settings.title)}.${format}`, filters: [{ name: format === 'mid' ? 'MIDI' : format.toUpperCase(), extensions: [format] }] })
  if (outputPath == null) return null
  if (format === 'mid') {
    await window.electronFS.writeFile(outputPath, createTranscriptionMidi(notes, settings, settings.exportTiming === 'original' ? options.events : undefined))
  } else if (format === 'pdf') {
    await api.export.saveScorePdf!(await createScorePrintHtml(notes, settings), outputPath)
  } else if (format === 'mp4' || format === 'webm') {
    const durationMs = options.durationMs ?? 0
    await exportPerformanceVideo(notes, settings, outputPath, format, { ...options, durationMs, audio: await renderTranscriptionAudio(notes, durationMs / 1000 + 1) })
  } else {
    const directory = await api.export.getTempDir()
    await window.electronFS.mkdir(directory)
    try {
      const wav = `${directory}/transcription.wav`
      const timeline = options.cameraTimeline?.filter((segment) => segment.durationMs > 0 && ((segment.kind ?? segment.source.kind) === 'audio' || (segment.source.hasMicrophone && segment.kind == null && segment.source.kind == null))) ?? []
      const usesRecordedTimeline = timeline.length > 0 && settings.exportAudioMix !== 'synth'
      await writeAudioBufferToWav(await renderTranscriptionAudio(notes, 0, usesRecordedTimeline ? 1 : settings.pianoVolume ?? 1), wav)
      if (usesRecordedTimeline) {
        const uniqueSources = [...new Map(timeline.map((segment) => [segment.source.id, segment.source])).values()]
        const inputs: CameraInput[] = uniqueSources.map((source, index) => ({ source, path: `${directory}/audio-${index}.webm` }))
        for (const input of inputs) await window.electronFS.writeFile(input.path, new Uint8Array(await input.source.blob.arrayBuffer()))
        const duration = Math.max((options.durationMs ?? 0) / 1000, ...notes.map((note) => note.endMs / 1000), .1) + 1
        await api.ffmpeg.run(audioTimelineFfmpegArgs(wav, inputs, timeline, outputPath, duration, settings))
      } else await api.ffmpeg.run(['-y', '-i', wav, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outputPath])
    } finally {
      await window.electronFS.rm(directory)
    }
  }
  return outputPath
}
