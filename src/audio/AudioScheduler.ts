import * as Tone from 'tone'

import type { Note, Track } from '../midi/types'
import { playbackEngine } from '../playback/PlaybackEngine'
import { type AppState, getAppState, subscribeToStore } from '../store/store'
import { secondsToTick, tickToSeconds } from '../tempo/tempoMap'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import { AudioSchedulerError } from './errors'

const SCHEDULER_INTERVAL_MS = 25
const LOOKAHEAD_MS = 150
const SCHEDULE_OVERLAP_MS = 50
const SEEK_THRESHOLD_TICKS = 480
const MIN_VOLUME_DB = -60
const MAX_VOLUME_DB = 0
const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

const SALAMANDER_SAMPLE_URLS = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
} as const

interface ScheduledNote {
  note: Note
  track: Track
}

export class AudioScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastScheduledTick = 0
  private readonly activeNotes = new Map<string, Tone.PolySynth | Tone.Sampler>()
  private sampler: Tone.Sampler | null = null
  private isInitialized = false
  private isMuted = false
  private volumeBeforeMute = 0
  private unsubscribeStore: (() => void) | null = null
  private lastKnownTick = 0

  isReady(): boolean {
    return this.isInitialized
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      throw new AudioSchedulerError('AudioScheduler has already been initialized.', 'AUDIO_CONTEXT_ERROR')
    }

    try {
      await Tone.start()
    } catch (error: unknown) {
      throw new AudioSchedulerError('Failed to start audio context.', 'AUDIO_CONTEXT_ERROR', error)
    }

    let loadFailed = false
    let loadError: unknown

    this.sampler = new Tone.Sampler({
      baseUrl: SALAMANDER_BASE_URL,
      onerror: (error: unknown) => {
        loadFailed = true
        loadError = error
      },
      onload: () => {
        if (!loadFailed) {
          this.isInitialized = true
        }
      },
      urls: SALAMANDER_SAMPLE_URLS,
    }).toDestination()

    try {
      await Tone.loaded()
    } catch (error: unknown) {
      throw new AudioSchedulerError('Failed to load piano samples.', 'SAMPLE_LOAD_FAILED', error)
    }

    if (loadFailed) {
      throw new AudioSchedulerError('Failed to load piano samples.', 'SAMPLE_LOAD_FAILED', loadError)
    }

    if (!this.isInitialized) {
      this.isInitialized = true
    }

    this.lastKnownTick = getAppState().currentTick
    this.unsubscribeStore = subscribeToStore((state, previousState) => {
      if (state.isPlaying !== previousState.isPlaying) {
        if (state.isPlaying) {
          void this.handlePlaybackStart()
        } else {
          this.stop()
        }
      }

      if (state.currentTick !== previousState.currentTick) {
        const tickDelta = Math.abs(state.currentTick - previousState.currentTick)
        const isSeeked = tickDelta > SEEK_THRESHOLD_TICKS
        if (isSeeked) {
          this.seek(state.currentTick)
        }
        this.lastKnownTick = state.currentTick
      }

      if (state.projectData !== previousState.projectData) {
        this.seek(state.currentTick)
        this.lastKnownTick = state.currentTick
      }
    })
  }

  destroy(): void {
    this.stop()
    this.unsubscribeStore?.()
    this.unsubscribeStore = null

    this.sampler?.dispose()
    this.sampler = null
    this.activeNotes.clear()
    this.isInitialized = false
    this.isMuted = false
    this.volumeBeforeMute = 0
    this.lastScheduledTick = 0
    this.lastKnownTick = 0
  }

  start(): void {
    this.assertInitialized()

    if (this.intervalId != null) {
      return
    }

    const state = getAppState()
    this.lastScheduledTick = state.currentTick
    this.lastKnownTick = state.currentTick

    this.intervalId = setInterval(() => {
      this.scheduleAhead()
    }, SCHEDULER_INTERVAL_MS)
  }

  private async handlePlaybackStart(): Promise<void> {
    if (Tone.context.state === 'suspended') {
      await Tone.start()
    }

    this.start()
  }

  stop(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.cancelScheduledEvents()
    this.lastScheduledTick = getAppState().currentTick
  }

  playNotes(notes: Array<{ durationMs: number; pitch: number }>): void {
    if (!this.isInitialized || this.sampler == null) {
      return
    }

    for (const note of notes) {
      const frequency = Tone.Frequency(note.pitch, 'midi').toFrequency()
      this.sampler.triggerAttackRelease(frequency, note.durationMs / 1000)
    }
  }

  async warmUpAudio(): Promise<void> {
    await Tone.start()
    await Tone.loaded()
    this.primeSampler()
  }

  async warmUp(): Promise<void> {
    await this.warmUpAudio()
  }

  primeSampler(): void {
    if (!this.isInitialized || this.sampler == null || !this.getSamplerLoadedState()) {
      return
    }

    const previousVolume = this.sampler.volume.value
    this.sampler.volume.value = Number.NEGATIVE_INFINITY
    this.sampler.triggerAttackRelease('C4', 0.01)

    globalThis.setTimeout(() => {
      if (this.sampler != null) {
        this.sampler.volume.value = previousVolume
      }
    }, 50)
  }

  reset(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.cancelScheduledEvents()
    this.lastScheduledTick = 0
    this.lastKnownTick = 0
  }

  seek(tick: number): void {
    this.assertValidTick(tick)
    const normalizedTick = normalizeTick(tick)

    try {
      this.cancelScheduledEvents()
      this.lastScheduledTick = normalizedTick
      this.lastKnownTick = normalizedTick

      if (playbackEngine.isPlaying() && this.intervalId != null) {
        this.scheduleAheadAfterSeek()
      }
    } catch (error) {
      console.warn('AudioScheduler seek failed. Attempting recovery.', error)
      this.recoverFromSeekFailure(normalizedTick)
    }
  }

  setVolume(db: number): void {
    this.assertInitialized()

    const clampedDb = clamp(db, MIN_VOLUME_DB, MAX_VOLUME_DB)
    if (!this.isMuted) {
      this.volumeBeforeMute = clampedDb
    }

    this.sampler!.volume.value = clampedDb
  }

  setMuted(muted: boolean): void {
    if (!this.isInitialized || this.sampler == null) {
      return
    }

    if (muted) {
      if (!this.isMuted) {
        this.volumeBeforeMute = this.sampler.volume.value
      }

      this.isMuted = true
      this.sampler.volume.value = Number.NEGATIVE_INFINITY
      return
    }

    this.isMuted = false
    this.sampler.volume.value = clamp(this.volumeBeforeMute, MIN_VOLUME_DB, MAX_VOLUME_DB)
  }

  mute(): void {
    this.assertInitialized()

    if (!this.isMuted) {
      this.volumeBeforeMute = this.sampler!.volume.value
    }

    this.isMuted = true
    this.sampler!.volume.value = MIN_VOLUME_DB
  }

  unmute(): void {
    this.assertInitialized()

    this.isMuted = false
    this.sampler!.volume.value = clamp(this.volumeBeforeMute, MIN_VOLUME_DB, MAX_VOLUME_DB)
  }

  private scheduleAhead(): void {
    const state = getAppState()
    if (!state.isPlaying || !this.isInitialized || this.sampler == null) {
      return
    }

    const currentTick = state.currentTick
    const tempoMap = state.precomputedTempoMap
    if (tempoMap == null || state.projectData == null) {
      return
    }

    const nowSeconds = Tone.now()
    const currentSeconds = tickToSeconds(currentTick, tempoMap)
    const scheduleFromTick = this.lastScheduledTick
    const scheduleToTick = secondsToTick(
      currentSeconds + (LOOKAHEAD_MS / 1000) + (SCHEDULE_OVERLAP_MS / 1000),
      tempoMap,
    )

    if (scheduleToTick <= scheduleFromTick) {
      return
    }

    const notes = this.getNotesInRange(scheduleFromTick, scheduleToTick, state)

    for (const { note, track } of notes) {
      if (!this.shouldPlayTrack(track.id, state)) {
        continue
      }

      this.scheduleNote(note, tempoMap, nowSeconds, currentSeconds)
    }

    this.lastScheduledTick = scheduleToTick
  }

  private scheduleNote(
    note: Note,
    tempoMap: PrecomputedTempoMap,
    nowSeconds: number,
    currentSeconds: number,
  ): void {
    if (this.sampler == null) {
      return
    }

    const noteStartSeconds = tickToSeconds(note.startTick, tempoMap)
    const noteEndSeconds = tickToSeconds(note.endTick, tempoMap)
    const duration = Math.max(0, noteEndSeconds - noteStartSeconds)
    const scheduleTime = nowSeconds + (noteStartSeconds - currentSeconds)

    if (scheduleTime < nowSeconds) {
      return
    }

    const pitch = Tone.Frequency(note.pitch, 'midi').toNote()
    this.sampler.triggerAttackRelease(
      pitch,
      duration,
      scheduleTime,
      note.velocity / 127,
    )
    this.activeNotes.set(note.id, this.sampler)
  }

  private getNotesInRange(fromTick: number, toTick: number, state: AppState): ScheduledNote[] {
    const projectData = state.projectData
    if (projectData == null || !Number.isFinite(fromTick) || !Number.isFinite(toTick) || toTick <= fromTick) {
      return []
    }

    const normalizedFromTick = normalizeTick(fromTick)
    const normalizedToTick = normalizeTick(toTick)
    const result: ScheduledNote[] = []

    for (const track of projectData.tracks) {
      for (const note of track.notes) {
        if (
          note.startTick >= normalizedFromTick &&
          note.startTick < normalizedToTick &&
          this.shouldScheduleNoteForLearnHand(note, state)
        ) {
          result.push({ note, track })
        }
      }
    }

    return result
  }

  private shouldPlayTrack(trackId: string, state: AppState): boolean {
    const anySoloed = Object.values(state.trackSoloed).some(Boolean)
    if (anySoloed) {
      return state.trackSoloed[trackId] === true
    }

    return state.trackMuted[trackId] !== true
  }

  private shouldScheduleNoteForLearnHand(note: Note, state: AppState): boolean {
    if (!state.learnV3.isActive || state.learnV3.sessionConfig.mode !== 'listen') {
      return true
    }

    return isNoteIncludedForHand(note.pitch, state.learnV3.sessionConfig.hand)
  }

  private cancelScheduledEvents(): void {
    try {
      Tone.Transport.cancel()
    } finally {
      this.sampler?.releaseAll()
      this.activeNotes.clear()
    }
  }

  private scheduleAheadAfterSeek(): void {
    const schedule = () => {
      if (playbackEngine.isPlaying() && this.intervalId != null) {
        this.scheduleAhead()
      }
    }

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        schedule()
      })
      return
    }

    globalThis.setTimeout(schedule, 0)
  }

  private recoverFromSeekFailure(tick: number): void {
    const normalizedTick = normalizeTick(tick)
    const state = getAppState()
    const transportWithRecovery = Tone.Transport as typeof Tone.Transport & {
      position?: number | string
      start?: (time?: number, offset?: number) => void
      stop?: (time?: number) => void
    }
    const positionSeconds = state.precomputedTempoMap == null
      ? 0
      : tickToSeconds(normalizedTick, state.precomputedTempoMap)

    try {
      this.stop()
      transportWithRecovery.stop?.()
      this.lastScheduledTick = normalizedTick
      this.lastKnownTick = normalizedTick
      transportWithRecovery.position = positionSeconds

      if (playbackEngine.isPlaying()) {
        transportWithRecovery.start?.(undefined, positionSeconds)
        this.start()
      }
    } catch (recoveryError) {
      console.warn('AudioScheduler seek recovery failed.', recoveryError)
    }
  }

  private getSamplerLoadedState(): boolean {
    if (this.sampler == null) {
      return false
    }

    const samplerWithLoaded = this.sampler as Tone.Sampler & { loaded?: boolean }
    return samplerWithLoaded.loaded ?? false
  }

  private assertInitialized(): void {
    if (!this.isInitialized || this.sampler == null) {
      throw new AudioSchedulerError('AudioScheduler has not been initialized.', 'NOT_INITIALIZED')
    }
  }

  private assertValidTick(tick: number): void {
    if (!Number.isFinite(tick)) {
      throw new AudioSchedulerError('Tick must be a finite number.', 'AUDIO_CONTEXT_ERROR', { tick })
    }
  }
}

function normalizeTick(tick: number): number {
  return Math.max(0, Math.floor(tick))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const audioScheduler = new AudioScheduler()

export { AudioSchedulerError }

function isNoteIncludedForHand(pitch: number, hand: AppState['learnV3']['sessionConfig']['hand']): boolean {
  if (hand === 'left') {
    return pitch < 60
  }

  if (hand === 'right') {
    return pitch >= 60
  }

  return true
}
