import { beforeEach, expect, it, vi } from 'vitest'
import { Midi } from '@tonejs/midi'
vi.mock('../audio/AudioScheduler', () => ({ audioScheduler: { isReady: () => true, init: vi.fn() } }))
vi.mock('../playback/PlaybackEngine', () => ({ playbackEngine: { init: vi.fn(), seek: vi.fn() }, PlaybackEngineError: class extends Error {} }))
import { loadMidiBytes } from '../midi/loadMidiProject'
import { MoveNotesCommand } from '../commands/MoveNotesCommand'
import { resetStore, useAppStore } from '../store/store'
import { applyLuminaProjectDocument, createLuminaProjectDocument, parseLuminaProject, serializeLuminaProject } from './luminaProject'
import { tickToSeconds } from '../tempo/tempoMap'
beforeEach(() => resetStore())
it('imports, edits, serializes and reopens a dense long MIDI with tempo changes', async () => {
  const midi = new Midi()
  midi.header.setTempo(120)
  midi.header.tempos.push({ ticks: 480 * 1800, bpm: 90 })
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  const track = midi.addTrack()
  for (let i = 0; i < 20000; i++) track.addNote({ midi: 36 + i % 48, ticks: i * 120, durationTicks: 100, velocity: 0.75 })
  await loadMidiBytes(midi.toArray())
  const imported = useAppStore.getState().projectData!
  expect(imported.tracks[0].notes).toHaveLength(20000)
  const first = imported.tracks[0].notes[0]
  new MoveNotesCommand([first.id], 1, 10).execute()
  const edited = structuredClone(useAppStore.getState().projectData!)
  const document = parseLuminaProject(serializeLuminaProject(createLuminaProjectDocument(useAppStore.getState(), 'Long performance')))
  resetStore()
  await applyLuminaProjectDocument(document)
  const state = useAppStore.getState()
  expect(state.projectData).toEqual(edited)
  expect(state.projectData!.tracks[0].notes[0]).toMatchObject({ pitch: first.pitch + 1, startTick: 10 })
  expect(tickToSeconds(state.projectData!.totalTicks, state.precomputedTempoMap!)).toBeGreaterThan(1800)
  expect(state.isPlaying).toBe(false)
}, 15000)
