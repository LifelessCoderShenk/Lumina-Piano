import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as Tone from 'tone'

import { audioScheduler } from '../../audio/AudioScheduler'
import midiDeviceManager from '../../learn/MidiDeviceManager'
import { assignFingerNumbers } from '../../learn/fingeringSystem'
import type { SongMetadata } from '../../learn/types'
import { loadMidiFileFromPath } from '../../midi/loadMidiProject'
import type { Note, ProjectData } from '../../midi/types'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { renderer } from '../../renderer/Renderer'
import { spatialIndex } from '../../spatial/SpatialIndex'
import { useAppStore, usePlaybackState } from '../../store/store'
import type { PrecomputedTempoMap } from '../../tempo/tempoMap'
import { tickToSeconds } from '../../tempo/tempoMap'
import styles from './PlayAlongSession.module.css'

const MIDDLE_C_PITCH = 60
const TITLE_CARD_DURATION_MS = 1_600
const COUNTDOWN_STEP_DURATION_MS = 550
const GO_STEP_DURATION_MS = 400
const COUNTDOWN_VALUES = [3, 2, 1, 'GO'] as const
const MISSED_NOTE_TOLERANCE_BEATS = 0.5

interface ExpectedNoteWindow {
  noteIds: string[]
  notes: Note[]
  pitches: number[]
  resolved: boolean
  windowEndSeconds: number
  windowStartSeconds: number
}

