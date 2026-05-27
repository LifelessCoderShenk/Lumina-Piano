import React from 'react'
import { useSelection, useProjectData, useAppStore } from '../../store/store'
import { ticksToBars } from '../../tempo/tempoMap'
import { findNoteById } from '../../editor/noteEditorHelpers'
import { MoveNotesCommand } from '../../commands/MoveNotesCommand'
import { commandHistory } from '../../commands'
import styles from './Inspector.module.css'

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function midiPitchToName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1
  const name = NOTE_NAMES[pitch % 12]
  return `${name}${octave}`
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.propertyRow}>
      <span className={styles.propertyLabel}>{label}</span>
      <span className={styles.propertyValue}>{value}</span>
    </div>
  )
}

export function NoteProperties() {
  const { selectedNoteIds } = useSelection()
  const { projectData } = useProjectData()

  if (selectedNoteIds.size === 0 || !projectData) {
    return <div className={styles.empty}>Select a note to edit</div>
  }

  // Find first selected note for display
  const firstId = Array.from(selectedNoteIds)[0]
  const located = findNoteById(firstId, projectData)
  if (!located) return <div className={styles.empty}>Note not found</div>

  const { note } = located
  const pitchName = midiPitchToName(note.pitch)
  // Assuming default 4/4 time signature
  const timeSignature = { numerator: 4, denominator: 4 }
  const barBeat = ticksToBars(note.startTick, projectData.ticksPerQuarter, timeSignature)

  const handleVelocityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVelocity = parseInt(e.target.value, 10)
    // We update velocity by cloning the project data as a store action 
    // since MoveNotesCommand doesn't explicitly mention velocity. 
    // However, the prompt says "MoveNotesCommand or store action".
    // I will use store batchUpdate to clone the projectData directly for velocity.
    useAppStore.getState().batchUpdate((state) => {
      if (!state.projectData) return
      
      const newProjectData = {
        ...state.projectData,
        tracks: state.projectData.tracks.map(track => ({
          ...track,
          notes: track.notes.map(n => 
            selectedNoteIds.has(n.id) ? { ...n, velocity: newVelocity } : n
          )
        }))
      }
      state.projectData = newProjectData
    })
  }

  return (
    <div className={styles.properties}>
      <PropertyRow label="Pitch" value={pitchName} />
      <PropertyRow label="Start" value={`${barBeat}:1`} />
      <PropertyRow label="Duration" value={String(note.endTick - note.startTick)} />
      
      <div className={styles.velocityRow}>
        <div className={styles.velocityHeader}>
          <label>Velocity</label>
          <span className={styles.velocityValue}>{Math.round((note.velocity / 127) * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={127}
          value={note.velocity}
          onChange={handleVelocityChange}
          className={styles.velocitySlider}
        />
      </div>
    </div>
  )
}
