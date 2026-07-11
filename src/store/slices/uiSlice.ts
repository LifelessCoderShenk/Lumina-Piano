import type { StateCreator } from 'zustand'

import { createExportDefaults } from '../defaults'
import type { AppActions, AppStore, UISlice } from '../types'
import {
  clamp,
  validateActivePanel,
  validateCreateTab,
  validateFiniteStateNumber,
  validateOptionalString,
} from '../validation'

type UIStoreSlice =
  & UISlice
  & Pick<
    AppActions,
    | 'setActivePanel'
    | 'setActiveSecondBarTab'
    | 'setErrorMessage'
    | 'setExportProgress'
    | 'setIsExporting'
  >

export const createUISlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  UIStoreSlice
> = (set) => ({
  appMode: 'create',
  activeSecondBarTab: 'pieces',
  activePanel: null,
  errorMessage: null,
  ...createExportDefaults(),

  setActivePanel: (panel) => {
    validateActivePanel(panel)

    set((state) => {
      state.activePanel = panel
    })
  },

  setActiveSecondBarTab: (tab) => {
    validateCreateTab(tab)

    set((state) => {
      state.activeSecondBarTab = tab
    })
  },

  setExportProgress: (progress, framesRendered, totalFrames, estimatedSeconds) => {
    validateFiniteStateNumber(progress, 'exportProgress')
    validateFiniteStateNumber(framesRendered, 'exportFramesRendered')
    validateFiniteStateNumber(totalFrames, 'exportTotalFrames')
    validateFiniteStateNumber(estimatedSeconds, 'exportEstimatedSecondsRemaining')

    set((state) => {
      state.exportProgress = clamp(progress, 0, 1)
      state.exportFramesRendered = Math.max(0, Math.floor(framesRendered))
      state.exportTotalFrames = Math.max(0, Math.floor(totalFrames))
      state.exportEstimatedSecondsRemaining = Math.max(0, estimatedSeconds)
    })
  },

  setIsExporting: (exporting) => {
    set((state) => {
      state.isExporting = Boolean(exporting)
    })
  },

  setErrorMessage: (message) => {
    validateOptionalString(message, 'errorMessage')

    set((state) => {
      state.errorMessage = message
    })
  },
})