export function PlayAlongSession() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const sessionConfig = useAppStore((state) => state.learnV3.sessionConfig)
  const stats = useAppStore((state) => state.learnV3.stats)
  const projectData = useAppStore((state) => state.projectData)
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const setFingerNumbers = useAppStore((state) => state.setFingerNumbers)
  const setLearnActive = useAppStore((state) => state.setLearnActive)
  const recordCorrect = useAppStore((state) => state.recordCorrect)
  const recordWrong = useAppStore((state) => state.recordWrong)
  const recordMissed = useAppStore((state) => state.recordMissed)
  const endSession = useAppStore((state) => state.endSession)
  const exitSession = useAppStore((state) => state.exitSession)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const { currentTick, isPlaying } = usePlaybackState()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [countdownValue, setCountdownValue] = useState<(typeof COUNTDOWN_VALUES)[number] | null>(null)
  const [introVisible, setIntroVisible] = useState(true)
  const [songMetadata, setSongMetadata] = useState<SongMetadata | null>(null)
  const playedNoteIdsRef = useRef<Set<string>>(new Set())
  const noteStatusRef = useRef<Map<string, 'correct' | 'missed'>>(new Map())
  const expectedNotesRef = useRef<Note[]>([])
  const expectedWindowsRef = useRef<ExpectedNoteWindow[]>([])
  const noteWindowLookupRef = useRef<Map<string, ExpectedNoteWindow>>(new Map())
  const introTimeoutsRef = useRef<number[]>([])

  const accuracy = Math.round(
    (stats.correct / (stats.correct + stats.wrong + stats.missed)) * 100,
  ) || 0
  const tempoDisplay = formatTempoDisplay(sessionConfig.tempoMultiplier)
  const totalTicks = projectData?.totalTicks ?? 0

  const filteredNotes = useMemo(
    () => filterNotesByHand(flattenProjectNotes(projectData), sessionConfig.hand),
    [projectData, sessionConfig.hand],
  )

  useEffect(() => {
    expectedNotesRef.current = filteredNotes
  }, [filteredNotes])

  useEffect(() => {
    expectedWindowsRef.current = buildExpectedNoteWindows(
      filteredNotes,
      precomputedTempoMap,
      projectData?.ticksPerQuarter ?? 0,
      sessionConfig.tempoMultiplier,
    )
    noteWindowLookupRef.current = new Map(
      expectedWindowsRef.current.flatMap((window) =>
        window.noteIds.map((noteId) => [noteId, window] as const),
      ),
    )
  }, [
    filteredNotes,
    precomputedTempoMap,
    projectData?.ticksPerQuarter,
    sessionConfig.tempoMultiplier,
  ])

  useEffect(() => {
    let disposed = false

    const handleEnded = () => {
      resolveMissedWindows({
        currentTick: Number.POSITIVE_INFINITY,
        forceAll: true,
        noteStatusRef,
        precomputedTempoMap: useAppStore.getState().precomputedTempoMap,
        projectTicksPerQuarter: useAppStore.getState().projectData?.ticksPerQuarter ?? 0,
        recordMissed,
        tempoMultiplier: sessionConfig.tempoMultiplier,
        windows: expectedWindowsRef.current,
      })

      endSession()
      setAppMode('learnEnd')
    }

    const initialize = async () => {
      setLearnActive(true)
      setErrorMessage(null)
      setIntroVisible(true)
      setCountdownValue(null)
      playedNoteIdsRef.current.clear()
      noteStatusRef.current.clear()

      try {
        const electronApi = window.electronAPI
        if (electronApi == null || typeof electronApi.getSongs !== 'function') {
          throw new Error('Song library is unavailable.')
        }

        const songs = await electronApi.getSongs()
        if (disposed) {
          return
        }

        const song = songs.find((entry) => entry.id === selectedSongId) ?? null
        setSongMetadata(song)

        const filePath = song?.filePath ?? song?.file
        if (filePath == null || filePath.length === 0) {
          throw new Error('Selected song file could not be found.')
        }

        await loadMidiFileFromPath(filePath)
        if (disposed) {
          return
        }

        await hardResetSessionStart({
          isDisposed: () => disposed,
          projectData: useAppStore.getState().projectData,
          tempoMultiplier: sessionConfig.tempoMultiplier,
        })
        if (disposed) {
          return
        }

        await runIntroSequence({
          introTimeoutsRef,
          isDisposed: () => disposed,
          setCountdownValue,
          setIntroVisible,
          warmUpAudio: () => audioScheduler.warmUpAudio(),
        })
        if (disposed) {
          return
        }

        await playbackEngine.setTempoMultiplier(sessionConfig.tempoMultiplier)
        if (disposed) {
          return
        }

        playbackEngine.play()
      } catch (error) {
        console.error('Failed to start play along session:', error)
        if (!disposed) {
          setIntroVisible(false)
          setErrorMessage('Failed to start play along session.')
        }
      }
    }

    playbackEngine.on('onEnded', handleEnded)
    void initialize()

    return () => {
      disposed = true
      clearIntroTimeouts(introTimeoutsRef)
      midiDeviceManager.onNoteOn = null
      playbackEngine.off('onEnded', handleEnded)
      setLearnActive(false)
      playbackEngine.setTempoMultiplier(1.0)
      playbackEngine.pause()
    }
  }, [
    endSession,
    sessionConfig.tempoMultiplier,
    recordMissed,
    selectedSongId,
    setAppMode,
    setLearnActive,
  ])

  useEffect(() => {
    if (projectData == null) {
      return
    }

    setFingerNumbers(assignFingerNumbers(flattenProjectNotes(projectData), sessionConfig.hand))
  }, [projectData, sessionConfig.hand, setFingerNumbers])

  useEffect(() => {
    if (!isPlaying || precomputedTempoMap == null) {
      return
    }

    resolveMissedWindows({
      currentTick,
      forceAll: false,
      noteStatusRef,
      precomputedTempoMap,
      projectTicksPerQuarter: projectData?.ticksPerQuarter ?? 0,
      recordMissed,
      tempoMultiplier: sessionConfig.tempoMultiplier,
      windows: expectedWindowsRef.current,
    })
  }, [
    currentTick,
    isPlaying,
    precomputedTempoMap,
    projectData?.ticksPerQuarter,
    recordMissed,
    sessionConfig.tempoMultiplier,
  ])

  useEffect(() => {
    const handleNoteOn = (pitch: number) => {
      const state = useAppStore.getState()
      const beatTolerance = state.projectData?.ticksPerQuarter ?? 0
      const matchingNote = expectedNotesRef.current
        .filter((note) => !playedNoteIdsRef.current.has(note.id))
        .filter((note) => Math.abs(note.startTick - state.currentTick) <= beatTolerance)
        .filter((note) => note.pitch === pitch)
        .sort((left, right) => Math.abs(left.startTick - state.currentTick) - Math.abs(right.startTick - state.currentTick))[0]

      if (matchingNote != null) {
        playedNoteIdsRef.current.add(matchingNote.id)
        noteStatusRef.current.set(matchingNote.id, 'correct')
        markWindowResolvedIfComplete(noteWindowLookupRef.current.get(matchingNote.id), noteStatusRef.current)
        recordCorrect()
        renderer.triggerKeyFlash(pitch, 0x00ff00)
        return
      }

      recordWrong()
      renderer.triggerKeyFlash(pitch, 0xff3333)
    }

    midiDeviceManager.onNoteOn = handleNoteOn

    return () => {
      if (midiDeviceManager.onNoteOn === handleNoteOn) {
        midiDeviceManager.onNoteOn = null
      }
    }
  }, [recordCorrect, recordWrong])

  return (
    <section className={styles.overlay}>
      {introVisible && errorMessage == null ? (
        <div className={styles.introOverlay} aria-live="polite">
          {countdownValue == null ? (
            <div className={styles.scoreCard}>
              <div className={styles.scoreCardTitle}>
                {songMetadata?.title ?? 'Selected Piece'}
              </div>
              <div className={styles.scoreCardDifficulty}>
                {formatDifficultyLabel(songMetadata?.difficulty)}
              </div>
            </div>
          ) : (
            <div key={countdownValue} className={styles.countdown}>
              {countdownValue}
            </div>
          )}
        </div>
  ) : null}

      {errorMessage != null ? (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className={styles.sessionBar}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => {
            if (isPlaying) {
              playbackEngine.pause()
              return
            }

            playbackEngine.play()
          }}
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <input
          type="range"
          min="0"
          max={Math.max(totalTicks, 0)}
          step="1"
          value={Math.min(currentTick, totalTicks)}
          onChange={(event) => {
            playbackEngine.seek(Number(event.target.value))
          }}
          className={styles.scrubber}
          aria-label="Session position"
          disabled={totalTicks <= 0}
        />

        <div className={styles.metric} aria-label="Tempo multiplier">
          {tempoDisplay}
        </div>

        <div className={styles.metric}>
          {`${accuracy}% ACCURATE`}
        </div>

        <button
          type="button"
          className={styles.controlButton}
          onClick={() => {
            playbackEngine.pause()
            exitSession()
            setAppMode('learnSong')
          }}
          aria-label="Back to song page"
        >
          Back
        </button>
      </div>
    </section>
  )
}

