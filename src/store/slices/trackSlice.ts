import type { StateCreator } from 'zustand'

import { createTrackDefaults } from '../defaults'
import type { AppActions, AppStore, TrackSlice } from '../types'
import { validateHexColor, validateTrackId } from '../validation'

type TrackStoreSlice =
  & TrackSlice
  & Pick<AppActions, 'initTrackDefaults' | 'setTrackColor' | 'setTrackMuted' | 'setTrackSoloed'>

export const createTrackSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  TrackStoreSlice
> = (set) => ({
  trackColors: {},
  trackMuted: {},
  trackSoloed: {},

  setTrackColor: (trackId, color) => {
    validateTrackId(trackId)
    validateHexColor(color)

    set((state) => {
      state.trackColors = {
        ...state.trackColors,
        [trackId]: color,
      }
    })
  },

  setTrackMuted: (trackId, muted) => {
    validateTrackId(trackId)

    set((state) => {
      state.trackMuted = {
        ...state.trackMuted,
        [trackId]: Boolean(muted),
      }
    })
  },

  setTrackSoloed: (trackId, soloed) => {
    validateTrackId(trackId)

    set((state) => {
      state.trackSoloed = {
        ...state.trackSoloed,
        [trackId]: Boolean(soloed),
      }
    })
  },

  initTrackDefaults: (tracks) => {
    const trackDefaults = createTrackDefaults(tracks)

    set((state) => {
      state.trackColors = trackDefaults.trackColors
      state.trackMuted = trackDefaults.trackMuted
      state.trackSoloed = trackDefaults.trackSoloed
    })
  },
})
