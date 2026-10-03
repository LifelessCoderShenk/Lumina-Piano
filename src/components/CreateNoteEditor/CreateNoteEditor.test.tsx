import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commandHistory } from '../../commands'
import { buildTempoMap } from '../../tempo/tempoMap'
import { resetStore, useAppStore } from '../../store/store'
import { CreateNoteEditor } from './CreateNoteEditor'

const project = {
  ticksPerQuarter: 480, totalTicks: 960,
  tempoMap: [{ tick: 0, bpm: 120, microsecondsPerBeat: 500_000 }],
  timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [{ id: 'piano', name: 'Piano', channel: 0, notes: [
    { id: 'note-1', pitch: 60, velocity: 80, startTick: 100, endTick: 400, visualEndTick: 400 },
    { id: 'note-2', pitch: 64, velocity: 42, startTick: 480, endTick: 720, visualEndTick: 720 },
  ] }],
}

describe('CreateNoteEditor', () => {
  beforeEach(() => {
    resetStore(); commandHistory.clear()
    useAppStore.getState().loadProject(project, buildTempoMap(project.tempoMap, project.ticksPerQuarter))
  })
  afterEach(() => { cleanup(); commandHistory.clear(); resetStore() })

  it('selects, changes, deletes, and restores notes through undoable commands', () => {
    render(<CreateNoteEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'C4 at tick 100' }))
    const velocity = screen.getByRole('slider', { name: 'Selected note velocity' })
    fireEvent.change(velocity, { target: { value: '110' } })
    fireEvent.pointerUp(velocity)
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].velocity).toBe(110)

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected notes' }))
    expect(useAppStore.getState().projectData?.tracks[0].notes).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo note edit' }))
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].velocity).toBe(110)
  })

  it('edits mixed velocities together and restores the gesture with one undo', () => {
    render(<CreateNoteEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'C4 at tick 100' }))
    fireEvent.click(screen.getByRole('button', { name: 'E4 at tick 480' }), { ctrlKey: true })
    expect(screen.getByLabelText('Selected velocity value').textContent).toBe('Mixed')

    const velocity = screen.getByRole('slider', { name: 'Selected note velocity' })
    fireEvent.change(velocity, { target: { value: '96' } })
    expect(screen.getByLabelText('Selected velocity value').textContent).toBe('96')
    fireEvent.pointerUp(velocity)
    expect(useAppStore.getState().projectData?.tracks[0].notes.map((note) => note.velocity)).toEqual([96, 96])

    fireEvent.click(screen.getByRole('button', { name: 'Undo note edit' }))
    expect(useAppStore.getState().projectData?.tracks[0].notes.map((note) => note.velocity)).toEqual([80, 42])
  })

  it('shows note dynamics through velocity-weighted brightness', () => {
    render(<CreateNoteEditor />)
    const louder = screen.getByRole('button', { name: 'C4 at tick 100' })
    const softer = screen.getByRole('button', { name: 'E4 at tick 480' })
    expect(Number(louder.style.getPropertyValue('--velocity-alpha'))).toBeGreaterThan(Number(softer.style.getPropertyValue('--velocity-alpha')))
  })

  it('nudges pitch and timing with arrow keys and supports keyboard undo and redo', () => {
    render(<CreateNoteEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'C4 at tick 100' }))
    const editor = screen.getByRole('region', { name: 'Performance note editor' })

    fireEvent.keyDown(editor, { key: 'ArrowUp' })
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].pitch).toBe(61)
    fireEvent.keyDown(editor, { key: 'ArrowRight' })
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].startTick).toBe(220)

    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].startTick).toBe(100)
    fireEvent.keyDown(editor, { key: 'y', ctrlKey: true })
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].startTick).toBe(220)
  })

  it('deletes and restores selected notes from the keyboard', () => {
    render(<CreateNoteEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'C4 at tick 100' }))
    const editor = screen.getByRole('region', { name: 'Performance note editor' })

    fireEvent.keyDown(editor, { key: 'Delete' })
    expect(useAppStore.getState().projectData?.tracks[0].notes).toHaveLength(1)
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    expect(useAppStore.getState().projectData?.tracks[0].notes).toHaveLength(2)
  })

  it('leaves arrow keys available to editor controls', () => {
    render(<CreateNoteEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'C4 at tick 100' }))
    const velocity = screen.getByRole('slider', { name: 'Selected note velocity' })

    fireEvent.keyDown(velocity, { key: 'ArrowUp' })
    expect(useAppStore.getState().projectData?.tracks[0].notes[0].pitch).toBe(60)
  })

  it('zooms the timeline and can fit the whole take to the viewport', () => {
    useAppStore.getState().loadProject({ ...project, totalTicks: 9_600 }, buildTempoMap(project.tempoMap, project.ticksPerQuarter))
    render(<CreateNoteEditor />)
    const timeline = screen.getByLabelText('Note timeline')
    Object.defineProperty(timeline, 'clientWidth', { configurable: true, value: 1_000 })
    const content = timeline.firstElementChild as HTMLElement
    expect(content.style.width).toBe('1880px')

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in timeline' }))
    expect(content.style.width).toBe('2330px')

    fireEvent.click(screen.getByRole('button', { name: 'Fit timeline' }))
    expect(content.style.width).toBe('1000px')
    expect(timeline.scrollLeft).toBe(0)
  })

  it('shows playback position and seeks when the empty timeline is clicked', () => {
    useAppStore.getState().setCurrentTick(240)
    render(<CreateNoteEditor />)
    expect(screen.getByTestId('note-editor-playhead').style.left).toBe('45px')

    const content = screen.getByLabelText('Note timeline').firstElementChild as HTMLElement
    fireEvent.pointerDown(content, { clientX: 90 })
    expect(useAppStore.getState().currentTick).toBe(480)
    expect(screen.getByTestId('note-editor-playhead').style.left).toBe('90px')
  })

  it('keeps the playhead visible while playback advances', () => {
    render(<CreateNoteEditor />)
    const timeline = screen.getByLabelText('Note timeline')
    Object.defineProperty(timeline, 'clientWidth', { configurable: true, value: 200 })
    act(() => useAppStore.setState({ currentTick: 900, isPlaying: true }))
    expect(timeline.scrollLeft).toBeGreaterThan(0)
  })
})
