import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { EditPanel } = await import('./EditPanel')
const { resetStore, useAppStore } = await import('../../store/store')

describe('EditPanel', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders at 25% width with TopBar, SecondBar, and the split body', () => {
    render(<EditPanel />)

    const panel = screen.getByTestId('edit-panel')
    expect(panel.style.width).toBe('25%')
    expect(panel.style.flexBasis).toBe('25%')
    expect(screen.getByTestId('top-bar')).toBeTruthy()
    expect(screen.getByTestId('second-bar')).toBeTruthy()
    expect(screen.getByTestId('edit-panel-body')).toBeTruthy()
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
    expect(screen.getByTestId('pieces-column')).toBeTruthy()
    expect(screen.getByTestId('edit-panel-divider')).toBeTruthy()
  })

  it('switches the body when tabs change', () => {
    render(<EditPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Particles' }))
    expect(screen.getByTestId('particles-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Color Picker' }))
    expect(screen.getByTestId('color-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pieces' }))
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
    expect(screen.getByTestId('pieces-column')).toBeTruthy()
  })

  it('shows and hides the settings panel from the top bar', () => {
    render(<EditPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByTestId('settings-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByTestId('settings-panel')).toBeNull()
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
  })

  it('shows camera controls automatically in Camera Mode and returns to pieces on back', () => {
    useAppStore.setState({ activeSecondBarTab: 'camera', appMode: 'createCamera' })

    render(<EditPanel />)

    expect(screen.getByTestId('camera-controls-panel')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Camera' })[1]?.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '← Pieces' }))
    expect(screen.getByTestId('piece-files-column')).toBeTruthy()
    expect(useAppStore.getState().activeSecondBarTab).toBe('pieces')
  })
})
