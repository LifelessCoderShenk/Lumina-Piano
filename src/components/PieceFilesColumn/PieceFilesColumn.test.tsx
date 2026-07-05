import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { PieceFilesColumn } = await import('./PieceFilesColumn')
const { resetStore, useAppStore } = await import('../../store/store')

describe('PieceFilesColumn', () => {
  beforeEach(() => {
    resetStore()
    applyDesignTokens()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders New Piece File as active and Sample Pieces as a placeholder button', () => {
    render(<PieceFilesColumn />)

    const column = screen.getByTestId('piece-files-column')
    const heading = screen.getByRole('heading', { name: 'Piece Files' })
    const activeButton = screen.getByRole('button', { name: 'New Piece File' })
    const sampleButton = screen.getByRole('button', { name: 'Sample Pieces' })
    const learnButton = screen.getByRole('button', { name: 'Learn' })

    expect(column.style.backgroundColor).toBe('var(--color-bg)')
    expect(heading.style.color).toBe('var(--color-text-header)')
    expect(activeButton.getAttribute('aria-pressed')).toBe('true')
    expect(activeButton.style.backgroundColor).toBe('var(--color-icon)')
    expect(activeButton.style.color).toBe('var(--color-text-body)')
    expect(sampleButton.style.color).toBe('var(--color-text-body)')
    expect(sampleButton.getAttribute('aria-disabled')).toBe('true')
    expect(sampleButton.style.pointerEvents).toBe('none')
    expect(sampleButton.style.opacity).toBe('0.4')
    expect(sampleButton.style.cursor).toBe('default')
    expect(sampleButton.style.borderBottom).toContain('1px')
    expect(learnButton).toBeTruthy()
  })

  it('keeps Sample Pieces non-functional for now', () => {
    render(<PieceFilesColumn />)

    fireEvent.click(screen.getByRole('button', { name: 'Sample Pieces' }))

    expect(useAppStore.getState().pieces).toHaveLength(0)
    expect(useAppStore.getState().isProjectLoaded).toBe(false)
  })

  it('opens Learn Mode from the Learn button', () => {
    render(<PieceFilesColumn />)

    fireEvent.click(screen.getByRole('button', { name: 'Learn' }))

    expect(useAppStore.getState().appMode).toBe('learn')
  })
})

function applyDesignTokens() {
  document.documentElement.style.setProperty('--color-bg', '#000000')
  document.documentElement.style.setProperty('--color-icon', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-header', '#2e65a2')
  document.documentElement.style.setProperty('--color-text-body', '#ffffff')
  document.documentElement.style.setProperty('--font-family-base', 'Arial, sans-serif')
}
