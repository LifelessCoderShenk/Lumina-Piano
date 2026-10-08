/*
INPUT: A renderer-independent ScoreDocument plus display options and available score-pane dimensions.
OUTPUT: A responsive SVG grand-staff engraving rendered with VexFlow.
PURPOSE: Presents the Transcriptor's clean white, live score without adding canvas/WebGL artifacts above the existing keyboard.
*/

import { useEffect, useRef, useState } from 'react'
import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice,
  VexFlow,
} from 'vexflow'

import type { ScoreDocument, ScoreEvent, ScoreMeasure, ScoreVoice, TranscriptionMeter } from '../../transcription/types'
import styles from './TranscriptorMode.module.css'
import { gridTicks, spellPitch } from '../../transcription/analysis'

const SYSTEM_MARGIN = 28
const MIN_MEASURE_WIDTH = 360
const SYSTEM_HEIGHT = 200

export function getMeasuresPerSystem(width: number): number {
  return Math.max(1, Math.floor(Math.max(1, width - (SYSTEM_MARGIN * 2)) / MIN_MEASURE_WIDTH))
}

interface ScoreSheetProps {
  readonly score: ScoreDocument
  readonly showChordNames: boolean
  readonly autoScroll?: boolean
  readonly selectedIds?: readonly string[]
  readonly onSelect?: (ids: readonly string[]) => void
}

export function ScoreSheet({ score, showChordNames, autoScroll = false, selectedIds = [], onSelect }: ScoreSheetProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (host == null) {
      return
    }
    const resize = () => setWidth(Math.floor(host.clientWidth))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (host == null || width < 160) {
      return
    }
    let canceled = false
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (canceled) return
      VexFlow.setFonts('Bravura', 'Academico')
      renderScore(host, autoScroll ? { ...score, measures: score.measures.slice(-8) } : score, width, showChordNames, { selectedIds })
      if (autoScroll && scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    })
    return () => { canceled = true }
  }, [score, showChordNames, width, autoScroll, selectedIds])

  useEffect(() => {
    if (autoScroll && scrollerRef.current != null) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [autoScroll, score])

  return (
    <div ref={scrollerRef} className={styles.scoreScroller} data-testid="transcriptor-score-scroller">
      <div ref={hostRef} className={styles.scoreSheet} data-testid="transcriptor-score-sheet" onClick={(event) => {
        const target = (event.target as Element).closest('[data-note-ids]')
        if (target) onSelect?.(JSON.parse(target.getAttribute('data-note-ids') ?? '[]'))
      }} onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        const target = (event.target as Element).closest('[data-note-ids]')
        if (target) { event.preventDefault(); onSelect?.(JSON.parse(target.getAttribute('data-note-ids') ?? '[]')) }
      }} />
    </div>
  )
}

export function renderScore(host: HTMLDivElement, score: ScoreDocument, width: number, showChordNames: boolean, layout: { measuresPerSystem?: number; systemHeight?: number; selectedIds?: readonly string[] } = {}): void {
  host.replaceChildren()
  const maxEvents = Math.max(1, ...score.measures.flatMap((measure) => [...measure.trebleVoices, ...measure.bassVoices].map((voice) => voice.events.reduce((count, event) => count + decomposeTicksForNotation(event.durationTicks).length, 0))))
  const systemHeight = layout.systemHeight ?? SYSTEM_HEIGHT
  const perSystem = layout.measuresPerSystem ?? Math.min( getMeasuresPerSystem(width), Math.max(1, Math.floor((width - SYSTEM_MARGIN * 2) / (100 + maxEvents * 24))))
  const systemCount = Math.max(1, Math.ceil(score.measures.length / perSystem))
  const renderer = new Renderer(host, Renderer.Backends.SVG)
  renderer.resize(width, Math.max(systemHeight + 22, (systemCount * systemHeight) + 60))
  const context = renderer.getContext()
  const numerator = Number(score.meter.split('/')[0])
  const denominator = Number(score.meter.split('/')[1])
  const openTies = new Map<string, StaveNote>()

  score.measures.forEach((measure, index) => {
    const systemIndex = Math.floor(index / perSystem)
    const inSystemIndex = index % perSystem
    if (inSystemIndex === 0 && index > 0) {
      for (const previous of openTies.values()) makeTie(previous, undefined, previous.getKeys().length).setContext(context).draw()
      openTies.clear()
    }
    const measuresThisSystem = Math.min(perSystem, score.measures.length - (systemIndex * perSystem))
    const availableWidth = width - (SYSTEM_MARGIN * 2)
    const measureWidth = availableWidth / measuresThisSystem
    const x = SYSTEM_MARGIN + (inSystemIndex * measureWidth)
    const topY = 60 + (systemIndex * systemHeight)
    const treble = new Stave(x, topY, measureWidth)
    const bass = new Stave(x, topY + 72, measureWidth)

    if (inSystemIndex === 0) {
      treble.addClef('treble').addTimeSignature(score.meter)
      bass.addClef('bass').addTimeSignature(score.meter)
      treble.addKeySignature(score.keySignature ?? 'C')
      bass.addKeySignature(score.keySignature ?? 'C')
    }
    treble.setContext(context).draw()
    bass.setContext(context).draw()
    if (inSystemIndex === 0) {
      new StaveConnector(treble, bass).setType(StaveConnector.type.BRACKET).setContext(context).draw()
      new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw()
    }
    new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_RIGHT).setContext(context).draw()

    drawGrandStaff(context, treble, bass, measure, numerator, denominator, openTies, score, layout.selectedIds ?? [])
    if (showChordNames && measure.chordLabels.length > 0) {
      context.save()
      context.setFont('Arial', 12, '')
      for (const label of measure.chordLabels) {
        const progress = (label.startTick - measure.startTick) / measure.durationTicks
        context.fillText(label.name, x + 8 + (Math.max(0, Math.min(1, progress)) * Math.max(0, measureWidth - 24)), topY - 10)
      }
      context.restore()
    }
  })
  for (const previous of openTies.values()) makeTie(previous, undefined, previous.getKeys().length).setContext(context).draw()
}

