import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'

import { DeleteNotesCommand, MoveNotesCommand, QuantizeNotesCommand, ResizeNotesCommand, SetNoteVelocityCommand, commandHistory } from '../../commands'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { useAppStore } from '../../store/store'
import { AppIcon } from '../AppIcon/AppIcon'
import styles from './CreateNoteEditor.module.css'

const ROW_HEIGHT = 9
const DEFAULT_PIXELS_PER_QUARTER = 90
const MIN_PIXELS_PER_QUARTER = 8
const MAX_PIXELS_PER_QUARTER = 240

interface DragPreview { ids: string[]; dx: number; dy: number; resize: boolean; pointerId: number }

export function CreateNoteEditor() {
  const project = useAppStore((state) => state.projectData)
  const selected = useAppStore((state) => state.selectedNoteIds)
  const currentTick = useAppStore((state) => state.currentTick)
  const isPlaying = useAppStore((state) => state.isPlaying)
  const [grid, setGrid] = useState(120)
  const [pixelsPerQuarter, setPixelsPerQuarter] = useState(DEFAULT_PIXELS_PER_QUARTER)
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [velocityDraft, setVelocityDraft] = useState<number | null>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const rollRef = useRef<HTMLDivElement>(null)
  const zoomAnchorTick = useRef<number | null>(null)
  const pendingVelocity = useRef<number | null>(null)
  const notes = useMemo(() => project?.tracks.flatMap((track) => track.notes.map((note) => ({ ...note, trackId: track.id }))) ?? [], [project])
  const selectedNotes = notes.filter((note) => selected.has(note.id))
  const selectionKey = [...selected].sort().join('|')
  const selectedVelocity = selectedNotes.length > 0 && selectedNotes.every((note) => note.velocity === selectedNotes[0].velocity)
    ? selectedNotes[0].velocity
    : null

  useEffect(() => {
    pendingVelocity.current = null
    setVelocityDraft(null)
  }, [selectionKey])

  const ticksPerQuarter = project?.ticksPerQuarter ?? 480
  const scale = pixelsPerQuarter / ticksPerQuarter
  const boundedTick = clamp(currentTick, 0, project?.totalTicks ?? 0)
  useLayoutEffect(() => {
    const roll = rollRef.current
    if (roll == null || zoomAnchorTick.current == null) return
    roll.scrollLeft = zoomAnchorTick.current * scale - roll.clientWidth / 2
    zoomAnchorTick.current = null
  }, [pixelsPerQuarter, scale])
  useEffect(() => {
    const roll = rollRef.current
    if (!isPlaying || roll == null || roll.clientWidth <= 0) return
    const playheadX = boundedTick * scale
    const safeLeft = roll.scrollLeft + 32
    const safeRight = roll.scrollLeft + roll.clientWidth - 32
    if (playheadX < safeLeft || playheadX > safeRight) {
      roll.scrollLeft = Math.max(0, playheadX - roll.clientWidth * 0.28)
    }
  }, [boundedTick, isPlaying, scale])

  if (project == null) return null
  const width = Math.max(80, Math.round((project.totalTicks * scale + 80) * 100) / 100)
  const execute = (command: Parameters<typeof commandHistory.execute>[0]) => commandHistory.execute(command)
  const displayedVelocity = velocityDraft ?? selectedVelocity ?? selectedNotes[0]?.velocity ?? 80
  const commitVelocity = () => {
    const nextVelocity = pendingVelocity.current
    pendingVelocity.current = null
    setVelocityDraft(null)
    if (nextVelocity == null || selectedNotes.length === 0 || selectedNotes.every((note) => note.velocity === nextVelocity)) return
    execute(new SetNoteVelocityCommand([...selected], nextVelocity))
  }
  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(event.target)) return

    const key = event.key.toLowerCase()
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) commandHistory.redo()
      else commandHistory.undo()
      return
    }
    if (modifier && key === 'y') {
      event.preventDefault()
      commandHistory.redo()
      return
    }
    if (modifier || event.altKey || selected.size === 0) return

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      execute(new DeleteNotesCommand([...selected]))
      return
    }

    const pitchDelta = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    const tickDelta = event.key === 'ArrowRight' ? grid : event.key === 'ArrowLeft' ? -grid : 0
    if (pitchDelta === 0 && tickDelta === 0) return
    event.preventDefault()
    execute(new MoveNotesCommand([...selected], pitchDelta, tickDelta))
  }
  const changeZoom = (factor: number) => {
    const roll = rollRef.current
    if (roll != null) zoomAnchorTick.current = (roll.scrollLeft + roll.clientWidth / 2) / scale
    setPixelsPerQuarter((current) => clamp(current * factor, MIN_PIXELS_PER_QUARTER, MAX_PIXELS_PER_QUARTER))
  }
  const fitTimeline = () => {
    const roll = rollRef.current
    if (roll == null || project.totalTicks <= 0) return
    zoomAnchorTick.current = null
    roll.scrollLeft = 0
    const availableWidth = Math.max(1, roll.clientWidth - 80)
    setPixelsPerQuarter(clamp(availableWidth * project.ticksPerQuarter / project.totalTicks, MIN_PIXELS_PER_QUARTER, MAX_PIXELS_PER_QUARTER))
  }
  const seekFromTimeline = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const nextTick = clamp(Math.round((event.clientX - bounds.left) / scale), 0, project.totalTicks)
    playbackEngine.seek(nextTick)
    useAppStore.getState().clearSelection()
  }

  return (
    <section
      className={styles.editor}
      aria-label="Performance note editor"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete Backspace Control+Z Meta+Z Control+Y Meta+Y"
      tabIndex={0}
      onKeyDown={handleEditorKeyDown}
    >
      <div className={styles.toolbar}>
        <strong>{selected.size > 0 ? `${selected.size} selected` : 'Select notes'}</strong>
        <label>Grid <select aria-label="Edit grid" value={grid} onChange={(event) => setGrid(Number(event.target.value))}><option value="240">1/8</option><option value="160">1/8 triplet</option><option value="120">1/16</option><option value="80">1/16 triplet</option></select></label>
        <button type="button" disabled={selected.size === 0} onClick={() => execute(new QuantizeNotesCommand([...selected], grid))}>Quantize</button>
        <div className={styles.zoomTools} role="group" aria-label="Timeline zoom">
          <button type="button" aria-label="Zoom out timeline" title="Zoom out" onClick={() => changeZoom(0.8)}><AppIcon icon={ZoomOut} size={16} /></button>
          <button type="button" aria-label="Fit timeline" title="Fit whole take" onClick={fitTimeline}><AppIcon icon={Maximize2} size={15} /></button>
          <button type="button" aria-label="Zoom in timeline" title="Zoom in" onClick={() => changeZoom(1.25)}><AppIcon icon={ZoomIn} size={16} /></button>
        </div>
        <label className={styles.velocityControl}>
          Velocity
          <input
            className={styles.velocitySlider}
            aria-label="Selected note velocity"
            aria-valuetext={selectedVelocity == null && velocityDraft == null && selectedNotes.length > 1 ? 'Mixed' : String(displayedVelocity)}
            type="range"
            min="1"
            max="127"
            disabled={selected.size === 0}
            value={displayedVelocity}
            onChange={(event) => {
              const velocity = Math.max(1, Math.min(127, Number(event.target.value)))
              pendingVelocity.current = velocity
              setVelocityDraft(velocity)
            }}
            onPointerUp={commitVelocity}
            onPointerCancel={commitVelocity}
            onKeyUp={commitVelocity}
            onBlur={commitVelocity}
          />
          <output className={styles.velocityValue} aria-label="Selected velocity value">
            {selectedVelocity == null && velocityDraft == null && selectedNotes.length > 1 ? 'Mixed' : displayedVelocity}
          </output>
        </label>
        <button type="button" aria-label="Undo note edit" disabled={!commandHistory.canUndo()} onClick={() => commandHistory.undo()}><AppIcon icon={Undo2} size={16} /></button>
        <button type="button" aria-label="Redo note edit" disabled={!commandHistory.canRedo()} onClick={() => commandHistory.redo()}><AppIcon icon={Redo2} size={16} /></button>
        <button type="button" aria-label="Delete selected notes" disabled={selected.size === 0} onClick={() => execute(new DeleteNotesCommand([...selected]))}><AppIcon icon={Trash2} size={16} /></button>
      </div>
      <div ref={rollRef} className={styles.roll} aria-label="Note timeline">
        <div className={styles.rollContent} style={{ width, minWidth: '100%', height: ROW_HEIGHT * 88, backgroundSize: `100% ${ROW_HEIGHT}px, ${pixelsPerQuarter}px 100%` }} onPointerDown={seekFromTimeline}>
          <div className={styles.playhead} data-testid="note-editor-playhead" style={{ left: boundedTick * scale }} aria-hidden="true" />
          {notes.map((note) => {
            const isSelected = selected.has(note.id)
            const moving = preview != null && preview.ids.includes(note.id)
            const deltaTicks = moving ? Math.round(preview.dx / scale / grid) * grid : 0
            const deltaPitch = moving && !preview.resize ? -Math.round(preview.dy / ROW_HEIGHT) : 0
            const deltaWidth = moving && preview.resize ? Math.round(preview.dx / scale / grid) * grid * scale : 0
            const velocityStrength = note.velocity / 127
            return <button
              key={note.id}
              type="button"
              aria-label={`${noteName(note.pitch)} at tick ${note.startTick}`}
              aria-pressed={isSelected}
              className={`${styles.note} ${isSelected ? styles.selected : ''}`}
              style={{
                left: note.startTick * scale,
                top: (108 - note.pitch) * ROW_HEIGHT,
                width: Math.max(5, (note.endTick - note.startTick) * scale + deltaWidth),
                transform: `translate(${deltaTicks * scale}px, ${-deltaPitch * ROW_HEIGHT}px)`,
                '--velocity-alpha': (0.3 + velocityStrength * 0.7).toFixed(3),
                '--velocity-glow': `${Math.round(2 + velocityStrength * 7)}px`,
                '--velocity-glow-alpha': (0.14 + velocityStrength * 0.5).toFixed(3),
              } as React.CSSProperties}
              onClick={(event) => { event.stopPropagation(); if (event.ctrlKey) useAppStore.getState().addToSelection([note.id]); else useAppStore.getState().selectNotes([note.id]) }}
              onPointerDown={(event) => {
                event.preventDefault(); event.stopPropagation()
                const ids = selected.has(note.id) ? [...selected] : event.ctrlKey ? [...selected, note.id] : [note.id]
                if (!selected.has(note.id)) {
                  if (event.ctrlKey) useAppStore.getState().addToSelection([note.id])
                  else useAppStore.getState().selectNotes(ids)
                }
                const rect = event.currentTarget.getBoundingClientRect()
                dragStart.current = { x: event.clientX, y: event.clientY }
                setPreview({ ids, dx: 0, dy: 0, resize: event.clientX >= rect.right - 7, pointerId: event.pointerId })
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => { if (preview?.pointerId === event.pointerId) setPreview({ ...preview, dx: event.clientX - dragStart.current.x, dy: event.clientY - dragStart.current.y }) }}
              onPointerUp={(event) => {
                if (preview?.pointerId !== event.pointerId) return
                const deltaTicks = Math.round(preview.dx / scale / grid) * grid
                const deltaPitch = -Math.round(preview.dy / ROW_HEIGHT)
                if (preview.resize && deltaTicks !== 0) execute(new ResizeNotesCommand(preview.ids, 0, deltaTicks))
                else if (!preview.resize && (deltaTicks !== 0 || deltaPitch !== 0)) execute(new MoveNotesCommand(preview.ids, deltaPitch, deltaTicks))
                setPreview(null)
              }}
            ><span className={styles.resizeHandle} /></button>
          })}
        </div>
      </div>
    </section>
  )
}

function noteName(pitch: number): string { return `${['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][pitch % 12]}${Math.floor(pitch / 12) - 1}` }

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, select, textarea, [contenteditable="true"]')
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