function flattenProjectNotes(projectData: ProjectData | null): Note[] {
  if (projectData == null) {
    return []
  }

  return projectData.tracks.flatMap((track) => track.notes)
}

function filterNotesByHand(notes: Note[], hand: 'left' | 'right' | 'both'): Note[] {
  if (hand === 'both') {
    return notes
  }

  return notes.filter((note) => hand === 'left' ? note.pitch < MIDDLE_C_PITCH : note.pitch >= MIDDLE_C_PITCH)
}

function formatTempoDisplay(tempoMultiplier: number): string {
  const fixed = tempoMultiplier.toFixed(2)
  if (fixed.endsWith('00')) {
    return `${tempoMultiplier.toFixed(1)}x`
  }

  if (fixed.endsWith('0')) {
    return `${fixed.slice(0, -1)}x`
  }

  return `${fixed}x`
}

function formatDifficultyLabel(difficulty: SongMetadata['difficulty'] | null | undefined): string {
  switch (difficulty) {
    case 'beginner':
      return 'BEGINNER'
    case 'advanced':
      return 'ADVANCED'
    case 'intermediate':
    default:
      return 'INTERMEDIATE'
  }
}

function buildExpectedNoteWindows(
  notes: Note[],
  precomputedTempoMap: PrecomputedTempoMap | null,
  ticksPerQuarter: number,
  tempoMultiplier: number,
): ExpectedNoteWindow[] {
  if (precomputedTempoMap == null || ticksPerQuarter <= 0 || notes.length === 0) {
    return []
  }

  const groupedNotes = new Map<number, Note[]>()
  for (const note of notes) {
    const existingGroup = groupedNotes.get(note.startTick) ?? []
    existingGroup.push(note)
    groupedNotes.set(note.startTick, existingGroup)
  }

  const toleranceSeconds = getToleranceSeconds(precomputedTempoMap, ticksPerQuarter, tempoMultiplier)

  return [...groupedNotes.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, groupedWindowNotes]) => {
      const windowStartSeconds = tickToPlaybackSeconds(
        groupedWindowNotes[0].startTick,
        precomputedTempoMap,
        tempoMultiplier,
      )

      return {
        noteIds: groupedWindowNotes.map((note) => note.id),
        notes: groupedWindowNotes,
        pitches: groupedWindowNotes.map((note) => note.pitch),
        resolved: false,
        windowEndSeconds: windowStartSeconds + toleranceSeconds,
        windowStartSeconds,
      }
    })
}

function resolveMissedWindows({
  currentTick,
  forceAll,
  noteStatusRef,
  precomputedTempoMap,
  projectTicksPerQuarter,
  recordMissed,
  tempoMultiplier,
  windows,
}: {
  currentTick: number
  forceAll: boolean
  noteStatusRef: React.MutableRefObject<Map<string, 'correct' | 'missed'>>
  precomputedTempoMap: PrecomputedTempoMap | null
  projectTicksPerQuarter: number
  recordMissed: () => void
  tempoMultiplier: number
  windows: ExpectedNoteWindow[]
}): void {
  if (precomputedTempoMap == null || projectTicksPerQuarter <= 0 || windows.length === 0) {
    return
  }

  const nowSeconds = forceAll
    ? Number.POSITIVE_INFINITY
    : tickToPlaybackSeconds(currentTick, precomputedTempoMap, tempoMultiplier)

  for (const window of windows) {
    if (window.resolved) {
      continue
    }

    if (!forceAll && nowSeconds <= window.windowEndSeconds) {
      continue
    }

    const unresolvedNoteIds = window.noteIds.filter((noteId) => !noteStatusRef.current.has(noteId))
    if (unresolvedNoteIds.length > 0) {
      for (const noteId of unresolvedNoteIds) {
        noteStatusRef.current.set(noteId, 'missed')
        recordMissed()
      }
    }

    window.resolved = true
  }
}

