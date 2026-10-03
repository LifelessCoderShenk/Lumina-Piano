import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../TranscriptorMode/ScoreSheet', () => ({
  ScoreSheet: ({ score, selectedIds }: { score: { measures: unknown[] }; selectedIds: string[] }) => (
    <div data-testid="score" data-measures={score.measures.length} data-selected={selectedIds.join(',')} />
  ),
}))

const { CreateScoreOverlay } = await import('./CreateScoreOverlay')
const { resetStore, useAppStore } = await import('../../store/store')

describe('CreateScoreOverlay', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.setState({
      currentTick: 0,
      projectData: {
        ticksPerQuarter: 480,
        totalTicks: 3840,
        tempoMap: [{ tick: 0, bpm: 120, microsecondsPerBeat: 500_000 }],
        timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
        tracks: [{ id: 'P1', name: 'Piano', channel: 0, notes: [
          { id: 'xml-0-0', pitch: 60, velocity: 80, startTick: 0, endTick: 480, visualEndTick: 480 },
          { id: 'xml-0-1', pitch: 64, velocity: 80, startTick: 1920, endTick: 2400, visualEndTick: 2400 },
        ] }],
      },
    })
  })
  afterEach(() => { cleanup(); resetStore() })

  it('follows playback by measure and highlights sounding notes', () => {
    render(<CreateScoreOverlay />)
    expect(screen.getByText('Measure 1')).toBeTruthy()
    expect(screen.getByTestId('score').getAttribute('data-selected')).toBe('xml-0-0')

    act(() => useAppStore.setState({ currentTick: 2000 }))
    expect(screen.getByText('Measure 2')).toBeTruthy()
    expect(screen.getByTestId('score').getAttribute('data-selected')).toBe('xml-0-1')
  })

  it('changes sheet size and opacity directly in the Create preview', () => {
    render(<CreateScoreOverlay />)
    const panel = screen.getByRole('region', { name: 'Synchronized sheet music' })

    expect(panel.getAttribute('data-size')).toBe('standard')
    fireEvent.click(screen.getByRole('button', { name: 'Make sheet music larger' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Sheet music opacity' }), {
      target: { value: '70' },
    })

    expect(useAppStore.getState().scoreOverlaySize).toBe('large')
    expect(useAppStore.getState().scoreOverlayOpacity).toBe(70)
    expect(panel.getAttribute('data-size')).toBe('large')
    expect(panel.style.opacity).toBe('0.7')
  })
})
