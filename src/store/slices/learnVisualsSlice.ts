import type { StateCreator } from 'zustand'

import { learnVisualsInitial } from '../defaults'
import type { AppActions, AppStore } from '../types'
import {
  clamp,
  validateFiniteStateNumber,
  validateHexColor,
  validateLearnNoteColorMode,
  validateLearnVisuals,
} from '../validation'

type LearnVisualsStoreSlice = {
  learnVisuals: AppStore['learnVisuals']
} & Pick<AppActions, 'setLearnVisuals' | 'setLearnVisualsPreset'>

export const createLearnVisualsSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  LearnVisualsStoreSlice
> = (set) => ({
  learnVisuals: { ...learnVisualsInitial },

  setLearnVisuals: (patch) => {
    if (patch.noteColor != null) {
      validateLearnNoteColorMode(patch.noteColor)
    }
    if (patch.leftHandColor != null) {
      validateHexColor(patch.leftHandColor)
    }
    if (patch.rightHandColor != null) {
      validateHexColor(patch.rightHandColor)
    }
    if (patch.noteOpacity != null) {
      validateFiniteStateNumber(patch.noteOpacity, 'learnVisuals.noteOpacity')
    }

    set((state) => {
      if (patch.noteColor != null) {
        state.learnVisuals.noteColor = patch.noteColor
      }
      if (patch.leftHandColor != null) {
        state.learnVisuals.leftHandColor = patch.leftHandColor
      }
      if (patch.rightHandColor != null) {
        state.learnVisuals.rightHandColor = patch.rightHandColor
      }
      if (patch.noteOpacity != null) {
        state.learnVisuals.noteOpacity = clamp(patch.noteOpacity, 0.3, 1)
      }
      if (patch.glowEnabled != null) {
        state.learnVisuals.glowEnabled = Boolean(patch.glowEnabled)
      }
      if (patch.noteLabelsEnabled != null) {
        state.learnVisuals.noteLabelsEnabled = Boolean(patch.noteLabelsEnabled)
      }
      if (patch.fingerNumbersEnabled != null) {
        state.learnVisuals.fingerNumbersEnabled = Boolean(patch.fingerNumbersEnabled)
      }
    })
  },

  setLearnVisualsPreset: (preset) => {
    validateLearnVisuals(preset)

    set((state) => {
      state.learnVisuals = {
        fingerNumbersEnabled: Boolean(preset.fingerNumbersEnabled),
        glowEnabled: Boolean(preset.glowEnabled),
        leftHandColor: preset.leftHandColor,
        noteColor: preset.noteColor,
        noteLabelsEnabled: Boolean(preset.noteLabelsEnabled),
        noteOpacity: clamp(preset.noteOpacity, 0.3, 1),
        rightHandColor: preset.rightHandColor,
      }
    })
  },
})
