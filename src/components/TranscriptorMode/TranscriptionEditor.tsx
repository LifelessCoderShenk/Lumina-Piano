import { useEffect, useMemo, useRef, useState } from 'react'
import { detectKeySignature, gridTicks, requantizeNotes, spellPitch, suspiciousNotes } from '../../transcription/analysis'
import { beatDurationMs, musicalPosition, MusicalPositionFields } from './MusicalPositionFields'
import type { CapturedNote, TimeRange, TranscriptionSettings } from '../../transcription/types'
import styles from './TranscriptorMode.module.css'

interface Props {
  notes: readonly CapturedNote[]
  settings: TranscriptionSettings
  selectedIds: readonly string[]
  onSelect: (ids: readonly string[]) => void
  onEdit: (notes: readonly CapturedNote[]) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  range?: TimeRange
  onRangeChange?: (range: TimeRange) => void
  takeDurationMs?: number
  onReplace?: () => void
}
interface Drag { x: number; y: number; resize: boolean; ids: readonly string[]; dx: number; dy: number; pointerId: number }
interface RangeDrag { x: number; original: TimeRange; edge: 'start' | 'end' | 'move'; pointerId: number }
const ROW = 16
const RULER_HEIGHT = 24
const GUTTER = 46

export function TranscriptionEditor({ notes, settings, selectedIds, onSelect, onEdit, onUndo, onRedo, canUndo, canRedo, range, onRangeChange, takeDurationMs = 0, onReplace }: Props) {
  const [zoom, setZoom] = useState(0.12)
  const [timingUnits, setTimingUnits] = useState<'musical' | 'ms' | null>(null)
  const [preview, setPreview] = useState<readonly CapturedNote[] | null>(null)
  const drag = useRef<Drag | null>(null)
  const rangeDrag = useRef<RangeDrag | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const warnings = useMemo(() => suspiciousNotes(notes), [notes])
  const selected = notes.filter((note) => selectedIds.includes(note.id))
  const duration = Math.max(4000, takeDurationMs, ...notes.map((note) => note.endMs))
  const width = Math.max(880, duration * zoom + 100)
  const low = Math.max(21, Math.min(48, ...notes.map((note) => note.pitch)) - 3)
  const high = Math.min(108, Math.max(72, ...notes.map((note) => note.pitch)) + 3)
  const grid = settings.quantization === 'none' ? 1 : gridTicks(settings.quantization) * 60000 / (settings.bpm * 480)
  const musical = (timingUnits ?? (settings.quantization === 'none' ? 'ms' : 'musical')) === 'musical'
  const beatMs = beatDurationMs(settings.bpm, settings.meter)
  const beatsPerBar = Number(settings.meter.split('/')[0])
  const beatStep = settings.quantization === 'none' ? .01 : grid / beatMs
  const keySignature = useMemo(() => settings.keySignature === 'auto' || !settings.keySignature ? detectKeySignature(notes) : settings.keySignature, [notes, settings.keySignature])
  const noteName = (pitch: number) => spellPitch(pitch, keySignature).replace('/', '').replace(/^./, (letter) => letter.toUpperCase())
  const positionName = (timeMs: number) => {
    const position = musicalPosition(timeMs, settings.bpm, settings.meter)
    return `bar ${position.bar}, beat ${Number(position.beat.toFixed(3))}`
  }
  const shown = preview ?? notes
  const snapTime = (value: number) => Math.max(0, Math.min(duration, settings.quantization === 'none' ? Math.round(value) : Math.round(value / grid) * grid))
  useEffect(() => {
    const note = notes.find((entry) => selectedIds.includes(entry.id))
    if (!note || !scroller.current) return
    const x = GUTTER + note.startMs * zoom; const y = RULER_HEIGHT + (high - note.pitch) * ROW
    if (x < scroller.current.scrollLeft + GUTTER || x > scroller.current.scrollLeft + scroller.current.clientWidth - 70) scroller.current.scrollLeft = Math.max(0, x - GUTTER - 14)
    if (y < scroller.current.scrollTop + RULER_HEIGHT || y > scroller.current.scrollTop + scroller.current.clientHeight - 30) scroller.current.scrollTop = Math.max(0, y - RULER_HEIGHT - 16)
  }, [selectedIds, notes, zoom, high])

  const transform = (change: Drag): readonly CapturedNote[] => {
    const moved = notes.filter((note) => change.ids.includes(note.id))
    if (moved.length === 0) return notes
    const deltaTime = Math.round(change.dx / zoom / grid) * grid
    const deltaPitch = Math.min(108 - Math.max(...moved.map((note) => note.pitch)), Math.max(21 - Math.min(...moved.map((note) => note.pitch)), -Math.round(change.dy / ROW)))
    const time = change.resize ? deltaTime : Math.max(-Math.min(...moved.map((note) => note.startMs)), deltaTime)
    return notes.map((note) => change.ids.includes(note.id) ? change.resize
      ? { ...note, endMs: Math.max(note.startMs + 1, note.endMs + time), keyEndMs: undefined }
      : { ...note, pitch: note.pitch + deltaPitch, startMs: note.startMs + time, endMs: note.endMs + time, keyEndMs: undefined } : note)
  }
  const remove = () => { onEdit(notes.filter((note) => !selectedIds.includes(note.id))); onSelect([]) }
  const editNote = (field: 'pitch' | 'startMs' | 'duration', value: number) => {
    const note = selected[0]
    if (!note || !Number.isFinite(value)) return
    const next = field === 'pitch' ? { ...note, pitch: Math.min(108, Math.max(21, Math.round(value))) } : field === 'duration' ? { ...note, endMs: note.startMs + Math.max(1, value), keyEndMs: undefined } : { ...note, startMs: Math.max(0, value), endMs: Math.max(0, value) + note.endMs - note.startMs, keyEndMs: undefined }
    if (next.pitch !== note.pitch || next.startMs !== note.startMs || next.endMs !== note.endMs) onEdit(notes.map((entry) => entry.id === note.id ? next : entry))
  }
  return <section className={styles.editor} aria-label="Transcription note editor" onKeyDown={(event) => {
    if ((event.target as HTMLElement).matches('input,select')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) onRedo(); else onUndo() }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) { event.preventDefault(); remove() }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && selected.length) {
      event.preventDefault()
      onEdit(transform({ x: 0, y: 0, dx: event.key === 'ArrowLeft' ? -grid * zoom : event.key === 'ArrowRight' ? grid * zoom : 0, dy: event.key === 'ArrowUp' ? -ROW : event.key === 'ArrowDown' ? ROW : 0, resize: event.shiftKey, ids: selectedIds, pointerId: -1 }))
    }
  }}>
    <div className={styles.editorToolbar}>
      <strong>Review & correct</strong>
      <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
      <button type="button" onClick={onRedo} disabled={!canRedo}>Redo</button>
      <button type="button" onClick={() => onSelect(notes.map((note) => note.id))}>Select all</button>
      <button type="button" onClick={remove} disabled={!selected.length}>Delete selected</button>
      <button type="button" disabled={!selected.length || settings.quantization === 'none'} onClick={() => {
        const changed = new Map(requantizeNotes(selected, settings).map((note) => [note.id, note]))
        onEdit(notes.map((note) => changed.get(note.id) ?? note))
      }}>Quantize selected</button>
      <label>Zoom <input aria-label="Editor zoom" type="range" min="0.04" max="0.4" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <label>Timing <select aria-label="Editor timing units" value={musical ? 'musical' : 'ms'} onChange={(event) => setTimingUnits(event.target.value as 'musical' | 'ms')}><option value="musical">Bars & beats</option><option value="ms">Milliseconds</option></select></label>
      {warnings.size > 0 && <button type="button" onClick={() => onSelect([...warnings.keys()])}>{warnings.size} notes to check</button>}
    </div>
    {range && onRangeChange && <div className={styles.punchToolbar}>
      <strong>Replace passage</strong>
      {musical ? <>
        <MusicalPositionFields label="Start" accessibleLabel="Replacement start" timeMs={range.startMs} bpm={settings.bpm} meter={settings.meter} step={beatStep} onChange={(value) => onRangeChange({ ...range, startMs: Math.min(range.endMs - 1, snapTime(value)) })} />
        <MusicalPositionFields label="End" accessibleLabel="Replacement end" timeMs={range.endMs} bpm={settings.bpm} meter={settings.meter} step={beatStep} onChange={(value) => onRangeChange({ ...range, endMs: Math.max(range.startMs + 1, snapTime(value)) })} />
      </> : <>
        <label>Start (ms) <input aria-label="Replacement start" type="number" min="0" max={range.endMs - 1} value={Math.round(range.startMs)} onChange={(event) => onRangeChange({ ...range, startMs: Math.min(range.endMs - 1, snapTime(Number(event.target.value))) })} /></label>
        <label>End (ms) <input aria-label="Replacement end" type="number" min={range.startMs + 1} max={duration} value={Math.round(range.endMs)} onChange={(event) => onRangeChange({ ...range, endMs: Math.max(range.startMs + 1, snapTime(Number(event.target.value))) })} /></label>
      </>}
      <span>{((range.endMs - range.startMs) / 1000).toFixed(1)} seconds</span>
      <button type="button" disabled={range.endMs <= range.startMs} onClick={onReplace}>Record replacement</button>
    </div>}
    <p className={styles.editorHint}>Click a note here or in the score. Shift-click to select several. Drag to move; drag the right edge to resize. Arrow keys adjust pitch/time; Shift + arrows resize.</p>
    {selected.length === 1 && <div className={styles.editorToolbar}>
      <label>Note <select aria-label="Selected note pitch" value={selected[0].pitch} onChange={(event) => editNote('pitch', Number(event.target.value))}>{Array.from({ length: 88 }, (_, index) => index + 21).map((pitch) => <option key={pitch} value={pitch}>{noteName(pitch)}</option>)}</select></label>
      {musical && <MusicalPositionFields label="Start" accessibleLabel="Selected note start" timeMs={selected[0].startMs} bpm={settings.bpm} meter={settings.meter} step={beatStep} onChange={(value) => editNote('startMs', settings.quantization === 'none' ? value : Math.round(value / grid) * grid)} />}
      {(musical ? ['duration'] as const : ['startMs', 'duration'] as const).map((field) => {
        const value = field === 'duration' ? (selected[0].endMs - selected[0].startMs) / (musical ? beatMs : 1) : selected[0].startMs
        return <label key={`${selected[0].id}:${field}:${value}:${musical}`}>
          {field === 'startMs' ? 'Start (ms)' : musical ? 'Length (beats)' : 'Length (ms)'}
          <input aria-label={`Selected note ${field}`} type="number" min={field === 'startMs' ? 0 : musical ? 1 / beatMs : 1} step={musical ? beatStep : 'any'} defaultValue={Number(value.toFixed(6))} onBlur={(event) => {
            if (event.currentTarget.value === event.currentTarget.defaultValue || event.currentTarget.value === '') return
            const number = Number(event.currentTarget.value)
            editNote(field, number * (musical ? beatMs : 1))
          }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        </label>
      })}
      <span>{warnings.get(selected[0].id)}</span>
    </div>}
    <div ref={scroller} className={styles.pianoRoll}>
      <div className={styles.rollContent} style={{ width, height: RULER_HEIGHT + (high - low + 1) * ROW, backgroundSize: `100% ${ROW}px, ${beatMs * zoom}px 100%`, backgroundPosition: `${GUTTER}px ${RULER_HEIGHT}px` }} onPointerMove={(event) => {
        if (rangeDrag.current && rangeDrag.current.pointerId === event.pointerId && range && onRangeChange) {
          const move = rangeDrag.current, delta = (event.clientX - move.x) / zoom, minimum = settings.quantization === 'none' ? 1 : grid
          if (move.edge === 'move') {
            const length = move.original.endMs - move.original.startMs
            const startMs = Math.min(duration - length, snapTime(move.original.startMs + delta))
            onRangeChange({ startMs, endMs: startMs + length })
          } else if (move.edge === 'start') onRangeChange({ ...range, startMs: Math.min(range.endMs - minimum, snapTime(move.original.startMs + delta)) })
          else onRangeChange({ ...range, endMs: Math.max(range.startMs + minimum, snapTime(move.original.endMs + delta)) })
          return
        }
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        drag.current.dx = event.clientX - drag.current.x; drag.current.dy = event.clientY - drag.current.y
        setPreview(transform(drag.current))
      }} onPointerUp={(event) => {
        if (rangeDrag.current && rangeDrag.current.pointerId === event.pointerId) { rangeDrag.current = null; return }
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        const move = drag.current; drag.current = null
        move.dx = event.clientX - move.x; move.dy = event.clientY - move.y
        if (Math.abs(move.dx) + Math.abs(move.dy) > 2) onEdit(transform(move))
        setPreview(null)
      }} onPointerCancel={() => { rangeDrag.current = null; drag.current = null; setPreview(null) }}>
        <div className={styles.rollRuler} aria-label="Bar and beat ruler">
          <span className={styles.rulerCorner}>Bars</span>
          {Array.from({ length: Math.ceil((width - GUTTER) / (beatMs * zoom)) }, (_, index) => index).filter((index) => index % beatsPerBar === 0 || beatMs * zoom >= 28).map((index) => <span key={index} className={index % beatsPerBar === 0 ? styles.barMark : styles.beatMark} style={{ left: GUTTER + index * beatMs * zoom }} title={`Bar ${Math.floor(index / beatsPerBar) + 1}, beat ${index % beatsPerBar + 1}`}>{index % beatsPerBar === 0 ? `${Math.floor(index / beatsPerBar) + 1}.1` : index % beatsPerBar + 1}</span>)}
        </div>
        <div className={styles.pitchGutter} style={{ height: (high - low + 1) * ROW }}>
          {Array.from({ length: high - low + 1 }, (_, i) => <span key={i} className={styles.pitchLabel} style={{ top: i * ROW }}>{noteName(high - i)}</span>)}
        </div>
        {range && onRangeChange && <div className={styles.punchRange} style={{ top: RULER_HEIGHT, left: GUTTER + range.startMs * zoom, width: Math.max(8, (range.endMs - range.startMs) * zoom) }}>
          {(['start', 'move', 'end'] as const).map((edge) => <button key={edge} type="button" className={styles[`punch${edge[0].toUpperCase()}${edge.slice(1)}` as keyof typeof styles]} aria-label={edge === 'move' ? 'Move replacement passage' : `${edge === 'start' ? 'Adjust replacement start' : 'Adjust replacement end'}`} onPointerDown={(event) => { event.stopPropagation(); rangeDrag.current = { x: event.clientX, original: range, edge, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId) }} />)}
        </div>}
        {shown.map((note) => <button key={note.id} type="button" className={`${styles.rollNote} ${selectedIds.includes(note.id) ? styles.selectedNote : ''} ${warnings.has(note.id) ? styles.warningNote : ''}`} aria-label={`Note ${noteName(note.pitch)} at ${positionName(note.startMs)}`} aria-pressed={selectedIds.includes(note.id)} title={`${noteName(note.pitch)} · ${positionName(note.startMs)} · ${Math.round(note.startMs)} ms · ${Math.round(note.endMs - note.startMs)} ms long${warnings.has(note.id) ? ` · ${warnings.get(note.id)}` : ''}`} style={{ left: GUTTER + note.startMs * zoom, top: RULER_HEIGHT + (high - note.pitch) * ROW + 1, width: Math.max(7, (note.endMs - note.startMs) * zoom), height: ROW - 2 }} onPointerDown={(event) => {
          if (event.button !== 0) return
          const ids = event.shiftKey ? selectedIds.includes(note.id) ? selectedIds.filter((id) => id !== note.id) : [...selectedIds, note.id] : selectedIds.includes(note.id) ? selectedIds : [note.id]
          onSelect(ids)
          const rect = event.currentTarget.getBoundingClientRect()
          drag.current = { x: event.clientX, y: event.clientY, dx: 0, dy: 0, resize: event.clientX > rect.right - 8, ids, pointerId: event.pointerId }
          event.currentTarget.setPointerCapture(event.pointerId)
        }} onClick={(event) => { if (event.detail === 0) onSelect([note.id]) }}><span className={styles.resizeHandle} /></button>)}
      </div>
    </div>
  </section>
}
