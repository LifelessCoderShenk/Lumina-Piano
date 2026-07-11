import type { StateCreator } from 'zustand'

import { learnV3Initial } from '../defaults'
import type { AppActions, AppStore } from '../types'
import { validateFiniteStateNumber, validateOptionalString } from '../validation'

type LearnStoreSlice = {
  learnV3: AppStore['learnV3']
} & Pick<
  AppActions,
  | 'advanceChord'
  | 'endSession'
  | 'exitSession'
  | 'recordCorrect'
  | 'recordMissed'
  | 'recordWrong'
  | 'resetSessionConfig'
  | 'setConnectedDevice'
  | 'setConnectionStatus'
  | 'setCurrentChordIndex'
  | 'setFingerNumbers'
  | 'setLearnActive'
  | 'setMidiAvailable'
  | 'setMidiDevices'
  | 'setSelectedSong'
  | 'setSessionConfig'
  | 'startSession'
>

export const createLearnSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  LearnStoreSlice
> = (set) => ({
  learnV3: structuredClone(learnV3Initial),

  setSelectedSong: (id) => {
    validateOptionalString(id, 'selectedSongId')

    set((state) => {
      state.learnV3.selectedSongId = id
    })
  },

  setSessionConfig: (config) => {
    set((state) => {
      Object.assign(state.learnV3.sessionConfig, config)
    })
  },

  resetSessionConfig: () => {
    set((state) => {
      state.learnV3.sessionConfig = { ...learnV3Initial.sessionConfig }
    })
  },

  startSession: () => {
    set((state) => {
      state.learnV3.isActive = true
      state.learnV3.sessionState = 'playing'
      state.learnV3.currentChordIndex = 0
      state.learnV3.stats = { ...learnV3Initial.stats }
    })
  },

  endSession: () => {
    set((state) => {
      state.learnV3.sessionState = 'ended'
    })
  },

  exitSession: () => {
    set((state) => {
      state.learnV3.isActive = false
      state.learnV3.sessionState = 'idle'
      state.learnV3.currentChordIndex = 0
    })
  },

  advanceChord: () => {
    set((state) => {
      state.learnV3.currentChordIndex += 1
    })
  },

  setCurrentChordIndex: (index) => {
    validateFiniteStateNumber(index, 'currentChordIndex')

    set((state) => {
      state.learnV3.currentChordIndex = Math.max(0, Math.floor(index))
    })
  },

  setLearnActive: (active) => {
    set((state) => {
      state.learnV3.isActive = Boolean(active)
    })
  },

  recordCorrect: () => {
    set((state) => {
      const stats = state.learnV3.stats
      stats.correct += 1
      stats.streak += 1
      if (stats.streak > stats.bestStreak) {
        stats.bestStreak = stats.streak
      }
    })
  },

  recordWrong: () => {
    set((state) => {
      state.learnV3.stats.wrong += 1
      state.learnV3.stats.streak = 0
    })
  },

  recordMissed: () => {
    set((state) => {
      state.learnV3.stats.missed += 1
      state.learnV3.stats.streak = 0
    })
  },

  setFingerNumbers: (map) => {
    set((state) => {
      state.learnV3.fingerNumbers = map
    })
  },

  setMidiAvailable: (available) => {
    set((state) => {
      state.learnV3.midi.available = available
    })
  },

  setMidiDevices: (devices) => {
    set((state) => {
      state.learnV3.midi.devices = devices
    })
  },

  setConnectedDevice: (id) => {
    validateOptionalString(id, 'connectedDeviceId')

    set((state) => {
      state.learnV3.midi.connectedDeviceId = id
    })
  },

  setConnectionStatus: (status) => {
    set((state) => {
      state.learnV3.midi.connectionStatus = status
    })
  },
})
