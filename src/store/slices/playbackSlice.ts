import type { StateCreator } from 'zustand'

import type { AppActions, AppStore, PlaybackSlice } from '../types'
import { clamp, normalizeTick } from '../validation'

type PlaybackStoreSlice = PlaybackSlice & Pick<AppActions, 'setCurrentTick' | 'setIsPlaying' | 'setLoop'>

export const createPlaybackSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  PlaybackStoreSlice
> = (set, get) => ({
  currentTick: 0,
  isPlaying: false,
  loopEnabled: false,
  loopEndTick: 0,
  loopStartTick: 0,

  setCurrentTick: (tick) => {
    const normalizedTick = normalizeTick(tick)
    const maxTick = get().projectData?.totalTicks ?? Number.POSITIVE_INFINITY

    set((state) => {
      state.currentTick = clamp(normalizedTick, 0, maxTick)
    })
  },

  setIsPlaying: (playing) => {
    set((state) => {
      state.isPlaying = Boolean(playing)
    })
  },

  setLoop: (enabled, startTick, endTick) => {
    const currentState = get()
    const maxTick = currentState.projectData?.totalTicks ?? Number.POSITIVE_INFINITY
    const nextStart = clamp(
      normalizeTick(startTick ?? currentState.loopStartTick),
      0,
      maxTick,
    )
    const unclampedEnd = clamp(
      normalizeTick(endTick ?? currentState.loopEndTick),
      0,
      maxTick,
    )
    const nextEnd = Math.max(nextStart, unclampedEnd)

    set((state) => {
      state.loopEnabled = Boolean(enabled)
      state.loopStartTick = nextStart
      state.loopEndTick = nextEnd
    })
  },
})
