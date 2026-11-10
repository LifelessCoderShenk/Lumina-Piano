import { PIANO_ATTACK_SECONDS, PIANO_RELEASE_SECONDS, PIANO_SAMPLE_URLS } from './pianoSamples'

interface PianoNote { pitch: number; velocity: number; startMs: number; endMs: number }
const pitchClasses: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }
const samples = Object.entries(PIANO_SAMPLE_URLS).map(([name, url]) => {
  const [, key, octave] = /^([A-G]#?)(\d+)$/.exec(name)!
  return { pitch: (Number(octave) + 1) * 12 + pitchClasses[key], url }
})

/** Separate offline context preserves live playback; endMs includes captured pedal sustain. */
export async function renderSampledPiano(notes: readonly PianoNote[], minimumDuration = 0, volume = 1): Promise<AudioBuffer> {
  const duration = Math.max(minimumDuration, notes.reduce((end, note) => Math.max(end, note.endMs / 1000), 0) + 1)
  const context = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100)
  const master = context.createGain()
  master.gain.value = 0.2 * Math.max(0, Math.min(1, volume))
  const compressor = context.createDynamicsCompressor()
  master.connect(compressor).connect(context.destination)
  const selected = notes.map(note => samples.reduce((best, sample) => Math.abs(sample.pitch - note.pitch) < Math.abs(best.pitch - note.pitch) ? sample : best))
  const buffers = new Map<string, AudioBuffer>()
  await Promise.all([...new Set(selected.map(sample => sample.url))].map(async url => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Sample response: ${response.status}`)
      buffers.set(url, await context.decodeAudioData(await response.arrayBuffer()))
    } catch {
      throw new Error('Piano samples could not be loaded. Retry the export or restart Lumina.')
    }
  }))
  // Keep future sources out of the audio graph until their rendering window.
  // Thousands of dormant sources otherwise make long offline renders scale poorly.
  const windowSeconds = 30
  const windows = new Map<number, number[]>()
  notes.forEach((note, index) => {
    const window = Math.floor(note.startMs / (windowSeconds * 1000))
    const indices = windows.get(window) ?? []
    indices.push(index)
    windows.set(window, indices)
  })
  const schedule = (indices: readonly number[]) => indices.forEach(index => {
    const note = notes[index]
    const start = note.startMs / 1000
    const end = Math.max(start + 0.001, note.endMs / 1000)
    const source = context.createBufferSource()
    source.buffer = buffers.get(selected[index].url)!
    source.playbackRate.value = 2 ** ((note.pitch - selected[index].pitch) / 12)
    const envelope = context.createGain()
    const peak = Math.max(0, Math.min(127, note.velocity)) / 127
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + Math.min(PIANO_ATTACK_SECONDS, (end - start) / 2))
    envelope.gain.setValueAtTime(peak, end)
    envelope.gain.linearRampToValueAtTime(0, end + PIANO_RELEASE_SECONDS)
    source.connect(envelope).connect(master)
    source.start(start)
    source.stop(end + PIANO_RELEASE_SECONDS)
  })
  schedule(windows.get(0) ?? [])
  const scheduling = [...windows.entries()].filter(([window]) => window > 0).map(([window, indices]) =>
    context.suspend(window * windowSeconds).then(async () => {
      try { schedule(indices) } finally { await context.resume() }
    }),
  )
  const [rendered] = await Promise.all([context.startRendering(), ...scheduling])
  return rendered
}
