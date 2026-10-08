import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import type { TranscriptionSession } from '../../transcription/types'
import { normalizeTranscriptionSettings } from '../../transcription/settings'
import { TakesPanel } from './TakesPanel'

afterEach(cleanup)

const settings = normalizeTranscriptionSettings({ bpm: 120, meter: '4/4', midiDeviceId: null, chordNamesEnabled: true, keyLabelsEnabled: false })
const takes: TranscriptionSession[] = [
  { version: 1, id: 'one', name: 'First pass', favorite: false, operation: { kind: 'fresh', startMs: 0 }, savedAt: new Date(2026, 8, 18, 14, 30).getTime(), settings, originalNotes: [], editedNotes: [], events: [], durationMs: 8_400, estimatedBpm: null },
  { version: 1, id: 'two', name: 'Fast ending', favorite: true, parentId: 'one', operation: { kind: 'continue', startMs: 8_400 }, savedAt: new Date(2026, 8, 18, 15, 45).getTime(), settings, originalNotes: [], editedNotes: [], events: [], durationMs: 65_000, estimatedBpm: null },
]

it('shows newest takes first with duration, recording time, and favorite state', () => {
  render(<TakesPanel takes={takes} activeId="one" disabled={false} onSelect={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} undoDelete={null} />)

  const entries = screen.getAllByRole('listitem')
  expect(entries[0].textContent).toContain('Fast ending')
  expect(entries[0].textContent).toContain('Continued')
  expect(entries[0].textContent).toContain('1:05')
  expect(entries[0].textContent).toContain('Sep 18')
  expect(screen.getByRole('button', { name: /Select Fast ending, Continued from First pass, 1:05, favorite/ })).toBeTruthy()
  expect(entries[1].textContent).toContain('First pass')
  expect(entries[1].textContent).toContain('Original')
  expect(entries[1].textContent).toContain('8.4s')
})

it('marks punch-in attempts as replacements linked to their parent take', () => {
  const replacement: TranscriptionSession = { ...takes[1], id: 'three', name: 'Fixed bridge', favorite: false, parentId: 'two', operation: { kind: 'replace', startMs: 12_000, endMs: 16_000 } }
  render(<TakesPanel takes={[...takes, replacement]} activeId="three" disabled={false} onSelect={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} undoDelete={null} />)

  const select = screen.getByRole('button', { name: /Select Fixed bridge, Replacement from Fast ending/ })
  expect(select.textContent).toContain('Replacement')
  expect(screen.getByTitle('Replacement from Fast ending')).toBeTruthy()
})

it('selects a take and keeps editing actions on the active row', () => {
  const onSelect = vi.fn()
  const onUpdate = vi.fn()
  const onDelete = vi.fn()
  render(<TakesPanel takes={takes} activeId="one" disabled={false} onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} undoDelete={null} />)

  fireEvent.click(screen.getByRole('button', { name: /Select Fast ending/ }))
  expect(onSelect).toHaveBeenCalledWith('two')
  expect(screen.queryByRole('textbox', { name: 'Rename Fast ending' })).toBeNull()

  const rename = screen.getByRole('textbox', { name: 'Rename First pass' })
  fireEvent.change(rename, { target: { value: 'Clean take' } })
  fireEvent.blur(rename)
  expect(onUpdate).toHaveBeenCalledWith('one', { name: 'Clean take' })
  fireEvent.click(screen.getByRole('button', { name: 'Favorite First pass' }))
  expect(onUpdate).toHaveBeenLastCalledWith('one', { favorite: true })
  fireEvent.click(screen.getByRole('button', { name: 'Delete First pass' }))
  expect(onDelete).toHaveBeenCalledWith('one')
})
