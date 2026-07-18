import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
