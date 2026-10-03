import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRANSCRIPTION_SETTINGS } from '../../transcription/settings'
import type { CapturedNote, TranscriptionSettings } from '../../transcription/types'
import { TranscriptionEditor } from './TranscriptionEditor'

afterEach(cleanup)
const note: CapturedNote = { id: 'note', pitch: 70, startMs: 2250, endMs: 2750, velocity: 100, channel: 0 }
function setup(settings: Partial<TranscriptionSettings> = {}, captured = note) {
  const onEdit = vi.fn()
  const onRangeChange = vi.fn()
  render(<TranscriptionEditor notes={[captured]} selectedIds={[captured.id]} settings={{ ...TRANSCRIPTION_SETTINGS, keySignature: 'F', ...settings }} onEdit={onEdit} onSelect={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} canUndo={false} canRedo={false} range={{ startMs: 0, endMs: 2000 }} onRangeChange={onRangeChange} />)
  return { onEdit, onRangeChange }
}
function value(name: string) { return (screen.getByRole('spinbutton', { name }) as HTMLInputElement).value }
function change(name: string, next: string) {
  const input = screen.getByRole('spinbutton', { name })
  fireEvent.change(input, { target: { value: next } })
  fireEvent.blur(input)
}

describe('TranscriptionEditor musical timing', () => {
  it('uses named pitches, bar/beat positions, and beat lengths', () => {
    const { onEdit } = setup()
    expect((screen.getByRole('combobox', { name: 'Selected note pitch' }) as HTMLSelectElement).selectedOptions[0].text).toBe('Bb4')
    expect(value('Selected note start bar')).toBe('2')
    expect(value('Selected note start beat')).toBe('1.5')
    expect(value('Selected note duration')).toBe('1')
    expect(screen.getByRole('button', { name: 'Note Bb4 at bar 2, beat 1.5' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Selected note pitch' }), { target: { value: '60' } })
    expect(onEdit).toHaveBeenCalledWith([{ ...note, pitch: 60 }])
  })

  it('moves the start while preserving length and converts beat durations', () => {
    const { onEdit } = setup()
    change('Selected note start bar', '3')
    expect(onEdit.mock.calls[0][0][0]).toMatchObject({ startMs: 4250, endMs: 4750 })
    change('Selected note duration', '2')
    expect(onEdit.mock.calls[1][0][0]).toMatchObject({ startMs: 2250, endMs: 3250 })
  })

  it('counts eighth-note beats in 6/8 and handles triplet replacement positions', () => {
    const { onRangeChange } = setup({ meter: '6/8', quantization: 'eighth-triplet' }, { ...note, startMs: 1500, endMs: 1750 })
    expect(value('Selected note start bar')).toBe('2')
    expect(value('Selected note start beat')).toBe('1')
    expect(value('Selected note duration')).toBe('1')
    change('Replacement start beat', '1.666667')
    expect(onRangeChange.mock.calls[0][0].startMs).toBeCloseTo(500 / 3)
  })

  it('uses three beats per bar in 3/4 and carries a boundary into the next bar', () => {
    const { onEdit } = setup({ meter: '3/4' })
    expect(value('Selected note start bar')).toBe('2')
    expect(value('Selected note start beat')).toBe('2.5')
    change('Selected note start beat', '4')
    expect(onEdit.mock.calls[0][0][0]).toMatchObject({ startMs: 3000, endMs: 3500 })
  })

  it('never alters precise timing when changing units or blurring rounded displays', () => {
    const { onEdit } = setup({ quantization: 'sixteenth-triplet' }, { ...note, startMs: 2250.123456789, endMs: 2790.987654321 })
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Selected note start beat' }))
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Selected note duration' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Editor timing units' }), { target: { value: 'ms' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Selected note startMs' }))
    expect(onEdit).not.toHaveBeenCalled()
    change('Selected note startMs', '2251.25')
    expect(onEdit.mock.calls[0][0][0].startMs).toBe(2251.25)
    expect(onEdit.mock.calls[0][0][0].endMs - onEdit.mock.calls[0][0][0].startMs).toBeCloseTo(540.864197532)
  })

  it('defaults to exact milliseconds for unquantized input', () => {
    const { onRangeChange } = setup({ quantization: 'none' })
    expect(value('Selected note startMs')).toBe('2250')
    expect(screen.queryByRole('spinbutton', { name: 'Selected note start bar' })).toBeNull()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Replacement start' }), { target: { value: '137' } })
    expect(onRangeChange).toHaveBeenCalledWith({ startMs: 137, endMs: 2000 })
  })
})
