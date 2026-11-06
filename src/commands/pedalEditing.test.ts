import { beforeEach, expect, it } from 'vitest'
import { resetStore, useAppStore } from '../store/store'
import { Clipboard } from './Clipboard'
import { MoveNotesCommand } from './MoveNotesCommand'
import { QuantizeNotesCommand } from './QuantizeNotesCommand'
import { ResizeNotesCommand } from './ResizeNotesCommand'
import { DeleteNotesCommand } from './DeleteNotesCommand'
import { SetNoteVelocityCommand } from './SetNoteVelocityCommand'

const original = { id: 'held', pitch: 60, velocity: 90, startTick: 100, endTick: 200, visualEndTick: 200, sustainEndTick: 600 }
const notes = () => useAppStore.getState().projectData!.tracks[0].notes
beforeEach(() => {
  resetStore()
  useAppStore.setState({ projectData: {
    ticksPerQuarter: 480, totalTicks: 1200,
    tempoMap: [{ tick: 0, bpm: 120, microsecondsPerBeat: 500000 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    tracks: [{ id: 'piano', channel: 0, name: 'Piano', notes: [{ ...original }] }],
  } })
})
it('keeps pedal duration when moving and undoing, including project audio length', () => {
  const command = new MoveNotesCommand(['held'], 2, 120)
  command.execute()
  expect(notes()[0]).toMatchObject({ startTick: 220, endTick: 320, sustainEndTick: 720 })
  expect(useAppStore.getState().projectData!.totalTicks).toBe(720)
  command.undo(); expect(notes()[0]).toEqual(original)
  command.redo(); expect(notes()[0].sustainEndTick).toBe(720)
})
it('shifts pedal timing with quantization', () => {
  new QuantizeNotesCommand(['held'], 120).execute()
  expect(notes()[0]).toMatchObject({ startTick: 120, endTick: 220, sustainEndTick: 620 })
})
it('retains pedal release when resizing key duration and never releases before the key', () => {
  const shorten = new ResizeNotesCommand(['held'], 0, -50)
  shorten.execute(); expect(notes()[0]).toMatchObject({ endTick: 150, sustainEndTick: 600 })
  shorten.undo()
  useAppStore.getState().batchUpdate(state => { state.projectData!.totalTicks = 1200 })
  const extend = new ResizeNotesCommand(['held'], 0, 500)
  extend.execute(); expect(notes()[0]).toMatchObject({ endTick: 700, sustainEndTick: 700 })
})
it('retains sustain when changing velocity and restoring deleted notes', () => {
  new SetNoteVelocityCommand(['held'], 50).execute()
  expect(notes()[0].sustainEndTick).toBe(600)
  const remove = new DeleteNotesCommand(['held']); remove.execute(); remove.undo()
  expect(notes()[0]).toMatchObject({ velocity: 50, sustainEndTick: 600 })
})
it('copies and pastes relative sustain timing and retains it through undo and redo', () => {
  const clipboard = new Clipboard(); clipboard.copy(['held'])
  const paste = clipboard.paste(1000)!
  paste.execute()
  expect(notes()[1]).toMatchObject({ startTick: 1000, endTick: 1100, sustainEndTick: 1500 })
  expect(useAppStore.getState().projectData!.totalTicks).toBe(1500)
  paste.undo(); expect(notes()).toHaveLength(1)
  paste.redo(); expect(notes()[1].sustainEndTick).toBe(1500)
})
