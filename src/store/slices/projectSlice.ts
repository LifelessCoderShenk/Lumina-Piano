import type { StateCreator } from 'zustand'

import { createInitialAppState } from '../defaults'
import type { AppActions, AppStore, ProjectSlice } from '../types'

type ProjectStoreSlice = ProjectSlice & Pick<AppActions, 'unloadProject'>

export const createProjectSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  ProjectStoreSlice
> = (set) => ({
  projectData: null,
  precomputedTempoMap: null,
  isProjectLoaded: false,

  unloadProject: () => {
    set(() => createInitialAppState())
  },
})