interface RenderedEvent {
  readonly event: ScoreEvent
  readonly firstNote: StaveNote | null
  readonly lastNote: StaveNote | null
  readonly notes: readonly StaveNote[]
}

interface RenderedVoice {
  readonly eventNotes: readonly RenderedEvent[]
  readonly internalTies: readonly StaveTie[]
  readonly voice: Voice
  readonly tuplets: readonly Tuplet[]
  readonly beams: readonly Beam[]
}

/**
 * VexFlow voices are sequential by design. The score model supplies one lane
 * per simultaneously sounding strand, allowing the formatter to align genuine
 * overlapping notes at their actual musical time rather than serialising them.
 */
function drawGrandStaff(
  context: ReturnType<Renderer['getContext']>,
  treble: Stave,
  bass: Stave,
  measure: ScoreMeasure,
  numerator: number,
  denominator: number,
  openTies: Map<string, StaveNote>,
  score: ScoreDocument,
  selectedIds: readonly string[],
): void {
  const trebleVoices = measure.trebleVoices.map((voice) => makeRenderedVoice(voice, 'treble', numerator, denominator, score, selectedIds))
  const bassVoices = measure.bassVoices.map((voice) => makeRenderedVoice(voice, 'bass', numerator, denominator, score, selectedIds))
  Accidental.applyAccidentals(trebleVoices.map((entry) => entry.voice), score.keySignature ?? 'C')
  Accidental.applyAccidentals(bassVoices.map((entry) => entry.voice), score.keySignature ?? 'C')
  const renderedVoices = [...trebleVoices, ...bassVoices]
  const startX = Math.max(treble.getNoteStartX(), bass.getNoteStartX())
  treble.setNoteStartX(startX)
  bass.setNoteStartX(startX)
  new Formatter()
    .joinVoices(trebleVoices.map((entry) => entry.voice))
    .joinVoices(bassVoices.map((entry) => entry.voice))
    .formatToStave(renderedVoices.map((entry) => entry.voice), treble)
  trebleVoices.forEach((entry) => entry.voice.draw(context, treble))
  bassVoices.forEach((entry) => entry.voice.draw(context, bass))
  renderedVoices.forEach((rendered) => rendered.internalTies.forEach((tie) => tie.setContext(context).draw()))
  renderedVoices.forEach((rendered) => {
    rendered.beams.forEach((beam) => beam.setContext(context).draw())
    rendered.tuplets.forEach((tuplet) => tuplet.setContext(context).draw())
    rendered.eventNotes.forEach(({ event, notes }) => {
      if (event.isRest) return
      for (const note of notes) {
        const element = note.getSVGElement()
        element?.setAttribute('data-note-ids', JSON.stringify(event.sourceIds))
        element?.setAttribute('pointer-events', 'all')
        element?.setAttribute('tabindex', '0')
        element?.setAttribute('role', 'button')
        element?.setAttribute('aria-label', `Select ${event.pitches.map((pitch) => spellPitch(pitch, score.keySignature)).join(', ')}`)
      }
    })
  })

  for (const rendered of renderedVoices) {
    for (const eventNotes of rendered.eventNotes) {
      const { event, firstNote, lastNote } = eventNotes
      if (event.isRest || firstNote == null || lastNote == null) {
        continue
      }
      if (event.tieFromPrevious) {
        const previous = openTies.get(event.id)
        makeTie(previous, firstNote, event.pitches.length).setContext(context).draw()
      }
      if (event.tieToNext) {
        openTies.set(event.id, lastNote)
      } else {
        openTies.delete(event.id)
      }
    }
  }
}