function markWindowResolvedIfComplete(
  window: ExpectedNoteWindow | undefined,
  noteStatus: Map<string, 'correct' | 'missed'>,
): void {
  if (window == null || window.resolved) {
    return
  }

  if (window.noteIds.every((noteId) => noteStatus.get(noteId) === 'correct')) {
    window.resolved = true
  }
}

function tickToPlaybackSeconds(
  tick: number,
  precomputedTempoMap: PrecomputedTempoMap,
  tempoMultiplier: number,
): number {
  return tickToSeconds(tick, precomputedTempoMap) / Math.max(tempoMultiplier, Number.EPSILON)
}

function getToleranceSeconds(
  precomputedTempoMap: PrecomputedTempoMap,
  ticksPerQuarter: number,
  tempoMultiplier: number,
): number {
  const halfBeatTicks = ticksPerQuarter * MISSED_NOTE_TOLERANCE_BEATS
  return (
    (tickToSeconds(halfBeatTicks, precomputedTempoMap) - tickToSeconds(0, precomputedTempoMap)) /
    Math.max(tempoMultiplier, Number.EPSILON)
  )
}

async function runIntroSequence({
  introTimeoutsRef,
  isDisposed,
  setCountdownValue,
  setIntroVisible,
  warmUpAudio,
}: {
  introTimeoutsRef: React.MutableRefObject<number[]>
  isDisposed: () => boolean
  setCountdownValue: React.Dispatch<React.SetStateAction<(typeof COUNTDOWN_VALUES)[number] | null>>
  setIntroVisible: React.Dispatch<React.SetStateAction<boolean>>
  warmUpAudio: () => Promise<void>
}): Promise<void> {
  if (isDisposed()) {
    return
  }

  await waitForIntroStep(introTimeoutsRef, TITLE_CARD_DURATION_MS)

  let warmUpPromise: Promise<void> | null = null
  for (const value of COUNTDOWN_VALUES) {
    if (isDisposed()) {
      return
    }

    if (value === 3 && warmUpPromise == null) {
      warmUpPromise = warmUpAudio()
    }

    setCountdownValue(value)
    await waitForIntroStep(
      introTimeoutsRef,
      value === 'GO' ? GO_STEP_DURATION_MS : COUNTDOWN_STEP_DURATION_MS,
    )
  }

  if (warmUpPromise != null) {
    await warmUpPromise
    if (isDisposed()) {
      return
    }
  }

  setCountdownValue(null)
  setIntroVisible(false)
}

async function hardResetSessionStart({
  isDisposed,
  projectData,
  tempoMultiplier,
}: {
  isDisposed: () => boolean
  projectData: ProjectData | null
  tempoMultiplier: number
}): Promise<void> {
  playbackEngine.pause()
  playbackEngine.seek(0)
  Tone.Transport.stop()
  Tone.Transport.cancel()
  await Tone.start()
  audioScheduler.reset()

  const store = useAppStore.getState()
  store.batchUpdate((state) => {
    state.currentTick = 0
    state.isPlaying = false
    state.learnV3.currentChordIndex = 0
    state.learnV3.stats = {
      bestStreak: 0,
      correct: 0,
      missed: 0,
      streak: 0,
      wrong: 0,
    }
  })

  if (projectData != null) {
    spatialIndex.build(projectData)
  }

  const rendererReady = await waitForRendererReady(isDisposed)
  if (rendererReady) {
    renderer.renderFrame(0)
  }

  await playbackEngine.setTempoMultiplier(tempoMultiplier)
}

function waitForIntroStep(
  introTimeoutsRef: React.MutableRefObject<number[]>,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      introTimeoutsRef.current = introTimeoutsRef.current.filter((id) => id !== timeoutId)
      resolve()
    }, durationMs)

    introTimeoutsRef.current.push(timeoutId)
  })
}

function clearIntroTimeouts(introTimeoutsRef: React.MutableRefObject<number[]>): void {
  for (const timeoutId of introTimeoutsRef.current) {
    window.clearTimeout(timeoutId)
  }

  introTimeoutsRef.current = []
}

async function waitForRendererReady(isDisposed: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (renderer.isReady()) {
      return true
    }

    if (isDisposed()) {
      return false
    }

    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve())
        return
      }

      window.setTimeout(resolve, 16)
    })
  }

  return renderer.isReady()
}
