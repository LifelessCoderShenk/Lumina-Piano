import React, { useEffect, useMemo, useRef, useState } from 'react'

import midiDeviceManager from '../../learn/MidiDeviceManager'
import { assignFingerNumbers } from '../../learn/fingeringSystem'
import { loadMidiFileFromPath } from '../../midi/loadMidiProject'
import type { Note, ProjectData } from '../../midi/types'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { renderer } from '../../renderer/Renderer'
import { useAppStore, usePlaybackState } from '../../store/store'
import styles from './PlayAlongSession.module.css'

const MIDDLE_C_PITCH = 60

export function PlayAlongSession() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const sessionConfig = useAppStore((state) => state.learnV3.sessionConfig)
  const stats = useAppStore((state) => state.learnV3.stats)
  const projectData = useAppStore((state) => state.projectData)
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
  const playedNoteIdsRef = useRef<Set<string>>(new Set())
  const expectedNotesRef = useRef<Note[]>([])

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
    let disposed = false

    const handleEnded = () => {
      const remainingNotes = expectedNotesRef.current.filter((note) => !playedNoteIdsRef.current.has(note.id))
      for (const _note of remainingNotes) {
        recordMissed()
      }

      endSession()
      setAppMode('learnEnd')
    }

    const initialize = async () => {
      setLearnActive(true)
      playbackEngine.setTempoMultiplier(sessionConfig.tempoMultiplier)
      setErrorMessage(null)

      try {
        if (useAppStore.getState().projectData == null) {
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
          if (disposed) {
            return
          }
        }

        playbackEngine.play()
      } catch (error) {
        console.error('Failed to start play along session:', error)
        if (!disposed) {
          setErrorMessage('Failed to start play along session.')
        }
      }
    }

    playbackEngine.on('onEnded', handleEnded)
    void initialize()

    return () => {
      disposed = true
      midiDeviceManager.onNoteOn = null
      playbackEngine.off('onEnded', handleEnded)
      setLearnActive(false)
      playbackEngine.setTempoMultiplier(1.0)
      playbackEngine.pause()
    }
  }, [
    endSession,
    recordMissed,
    selectedSongId,
    sessionConfig.tempoMultiplier,
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
