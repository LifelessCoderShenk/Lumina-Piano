import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CREATE_PITCH_CLASS_PALETTES } from '../../store/createNoteColorPalettes'
import { resetStore, useAppStore } from '../../store/store'
import { CreateColorPanel } from './CreateColorPanel'

describe('CreateColorPanel', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    resetStore()
  })

  it('renders single-color mode by default', () => {
    render(<CreateColorPanel />)

    expect(screen.getByText('CREATE NOTE COLORS')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Create note color mode' })).toBeTruthy()
    expect(screen.getByLabelText('Single note color')).toBeTruthy()
    expect(screen.queryByLabelText('C pitch class color')).toBeNull()
  })

  it('switches to pitch-class mode and shows the chromatic grid', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Class' }))

    expect(useAppStore.getState().createNoteColors.mode).toBe('pitchClass')
    expect(screen.getByLabelText('C pitch class color')).toBeTruthy()
    expect(screen.getByLabelText('A pitch class color')).toBeTruthy()
    expect(screen.getByLabelText('B pitch class color')).toBeTruthy()
    expect(screen.queryByLabelText('Single note color')).toBeNull()
  })

  it('applies a palette at once and shows Custom after an individual pitch edit', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Class' }))
    const paletteSelect = screen.getByRole('combobox', { name: 'Pitch class palette' })
    fireEvent.change(paletteSelect, { target: { value: 'aurora' } })

    expect(useAppStore.getState().createNoteColors.pitchClassColors).toEqual(
      CREATE_PITCH_CLASS_PALETTES.find((palette) => palette.id === 'aurora')?.colors,
    )
    expect((paletteSelect as HTMLSelectElement).value).toBe('aurora')

    fireEvent.change(screen.getByLabelText('A pitch class color'), {
      target: { value: '#123456' },
    })

    expect((screen.getByRole('combobox', { name: 'Pitch class palette' }) as HTMLSelectElement).value).toBe('custom')
  })

  it('shows a low-red to high-violet preview for Gradient mode', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Gradient' }))

    expect(useAppStore.getState().createNoteColors.mode).toBe('gradient')
    expect(screen.getByLabelText('Low red to high violet rainbow gradient')).toBeTruthy()
    expect(screen.queryByLabelText('C pitch class color')).toBeNull()
  })

  it('uses note velocity to configure soft and strong colors', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Dynamics' }))
    fireEvent.change(screen.getByLabelText('Soft note color'), { target: { value: '#112233' } })
    fireEvent.change(screen.getByLabelText('Strong note color'), { target: { value: '#ddeeff' } })

    expect(useAppStore.getState().createNoteColors).toMatchObject({
      mode: 'velocity',
      velocityLowColor: '#112233',
      velocityHighColor: '#ddeeff',
    })
    expect(screen.getByLabelText('Soft to strong velocity color preview')).toBeTruthy()
  })

  it('enables timeline-based Flow colors without adding configuration clutter', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }))

    expect(useAppStore.getState().createNoteColors.mode).toBe('dynamic')
    expect(screen.getByLabelText('Colors flow through the performance timeline')).toBeTruthy()
    expect(screen.queryByLabelText('Single note color')).toBeNull()
  })

  it('enables stable per-note Random colors with one click', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Random' }))

    expect(useAppStore.getState().createNoteColors.mode).toBe('random')
    expect(screen.getByLabelText('Each note receives a stable random color')).toBeTruthy()
  })

  it('applies the Tutorial blue-and-green split and charcoal background together', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Tutorial' }))

    expect(useAppStore.getState().createNoteColors.mode).toBe('tutorial')
    expect(useAppStore.getState().backgroundColor).toBe('#303030')
    expect(screen.getByLabelText('Tutorial preset: blue lower notes, green upper notes, charcoal background')).toBeTruthy()
  })

  it('restores the dark background when switching away from Tutorial', () => {
    render(<CreateColorPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Tutorial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Single' }))

    expect(useAppStore.getState().createNoteColors.mode).toBe('single')
    expect(useAppStore.getState().backgroundColor).toBe('#000000')
  })

  it('updates Create Mode color settings in the store', () => {
    render(<CreateColorPanel />)

    fireEvent.change(screen.getByLabelText('Single note color'), {
      target: { value: '#ff0000' },
    })
    expect(useAppStore.getState().createNoteColors.singleColor).toBe('#ff0000')

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Class' }))
    const pitchClassColorInput = screen.getByLabelText('A pitch class color')
    fireEvent.change(pitchClassColorInput, {
      target: { value: '#123456' },
    })
    fireEvent.blur(pitchClassColorInput)

    expect(useAppStore.getState().createNoteColors.mode).toBe('pitchClass')
    expect(useAppStore.getState().createNoteColors.pitchClassColors[9]).toBe('#123456')
  })

  it('throttles drag color commits and flushes the pending color on blur', () => {
    vi.useFakeTimers()
    const performanceNowSpy = vi.spyOn(window.performance, 'now')
    let currentTime = 1000
    performanceNowSpy.mockImplementation(() => currentTime)

    render(<CreateColorPanel />)
    const singleColorInput = screen.getByLabelText('Single note color')

    fireEvent.change(singleColorInput, {
      target: { value: '#111111' },
    })
    expect(useAppStore.getState().createNoteColors.singleColor).toBe('#111111')

    currentTime += 20
    fireEvent.change(singleColorInput, {
      target: { value: '#222222' },
    })
    expect(useAppStore.getState().createNoteColors.singleColor).toBe('#111111')

    fireEvent.blur(singleColorInput)
    expect(useAppStore.getState().createNoteColors.singleColor).toBe('#222222')
  })
})
