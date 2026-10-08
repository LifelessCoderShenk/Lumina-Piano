import * as Tone from 'tone'

import type { AppState } from '../store/store'
import { tickToSeconds } from '../tempo/tempoMap'

const ATTACK_SECONDS = 0.01
const RELEASE_SECONDS = 0.5
const MIN_SCHEDULE_OFFSET_SECONDS = 0.001
const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

const SALAMANDER_SAMPLE_URLS = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3', C8: 'C8.mp3',
} as const

export async function renderOfflineMidiAudioBuffer(
  state: AppState,
  durationSeconds: number,
  leadInSeconds = 0,
  allowSilentBuffer = false,
): Promise<AudioBuffer | null> {
  const projectData = state.projectData
  const tempoMap = state.precomputedTempoMap
  if (projectData == null || tempoMap == null || (!allowSilentBuffer && !hasRenderableMidiAudio(state))) {
    return null
  }

  const safeDuration = Math.max(MIN_SCHEDULE_OFFSET_SECONDS, durationSeconds)
  Tone.Transport.cancel()
  Tone.Transport.swing = 0
  Tone.Transport.loop = false
  Tone.Transport.loopStart = 0
  Tone.Transport.loopEnd = 0
  Tone.Transport.position = 0

  const renderedBuffer = await Tone.Offline(async () => {
    const sampler = new Tone.Sampler({
      attack: ATTACK_SECONDS,
      baseUrl: SALAMANDER_BASE_URL,
      release: RELEASE_SECONDS,
      urls: SALAMANDER_SAMPLE_URLS,
    }).toDestination()

    await Tone.loaded()

    for (const track of projectData.tracks) {
      if (!shouldPlayTrack(track.id, state)) {
        continue
      }

      for (const note of track.notes) {
        const noteStartSeconds = leadInSeconds + tickToSeconds(note.startTick, tempoMap)
        const noteEndSeconds = leadInSeconds + tickToSeconds(note.endTick, tempoMap)
        const duration = Math.max(0, noteEndSeconds - noteStartSeconds)
        sampler.triggerAttackRelease(
          Tone.Frequency(note.pitch, 'midi').toNote(),
          duration,
          noteStartSeconds <= 0 ? 0 : Math.max(noteStartSeconds, MIN_SCHEDULE_OFFSET_SECONDS),
          note.velocity / 127,
        )
      }
    }
  }, safeDuration)

  // Tone wraps OfflineAudioContext output in ToneAudioBuffer; the Web Audio
  // mixer used by camera export needs the native buffer it contains. The
  // fallback supports the existing native-AudioBuffer test double as well.
  if (typeof renderedBuffer.get === 'function') {
    return renderedBuffer.get() ?? null
  }

  return renderedBuffer as unknown as AudioBuffer
}

export function hasRenderableMidiAudio(state: AppState): boolean {
  const projectData = state.projectData
  if (projectData == null) {
    return false
  }
  return projectData.tracks.some((track) => shouldPlayTrack(track.id, state) && track.notes.length > 0)
}

function shouldPlayTrack(trackId: string, state: AppState): boolean {
  const anySoloed = Object.values(state.trackSoloed).some(Boolean)
  return anySoloed ? state.trackSoloed[trackId] === true : state.trackMuted[trackId] !== true
}
