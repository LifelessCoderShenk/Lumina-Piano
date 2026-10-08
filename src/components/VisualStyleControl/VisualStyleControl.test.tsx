import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'
import { VisualStyleControl } from './VisualStyleControl'

describe('VisualStyleControl', () => {
  beforeEach(() => { resetStore(); window.localStorage.clear() })
  afterEach(() => { cleanup(); window.localStorage.clear(); resetStore() })

  it('saves the current look and reapplies it after visual changes', () => {
    useAppStore.setState({ backgroundColor: '#123456', noteStyle: 'saber' })
    render(<VisualStyleControl />)
    fireEvent.click(screen.getByRole('button', { name: 'Save style' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Style name' }), { target: { value: 'Concert Blue' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((screen.getByRole('combobox', { name: 'Visual style' }) as HTMLSelectElement).value).not.toBe('')
    useAppStore.setState({ backgroundColor: '#000000', noteStyle: 'solid' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Visual style' }), {
      target: { value: JSON.parse(window.localStorage.getItem('lumina.visual-style-presets.v1')!)[0].id },
    })
    expect(useAppStore.getState()).toMatchObject({ backgroundColor: '#123456', noteStyle: 'saber' })
  })

  it('keeps naming hidden until requested', () => {
    render(<VisualStyleControl />)
    expect(screen.queryByRole('textbox', { name: 'Style name' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Visual style' })).toBeTruthy()
  })

  it('applies curated starter looks without storing them as user presets', () => {
    render(<VisualStyleControl />)

    expect(screen.getByRole('option', { name: 'Clean Studio' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Concert Gem' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Aurora Glass' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Visual style' }), {
      target: { value: 'builtin-concert-gem' },
    })

    expect(useAppStore.getState()).toMatchObject({
      backgroundStyle: 'stage',
      keyboardSaber: true,
      noteGlow: 125,
      noteStyle: 'gem',
      particleSettings: expect.objectContaining({ style: 'ray' }),
    })
    expect(window.localStorage.getItem('lumina.visual-style-presets.v1')).toBeNull()
    expect((screen.getByRole('button', { name: 'Delete selected style' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
