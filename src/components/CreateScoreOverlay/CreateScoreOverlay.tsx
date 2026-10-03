import React, { useMemo } from 'react'
import { Eye, Minus, Plus } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { useAppStore } from '../../store/store'
import { buildScoreDocument } from '../../transcription/scoreModel'
import type { CapturedNote, TranscriptionMeter } from '../../transcription/types'
import { ScoreSheet } from '../TranscriptorMode/ScoreSheet'
import styles from './CreateScoreOverlay.module.css'

const VISIBLE_MEASURES = 4
const SCORE_SIZES = ['compact', 'standard', 'large'] as const

export function CreateScoreOverlay() {
  const project = useAppStore((state) => state.projectData)
  const currentTick = useAppStore((state) => state.currentTick)
  const scoreOverlayOpacity = useAppStore((state) => state.scoreOverlayOpacity)
  const scoreOverlaySize = useAppStore((state) => state.scoreOverlaySize)
  const setScoreOverlayOpacity = useAppStore((state) => state.setScoreOverlayOpacity)
  const setScoreOverlaySize = useAppStore((state) => state.setScoreOverlaySize)
  const score = useMemo(() => {
    if (project == null) return null
    const bpm = project.tempoMap[0]?.bpm ?? 120
    const millisecondsPerTick = 60_000 / (bpm * project.ticksPerQuarter)
    const notes: CapturedNote[] = project.tracks.flatMap((track) => track.notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      velocity: note.velocity,
      channel: track.channel,
      startMs: note.startTick * millisecondsPerTick,
      endMs: note.endTick * millisecondsPerTick,
      sourceId: track.id,
    })))
    return buildScoreDocument(notes, {
      bpm,
      meter: supportedMeter(project.timeSignatures[0]?.numerator, project.timeSignatures[0]?.denominator),
      quantization: 'sixteenth',
      chordNamesEnabled: false,
      keyLabelsEnabled: false,
      midiDeviceId: null,
    })
  }, [project])
  if (score == null) return null
  const activeMeasure = Math.max(0, Math.min(score.measures.length - 1, Math.floor(currentTick / score.ticksPerMeasure)))
  const pageStart = Math.floor(activeMeasure / VISIBLE_MEASURES) * VISIBLE_MEASURES
  const visibleScore = { ...score, measures: score.measures.slice(pageStart, pageStart + VISIBLE_MEASURES) }
  const selectedIds = project?.tracks.flatMap((track) => track.notes
    .filter((note) => note.startTick <= currentTick && note.endTick > currentTick)
    .map((note) => note.id)) ?? []
  const sizeIndex = SCORE_SIZES.indexOf(scoreOverlaySize)

  return (
    <section
      className={`${styles.panel} ${styles[scoreOverlaySize]}`}
      aria-label="Synchronized sheet music"
      data-size={scoreOverlaySize}
      style={{ opacity: scoreOverlayOpacity / 100 }}
    >
      <div className={styles.displayControls}>
        <button
          type="button"
          aria-label="Make sheet music smaller"
          disabled={sizeIndex === 0}
          onClick={() => setScoreOverlaySize(SCORE_SIZES[Math.max(0, sizeIndex - 1)])}
        >
          <AppIcon icon={Minus} size={14} />
        </button>
        <button
          type="button"
          aria-label="Make sheet music larger"
          disabled={sizeIndex === SCORE_SIZES.length - 1}
          onClick={() => setScoreOverlaySize(SCORE_SIZES[Math.min(SCORE_SIZES.length - 1, sizeIndex + 1)])}
        >
          <AppIcon icon={Plus} size={14} />
        </button>
        <label title="Sheet opacity">
          <AppIcon icon={Eye} size={14} />
          <input
            aria-label="Sheet music opacity"
            type="range"
            min="50"
            max="100"
            step="5"
            value={scoreOverlayOpacity}
            onChange={(event) => setScoreOverlayOpacity(Number(event.target.value))}
          />
        </label>
      </div>
      <div className={styles.measureIndicator}>Measure {activeMeasure + 1}</div>
      <ScoreSheet score={visibleScore} showChordNames={false} selectedIds={selectedIds} />
    </section>
  )
}

function supportedMeter(numerator = 4, denominator = 4): TranscriptionMeter {
  const meter = `${numerator}/${denominator}`
  return meter === '3/4' || meter === '6/8' ? meter : '4/4'
}
