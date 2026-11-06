import { PIANO_SAMPLE_URLS, PIANO_ATTACK_SECONDS, PIANO_RELEASE_SECONDS } from './pianoSamples'
import * as Tone from 'tone'

import type { AppState } from '../store/store'
import { tickToSeconds } from '../tempo/tempoMap'

const MIN_SCHEDULE_OFFSET_SECONDS = 0.001


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
      attack: PIANO_ATTACK_SECONDS,
      baseUrl: '',
      release: PIANO_RELEASE_SECONDS,
      urls: PIANO_SAMPLE_URLS,
    }).toDestination()

    await Tone.loaded()

    for (const track of projectData.tracks) {
      if (!shouldPlayTrack(track.id, state)) {
        continue
      }

      for (const note of track.notes) {
        const noteStartSeconds = leadInSeconds + tickToSeconds(note.startTick, tempoMap)
        const noteEndSeconds = leadInSeconds + tickToSeconds(Math.max(note.endTick, note.sustainEndTick ?? note.endTick), tempoMap)
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
