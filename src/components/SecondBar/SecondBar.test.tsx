import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { SecondBar } = await import('./SecondBar')
const { resetStore, useAppStore } = await import('../../store/store')

describe('SecondBar', () => {
  beforeEach(() => {
    resetStore()
    applyDesignTokens()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders 3 tabs with Pieces active', () => {
    useAppStore.setState({ appMode: 'create' })
    render(<SecondBar />)

    expect(screen.getByTestId('second-bar').style.backgroundColor).toBe('var(--color-bg)')
    expect(screen.getByRole('button', { name: 'Pieces' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Particles' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Color Picker' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('pieces-tab-icon').style.color).toBe('var(--color-icon)')
    expect(screen.getByTestId('particles-tab-icon').style.color).toBe('var(--color-icon)')
    expect((screen.getByText('Pieces') as HTMLSpanElement).style.color).toBe('var(--color-text-header)')
    expect((screen.getByText('Particles') as HTMLSpanElement).style.color).toBe('var(--color-text-body)')
    expect((screen.getByText('Color Picker') as HTMLSpanElement).style.color).toBe('var(--color-text-body)')
    expect(screen.getByTestId('color-tab-swatch').style.backgroundImage).toContain('linear-gradient')
  })

  it('updates the store when tabs are clicked', () => {
    useAppStore.setState({ appMode: 'create' })
    render(<SecondBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Particles' }))
    expect(useAppStore.getState().activeSecondBarTab).toBe('particles')

    fireEvent.click(screen.getByRole('button', { name: 'Color Picker' }))
    expect(useAppStore.getState().activeSecondBarTab).toBe('color')
  })

  it('shows the Camera tab only in Camera Mode', () => {
    useAppStore.setState({ appMode: 'create' })
    const view = render(<SecondBar />)
    expect(screen.queryByRole('button', { name: 'Camera' })).toBeNull()

    useAppStore.setState({ appMode: 'createCamera' })
    view.rerender(<SecondBar />)

    expect(screen.getByRole('button', { name: 'Camera' })).toBeTruthy()
    expect(screen.getByTestId('camera-tab-icon').style.color).toBe('var(--color-icon)')
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}
