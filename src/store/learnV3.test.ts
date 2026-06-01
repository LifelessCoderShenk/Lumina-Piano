import { beforeEach, describe, expect, it } from 'vitest'

import { getAppState, resetStore, useAppStore } from './store'

beforeEach(() => {
  resetStore()
})

describe('learnV3 initial state', () => {
  it('uses the expected defaults', () => {
    expect(getAppState().learnV3).toEqual({
      currentChordIndex: 0,
      fingerNumbers: {},
      isActive: false,
      midi: {
        available: false,
        connectedDeviceId: null,
        connectionStatus: 'disconnected',
        devices: [],
      },
      selectedSongId: null,
      sessionConfig: {
        hand: 'both',
        mode: null,
        tempoMultiplier: 1,
      },
      sessionState: 'idle',
      stats: {
        bestStreak: 0,
        correct: 0,
        missed: 0,
        streak: 0,
        wrong: 0,
      },
    })
  })
})

describe('learnV3 actions', () => {
  it('sets and clears the selected song', () => {
    useAppStore.getState().setSelectedSong('song-1')
    expect(getAppState().learnV3.selectedSongId).toBe('song-1')

    useAppStore.getState().setSelectedSong(null)
    expect(getAppState().learnV3.selectedSongId).toBeNull()
  })

  it('updates and resets session config', () => {
    useAppStore.getState().setSessionConfig({
      hand: 'left',
      mode: 'playAlong',
      tempoMultiplier: 0.75,
    })

    expect(getAppState().learnV3.sessionConfig).toEqual({
      hand: 'left',
      mode: 'playAlong',
      tempoMultiplier: 0.75,
    })

    useAppStore.getState().resetSessionConfig()
    expect(getAppState().learnV3.sessionConfig).toEqual({
      hand: 'both',
      mode: null,
      tempoMultiplier: 1,
    })
  })

  it('starts, ends, and exits a session', () => {
    useAppStore.getState().advanceChord()
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordWrong()
    useAppStore.getState().startSession()

    expect(getAppState().learnV3.isActive).toBe(true)
    expect(getAppState().learnV3.sessionState).toBe('playing')
    expect(getAppState().learnV3.currentChordIndex).toBe(0)
    expect(getAppState().learnV3.stats).toEqual({
      bestStreak: 0,
      correct: 0,
      missed: 0,
      streak: 0,
      wrong: 0,
    })

    useAppStore.getState().endSession()
    expect(getAppState().learnV3.sessionState).toBe('ended')

    useAppStore.getState().exitSession()
    expect(getAppState().learnV3.isActive).toBe(false)
    expect(getAppState().learnV3.sessionState).toBe('idle')
    expect(getAppState().learnV3.currentChordIndex).toBe(0)
  })

  it('advances chords', () => {
    useAppStore.getState().advanceChord()
    useAppStore.getState().advanceChord()

    expect(getAppState().learnV3.currentChordIndex).toBe(2)
  })

  it('sets current chord index directly and toggles learn active state', () => {
    useAppStore.getState().setCurrentChordIndex(4.8)
    useAppStore.getState().setLearnActive(true)

    expect(getAppState().learnV3.currentChordIndex).toBe(4)
    expect(getAppState().learnV3.isActive).toBe(true)

    useAppStore.getState().setLearnActive(false)
    expect(getAppState().learnV3.isActive).toBe(false)
  })

  it('tracks correct answers and best streak growth', () => {
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordWrong()
    useAppStore.getState().recordCorrect()

    expect(getAppState().learnV3.stats).toEqual({
      bestStreak: 2,
      correct: 3,
      missed: 0,
      streak: 1,
      wrong: 1,
    })
  })

  it('tracks wrong and missed answers by resetting streak', () => {
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordMissed()
    useAppStore.getState().recordCorrect()
    useAppStore.getState().recordWrong()

    expect(getAppState().learnV3.stats).toEqual({
      bestStreak: 1,
      correct: 2,
      missed: 1,
      streak: 0,
      wrong: 1,
    })
  })

  it('replaces finger numbers', () => {
    useAppStore.getState().setFingerNumbers({
      'note-1': 1,
      'note-2': 5,
    })

    expect(getAppState().learnV3.fingerNumbers).toEqual({
      'note-1': 1,
      'note-2': 5,
    })
  })

  it('updates midi availability, devices, connected device, and status', () => {
    useAppStore.getState().setMidiAvailable(true)
    useAppStore.getState().setMidiDevices([
      { id: 'device-1', name: 'Keyboard 1' },
      { id: 'device-2', name: 'Keyboard 2' },
    ])
    useAppStore.getState().setConnectedDevice('device-2')
    useAppStore.getState().setConnectionStatus('connected')

    expect(getAppState().learnV3.midi).toEqual({
      available: true,
      connectedDeviceId: 'device-2',
      connectionStatus: 'connected',
      devices: [
        { id: 'device-1', name: 'Keyboard 1' },
        { id: 'device-2', name: 'Keyboard 2' },
      ],
    })
  })
})
