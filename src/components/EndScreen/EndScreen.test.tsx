import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAppState, resetStore, useAppStore } from '../../store/store'
import { EndScreen } from './EndScreen'

describe('EndScreen', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.getState().setSelectedSong('song-1')
    useAppStore.getState().setSessionConfig({
      hand: 'both',
      mode: 'noteByNote',
      tempoMultiplier: 1,
    })
    useAppStore.getState().setAppMode('learnEnd')
    window.electronAPI = createElectronApiMock()
  })

  afterEach(() => {
    cleanup()
    resetStore()
    vi.restoreAllMocks()
  })

  it('renders song title from getSongs', async () => {
    render(<EndScreen />)

    expect(await screen.findByText('Moonlight Sonata')).toBeTruthy()
  })

  it('colors the accuracy percentage green, yellow, and red by threshold', async () => {
    useAppStore.getState().batchUpdate((state) => {
      state.learnV3.stats.correct = 8
      state.learnV3.stats.wrong = 1
      state.learnV3.stats.missed = 1
    })

    const { rerender } = render(<EndScreen />)
    expect((await screen.findByText('80%')).style.color).toBe('rgb(16, 185, 129)')

    useAppStore.getState().batchUpdate((state) => {
      state.learnV3.stats.correct = 5
      state.learnV3.stats.wrong = 3
      state.learnV3.stats.missed = 2
    })
    rerender(<EndScreen />)
    expect(screen.getByText('50%').style.color).toBe('rgb(245, 158, 11)')

    useAppStore.getState().batchUpdate((state) => {
      state.learnV3.stats.correct = 2
      state.learnV3.stats.wrong = 3
      state.learnV3.stats.missed = 5
    })
    rerender(<EndScreen />)
    expect(screen.getByText('20%').style.color).toBe('rgb(239, 68, 68)')
  })

  it('renders all five stats correctly', async () => {
    useAppStore.getState().batchUpdate((state) => {
      state.learnV3.stats.correct = 21
      state.learnV3.stats.wrong = 4
      state.learnV3.stats.missed = 3
      state.learnV3.stats.bestStreak = 9
    })

    render(<EndScreen />)
    await screen.findByText('Moonlight Sonata')

    expect(screen.getByText('21')).toBeTruthy()
    expect(screen.getByText('28')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('NOTES HIT')).toBeTruthy()
    expect(screen.getByText('TOTAL NOTES')).toBeTruthy()
    expect(screen.getByText('WRONG')).toBeTruthy()
    expect(screen.getByText('MISSED')).toBeTruthy()
    expect(screen.getByText('BEST STREAK')).toBeTruthy()
  })

  it('play again calls exitSession, startSession, and navigates to learnSession', async () => {
    useAppStore.getState().batchUpdate((state) => {
      state.learnV3.stats.correct = 12
      state.learnV3.stats.wrong = 2
      state.learnV3.stats.missed = 1
      state.learnV3.currentChordIndex = 5
      state.learnV3.isActive = true
      state.learnV3.sessionState = 'ended'
    })

    render(<EndScreen />)
    fireEvent.click(await screen.findByRole('button', { name: '▶ PLAY AGAIN' }))

    expect(getAppState().appMode).toBe('learnSession')
    expect(getAppState().learnV3.sessionState).toBe('playing')
    expect(getAppState().learnV3.isActive).toBe(true)
    expect(getAppState().learnV3.currentChordIndex).toBe(0)
    expect(getAppState().learnV3.stats).toEqual({
      bestStreak: 0,
      correct: 0,
      missed: 0,
      streak: 0,
      wrong: 0,
    })
  })

  it('back to song calls exitSession and navigates to learnSong', async () => {
    useAppStore.getState().startSession()

    render(<EndScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'BACK TO SONG' }))

    expect(getAppState().appMode).toBe('learnSong')
    expect(getAppState().learnV3.isActive).toBe(false)
    expect(getAppState().learnV3.sessionState).toBe('idle')
  })

  it('back arrow calls exitSession and navigates to learn home', async () => {
    useAppStore.getState().startSession()

    render(<EndScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Back to learn home' }))

    expect(getAppState().appMode).toBe('learn')
    expect(getAppState().learnV3.isActive).toBe(false)
    expect(getAppState().learnV3.sessionState).toBe('idle')
  })

  it('shows 0% for zero stats without crashing', async () => {
    render(<EndScreen />)

    expect(await screen.findByText('0%')).toBeTruthy()
  })
})

function createElectronApiMock() {
  return {
    getSongs: vi.fn(async () => [
      {
        composer: 'Ludwig van Beethoven',
        difficulty: 'advanced',
        file: 'moonlight.mid',
        id: 'song-1',
        source: 'built-in',
        title: 'Moonlight Sonata',
      },
    ]),
  } as typeof window.electronAPI
}
