import React, { useEffect, useMemo, useRef, useState } from 'react'

import midiDeviceManager from '../../learn/MidiDeviceManager'
import { assignFingerNumbers } from '../../learn/fingeringSystem'
import { loadMidiFileFromPath } from '../../midi/loadMidiProject'
import type { Note, ProjectData } from '../../midi/types'
import { renderer } from '../../renderer/Renderer'
import { useAppStore } from '../../store/store'
import styles from './NoteByNoteSession.module.css'

const MIDDLE_C_PITCH = 60

type OrderedChord = {
  noteIds: string[]
  pitches: number[]
  startTick: number
}

export function NoteByNoteSession() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const hand = useAppStore((state) => state.learnV3.sessionConfig.hand)
  const projectData = useAppStore((state) => state.projectData)
  const currentChordIndex = useAppStore((state) => state.learnV3.currentChordIndex)
  const stats = useAppStore((state) => state.learnV3.stats)
  const advanceChord = useAppStore((state) => state.advanceChord)
  const endSession = useAppStore((state) => state.endSession)
  const exitSession = useAppStore((state) => state.exitSession)
  const recordCorrect = useAppStore((state) => state.recordCorrect)
  const recordWrong = useAppStore((state) => state.recordWrong)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setCurrentChordIndex = useAppStore((state) => state.setCurrentChordIndex)
  const setFingerNumbers = useAppStore((state) => state.setFingerNumbers)
  const setLearnActive = useAppStore((state) => state.setLearnActive)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const heldPitchesRef = useRef<Set<number>>(new Set())
  const chordListRef = useRef<OrderedChord[]>([])
  const currentChordIndexRef = useRef(0)

  const orderedChords = useMemo(() => buildOrderedChordList(projectData, hand), [hand, projectData])
  const totalChords = orderedChords.length
  const displayedChordCount = totalChords === 0 ? 0 : Math.min(currentChordIndex + 1, totalChords)
  const attemptedChordCount = stats.correct + stats.wrong
  const accuracy = Math.round((stats.correct / attemptedChordCount) * 100) || 0

  useEffect(() => {
    chordListRef.current = orderedChords
  }, [orderedChords])

  useEffect(() => {
    currentChordIndexRef.current = currentChordIndex
    heldPitchesRef.current.clear()
  }, [currentChordIndex])

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
      midiDeviceManager.onNoteOn = null
      heldPitchesRef.current.clear()
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
    const handleNoteOn = (pitch: number) => {
      const currentChord = chordListRef.current[currentChordIndexRef.current]
      if (currentChord == null) {
        return
      }

      heldPitchesRef.current.add(pitch)

      if (!currentChord.pitches.includes(pitch)) {
        recordWrong()
        renderer.triggerKeyFlash(pitch, 0xff3333)
        return
      }

      const isChordComplete = currentChord.pitches.every((requiredPitch) => heldPitchesRef.current.has(requiredPitch))
      if (!isChordComplete) {
        return
      }

      recordCorrect()
      renderer.triggerChordCorrect(currentChord.noteIds)
      heldPitchesRef.current.clear()

      if (currentChordIndexRef.current >= chordListRef.current.length - 1) {
        endSession()
        setAppMode('learnEnd')
        return
      }

      advanceChord()
    }

    midiDeviceManager.onNoteOn = handleNoteOn

    return () => {
      if (midiDeviceManager.onNoteOn === handleNoteOn) {
        midiDeviceManager.onNoteOn = null
      }
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
        <button
          type="button"
          className={styles.backButton}
          onClick={() => {
            exitSession()
            setAppMode('learnSong')
          }}
          aria-label="Back to song page"
        >
          ←
        </button>

        <input
          type="range"
          min="0"
          max={Math.max(totalChords - 1, 0)}
          step="1"
          value={Math.min(currentChordIndex, Math.max(totalChords - 1, 0))}
          onChange={(event) => {
            setCurrentChordIndex(Number(event.target.value))
          }}
          className={styles.scrubber}
          aria-label="Chord position"
          disabled={totalChords <= 1}
        />

        <div className={styles.metric}>
          {`${accuracy}% ACCURATE`}
        </div>

        <div className={styles.metric}>
          {`${displayedChordCount} / ${totalChords} CHORDS`}
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

  const chords: OrderedChord[] = []
  let currentChord: Note[] = []
  let currentStartTick: number | null = null

  for (const note of notes) {
    if (currentStartTick !== null && note.startTick !== currentStartTick) {
      chords.push(createChord(currentChord, currentStartTick))
      currentChord = []
    }

    currentChord.push(note)
    currentStartTick = note.startTick
  }

  if (currentChord.length > 0 && currentStartTick !== null) {
    chords.push(createChord(currentChord, currentStartTick))
  }

  return chords
}

function createChord(notes: Note[], startTick: number): OrderedChord {
  const sortedNotes = notes.slice().sort(compareNotes)

  return {
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