function makeRenderedVoice(scoreVoice: ScoreVoice, clef: string, numerator: number, denominator: number, score: ScoreDocument, selectedIds: readonly string[]): RenderedVoice {
  const tickables: StaveNote[] = []
  const eventNotes: RenderedEvent[] = []
  const internalTies: StaveTie[] = []
  const triplet = score.quantization?.endsWith('triplet') === true
  const groupTicks = gridTicks(score.quantization) * 3
  const groups = new Map<number, StaveNote[]>()
  for (const event of scoreVoice.events) {
    const notes: StaveNote[] = []
    let cursor = event.startTick
    let remaining = event.durationTicks
    while (remaining > 0) {
      const length = triplet ? cursor % groupTicks === 0 && remaining >= groupTicks
        ? Math.floor(remaining / groupTicks) * groupTicks
        : Math.min(remaining, groupTicks - cursor % groupTicks) : remaining
      const needsTuplet = triplet && length % groupTicks !== 0
      const pieces = decomposeTicksForNotation(length * (needsTuplet ? 1.5 : 1))
      const segment = pieces.map((piece) => makeStaveNote(event, clef, piece, score))
      if (needsTuplet) {
        const group = Math.floor(cursor / groupTicks)
        groups.set(group, [...(groups.get(group) ?? []), ...segment])
      }
      notes.push(...segment); cursor += length; remaining -= length
    }
    if (event.sourceIds.some((id) => selectedIds.includes(id))) notes.forEach((note) => note.setStyle({ fillStyle: '#2673c1', strokeStyle: '#2673c1' }))
    tickables.push(...notes)
    if (!event.isRest) {
      for (let index = 1; index < notes.length; index += 1) {
        internalTies.push(makeTie(notes[index - 1], notes[index], event.pitches.length))
      }
    }
    eventNotes.push({
      event,
      firstNote: notes[0] ?? null,
      lastNote: notes.at(-1) ?? null,
      notes,
    })
  }
  const voice = new Voice({ beatValue: denominator, numBeats: numerator })
  voice.setMode(Voice.Mode.SOFT)
  const tuplets = [...groups.values()].map((notes) => new Tuplet(notes, { numNotes: 3, notesOccupied: 2, bracketed: true }))
  voice.addTickables(tickables)
  return { eventNotes, internalTies, voice, tuplets, beams: Beam.generateBeams(tickables) }
}

function makeTie(firstNote: StaveNote | undefined, lastNote: StaveNote | undefined, keyCount: number): StaveTie {
  const indexes = Array.from({ length: Math.max(1, keyCount) }, (_, index) => index)
  return new StaveTie({ firstIndexes: indexes, firstNote, lastIndexes: indexes, lastNote })
}

function makeStaveNote(event: ScoreEvent, clef: string, duration: string, score: ScoreDocument): StaveNote {
  const isRest = event.isRest
  const keys = isRest ? [clef === 'bass' ? 'd/3' : 'b/4'] : event.pitches.map((pitch) => spellPitch(pitch, score.keySignature))
  const staveNote = new StaveNote({
    clef,
    duration: isRest ? `${duration}r` : duration,
    keys,
  })
  if (duration.endsWith('d')) Dot.buildAndAttach([staveNote])
  return staveNote
}

const NOTATION_DURATIONS: readonly { readonly ticks: number; readonly vexflow: string }[] = [
  { ticks: 1_920, vexflow: 'w' },
  { ticks: 1_440, vexflow: 'hd' },
  { ticks: 960, vexflow: 'h' },
  { ticks: 720, vexflow: 'qd' },
  { ticks: 480, vexflow: 'q' },
  { ticks: 360, vexflow: '8d' },
  { ticks: 240, vexflow: '8' },
  { ticks: 120, vexflow: '16' },
]

/** Decompose every quantized sixteenth duration exactly; never round it down. */
export function decomposeTicksForNotation(ticks: number): readonly string[] {
  let remaining = Math.max(120, Math.round(ticks / 120) * 120)
  const durations: string[] = []
  for (const option of NOTATION_DURATIONS) {
    while (remaining >= option.ticks) {
      durations.push(option.vexflow)
      remaining -= option.ticks
    }
  }
  return durations.length === 0 ? ['16'] : durations
}

export const SCORE_DEFAULT_METER: TranscriptionMeter = '4/4'
