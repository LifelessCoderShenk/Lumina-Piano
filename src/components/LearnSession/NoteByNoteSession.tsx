import React, { useEffect, useRef, useState } from 'react'

import { audioScheduler } from '../../audio/AudioScheduler'
import midiDeviceManager from '../../learn/MidiDeviceManager'
import { assignFingerNumbers } from '../../learn/fingeringSystem'
import { loadMidiFileFromPath } from '../../midi/loadMidiProject'
import type { Note, ProjectData } from '../../midi/types'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { renderer } from '../../renderer/Renderer'
import { useAppStore } from '../../store/store'
import { tickToSeconds } from '../../tempo/tempoMap'
import styles from './NoteByNoteSession.module.css'

const MIDDLE_C_PITCH = 60

type OrderedChord = {
  notes: Note[]
  noteIds: string[]
  pitches: number[]
  startTick: number
}

type NoteHoldState = {
  completed: boolean
  durationMs: number
  heldSince: number | null
}

export function NoteByNoteSession() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const hand = useAppStore((state) => state.learnV3.sessionConfig.hand)
  const projectData = useAppStore((state) => state.projectData)
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const currentChordIndex = useAppStore((state) => state.learnV3.currentChordIndex)
  const stats = useAppStore((state) => state.learnV3.stats)
  const advanceChord = useAppStore((state) => state.advanceChord)
  const endSession = useAppStore((state) => state.endSession)
  const exitSession = useAppStore((state) => state.exitSession)
  const recordCorrect = useAppStore((state) => state.recordCorrect)
  const recordWrong = useAppStore((state) => state.recordWrong)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setFingerNumbers = useAppStore((state) => state.setFingerNumbers)
  const setLearnActive = useAppStore((state) => state.setLearnActive)
  const [audioPreviewEnabled, setAudioPreviewEnabled] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [totalChords, setTotalChords] = useState(0)
  const noteStateRef = useRef<Map<number, NoteHoldState>>(new Map())
  const chordListRef = useRef<OrderedChord[]>([])
  const durationMapRef = useRef<Map<string, number>>(new Map())
  const chordListInitializedRef = useRef(false)
  const currentChordIndexRef = useRef(0)
  const advanceTimeoutRef = useRef<number | null>(null)
  const heldCheckIntervalRef = useRef<number | null>(null)
  const displayedChordCount = totalChords === 0 ? 0 : Math.min(currentChordIndex + 1, totalChords)
  const attemptedChordCount = stats.correct + stats.wrong
  const accuracy = Math.round((stats.correct / attemptedChordCount) * 100) || 0

  const getCurrentChord = (): OrderedChord | null => {
    return chordListRef.current[currentChordIndexRef.current] ?? null
  }

  const playChordAudio = (chord: OrderedChord | null): void => {
    if (chord == null || !audioPreviewEnabled) {
      return
    }

    audioScheduler.playNotes(
      chord.notes.map((note) => ({
        durationMs: durationMapRef.current.get(note.id) ?? 100,
        pitch: note.pitch,
      })),
    )
  }

  const initializeNoteStateForChord = (chord: OrderedChord | null): void => {
    noteStateRef.current.clear()

    if (chord == null) {
      return
    }

    for (const note of chord.notes) {
      noteStateRef.current.set(note.pitch, {
        completed: false,
        durationMs: durationMapRef.current.get(note.id) ?? 100,
        heldSince: null,
      })
    }
  }

  const resetCurrentChordAttempt = (chord: OrderedChord | null, replayAudio: boolean): void => {
    stopHeldCheckLoop(heldCheckIntervalRef)

    if (chord != null) {
      for (const pitch of chord.pitches) {
        renderer.cancelNoteDrain(pitch)
      }
    }

    initializeNoteStateForChord(chord)

    if (replayAudio) {
      playChordAudio(chord)
    }
  }

  useEffect(() => {
    currentChordIndexRef.current = currentChordIndex
    const currentChord = getCurrentChord()
    initializeNoteStateForChord(currentChord)
    console.log(
      '[NoteByNote] advanced to chord index:',
      currentChordIndex,
      'pitches:',
      currentChord?.pitches ?? [],
    )
    playChordAudio(currentChord)
  }, [currentChordIndex, totalChords])

  useEffect(() => {
    playbackEngine.pause()
    playbackEngine.seek(0)
  }, [])

  useEffect(() => {
    let disposed = false

    const initialize = async () => {
      setLearnActive(true)
      setErrorMessage(null)

      try {
        if (useAppStore.getState().projectData != null) {
          return
        }

        const electronApi = window.electronAPI
        if (electronApi == null || typeof electronApi.getSongs !== 'function') {
          throw new Error('Song library is unavailable.')
        }

        const songs = await electronApi.getSongs()
        if (disposed) {
          return
        }

        const song = songs.find((entry) => entry.id === selectedSongId) ?? null
        const filePath = song?.filePath ?? song?.file
        if (filePath == null || filePath.length === 0) {
          throw new Error('Selected song file could not be found.')
        }

        await loadMidiFileFromPath(filePath)
      } catch (error) {
        console.error('Failed to initialize note by note session:', error)
        if (!disposed) {
          setErrorMessage('Failed to start note by note session.')
        }
      }
    }

    void initialize()

    return () => {
      disposed = true
      if (advanceTimeoutRef.current != null) {
        window.clearTimeout(advanceTimeoutRef.current)
        advanceTimeoutRef.current = null
      }
      stopHeldCheckLoop(heldCheckIntervalRef)
      midiDeviceManager.onNoteOn = null
      midiDeviceManager.onNoteOff = null
      noteStateRef.current.clear()
      setLearnActive(false)
    }
  }, [selectedSongId, setLearnActive])

  useEffect(() => {
    if (projectData == null) {
      return
    }

    setFingerNumbers(assignFingerNumbers(flattenProjectNotes(projectData), hand))
  }, [hand, projectData, setFingerNumbers])

  useEffect(() => {
    if (projectData == null || precomputedTempoMap == null || chordListInitializedRef.current) {
      return
    }

    const chordList = buildOrderedChordList(projectData, hand)
    chordListRef.current = chordList
    chordListInitializedRef.current = true
    durationMapRef.current = buildDurationMap(chordList, precomputedTempoMap)
    initializeNoteStateForChord(chordList[currentChordIndexRef.current] ?? null)
    setTotalChords(chordList.length)
    console.log('[NoteByNote] total chords:', chordList.length)
  }, [hand, precomputedTempoMap, projectData])

  useEffect(() => {
    const completeChordIfReady = () => {
      if (advanceTimeoutRef.current != null) {
        return
      }

      const currentChord = getCurrentChord()
      if (currentChord == null) {
        stopHeldCheckLoop(heldCheckIntervalRef)
        return
      }

      const now = performance.now()

      for (const [, noteState] of noteStateRef.current) {
        if (noteState.heldSince != null && !noteState.completed) {
          const heldMs = now - noteState.heldSince
          if (heldMs >= noteState.durationMs) {
            noteState.completed = true
          }
        }
      }

      const allNotesComplete =
        noteStateRef.current.size > 0 &&
        [...noteStateRef.current.values()].every((noteState) => noteState.completed)
      if (!allNotesComplete) {
        return
      }

      stopHeldCheckLoop(heldCheckIntervalRef)
      recordCorrect()
      renderer.triggerChordCorrect(currentChord.noteIds)

      advanceTimeoutRef.current = window.setTimeout(() => {
        advanceTimeoutRef.current = null

        if (currentChordIndexRef.current >= chordListRef.current.length - 1) {
          endSession()
          setAppMode('learnEnd')
          return
        }

        advanceChord()
      }, 150)
    }

    const handleNoteOn = (pitch: number) => {
      if (advanceTimeoutRef.current != null) {
        return
      }

      const currentChord = getCurrentChord()
      if (currentChord == null) {
        return
      }

      const noteState = noteStateRef.current.get(pitch)
      if (noteState == null) {
        recordWrong()
        renderer.triggerKeyFlash(pitch, 0xff3333)
        resetCurrentChordAttempt(currentChord, true)
        return
      }

      if (noteState.completed || noteState.heldSince != null) {
        return
      }

      const heldSince = performance.now()
      noteState.heldSince = heldSince
      renderer.startNoteDrain(pitch, noteState.durationMs, heldSince)

      startHeldCheckLoop(heldCheckIntervalRef, completeChordIfReady)
    }

    const handleNoteOff = (pitch: number) => {
      const currentChord = getCurrentChord()
      const noteState = noteStateRef.current.get(pitch)

      if (advanceTimeoutRef.current != null) {
        return
      }

      if (currentChord == null || noteState == null || noteState.heldSince == null) {
        return
      }

      if (noteState.completed) {
        noteState.heldSince = null
        return
      }

      const elapsedMs = performance.now() - noteState.heldSince

      if (elapsedMs < noteState.durationMs) {
        recordWrong()
        renderer.triggerKeyFlash(pitch, 0xff3333)
        resetCurrentChordAttempt(currentChord, true)
        return
      }

      noteState.completed = true
      noteState.heldSince = null
      completeChordIfReady()
    }

    midiDeviceManager.onNoteOn = handleNoteOn
    midiDeviceManager.onNoteOff = handleNoteOff

    return () => {
      if (midiDeviceManager.onNoteOn === handleNoteOn) {
        midiDeviceManager.onNoteOn = null
      }
      if (midiDeviceManager.onNoteOff === handleNoteOff) {
        midiDeviceManager.onNoteOff = null
      }

      if (advanceTimeoutRef.current != null) {
        window.clearTimeout(advanceTimeoutRef.current)
        advanceTimeoutRef.current = null
      }

      stopHeldCheckLoop(heldCheckIntervalRef)
    }
  }, [advanceChord, endSession, recordCorrect, recordWrong, setAppMode])

  return (
    <section className={styles.overlay}>
      {errorMessage != null ? (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className={styles.sessionBar}>
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => {
              exitSession()
              setAppMode('learnSong')
            }}
            aria-label="Back to song page"
          >
            ←
          </button>

          <div className={styles.metric}>
            {`${displayedChordCount} / ${totalChords} CHORDS`}
          </div>

          <div className={styles.metric}>
            {`${accuracy}% ACCURATE`}
          </div>

          <button
            type="button"
            className={`${styles.controlButton} ${styles.audioToggle}`}
            onClick={() => {
              setAudioPreviewEnabled((current) => !current)
            }}
            aria-label={audioPreviewEnabled ? 'Disable audio preview' : 'Enable audio preview'}
            aria-pressed={audioPreviewEnabled}
          >
            {audioPreviewEnabled ? '♪ AUDIO ON' : '♪ AUDIO OFF'}
          </button>
        </div>
      </div>
    </section>
  )
}

function buildOrderedChordList(
  projectData: ProjectData | null,
  hand: 'left' | 'right' | 'both',
): OrderedChord[] {
  if (projectData == null) {
    return []
  }

  const notes = flattenProjectNotes(projectData).filter((note) => isNoteForHand(note, hand))
  if (notes.length === 0) {
    return []
  }

  notes.sort(compareNotes)
  const groups = new Map<number, Note[]>()

  for (const note of notes) {
    const existing = groups.get(note.startTick) ?? []
    existing.push(note)
    groups.set(note.startTick, existing)
  }

  return Array.from(groups.values())
    .sort((left, right) => left[0].startTick - right[0].startTick)
    .map((group) => createChord(group, group[0].startTick))
}

function createChord(notes: Note[], startTick: number): OrderedChord {
  const sortedNotes = notes.slice().sort(compareNotes)

  return {
    notes: sortedNotes,
    noteIds: sortedNotes.map((note) => note.id),
    pitches: [...new Set(sortedNotes.map((note) => note.pitch))],
    startTick,
  }
}

function flattenProjectNotes(projectData: ProjectData): Note[] {
  return projectData.tracks.flatMap((track) => track.notes)
}

function isNoteForHand(note: Note, hand: 'left' | 'right' | 'both'): boolean {
  if (hand === 'both') {
    return true
  }

  return hand === 'left' ? note.pitch < MIDDLE_C_PITCH : note.pitch >= MIDDLE_C_PITCH
}

function compareNotes(left: Note, right: Note): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick
  }

  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch
  }

  return left.id.localeCompare(right.id)
}

function buildDurationMap(
  chordList: OrderedChord[],
  tempoMap: NonNullable<ReturnType<typeof useAppStore.getState>['precomputedTempoMap']>,
): Map<string, number> {
  const durationMap = new Map<string, number>()

  for (const chord of chordList) {
    for (const note of chord.notes) {
      const durationMs = (tickToSeconds(note.endTick, tempoMap) - tickToSeconds(note.startTick, tempoMap)) * 1000
      durationMap.set(note.id, Math.max(durationMs, 100))
    }
  }

  return durationMap
}

function startHeldCheckLoop(
  intervalRef: React.MutableRefObject<number | null>,
  callback: () => void,
): void {
  if (intervalRef.current != null) {
    return
  }

  intervalRef.current = window.setInterval(callback, 16)
}

function stopHeldCheckLoop(intervalRef: React.MutableRefObject<number | null>): void {
  if (intervalRef.current == null) {
    return
  }

  window.clearInterval(intervalRef.current)
  intervalRef.current = null
}
