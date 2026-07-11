import type { StateCreator } from 'zustand'

import { createVisualizerSettingsDefaults } from '../defaults'
import type { AppActions, AppStore, VisualizerSettingsSlice } from '../types'
import {
  clamp,
  validateColorMode,
  validateFiniteStateNumber,
  validateHexColor,
  validateNoteGradientDirection,
  validateNoteLabelFormat,
  validateNoteStyle,
  validatePitchClass,
} from '../validation'

type VisualizerAppearanceStoreSlice =
  & VisualizerSettingsSlice
  & Pick<
    AppActions,
    | 'setBackgroundColor'
    | 'setColorMode'
    | 'setGradientBottomColorLeft'
    | 'setGradientBottomColorLeftBlack'
    | 'setGradientBottomColorRight'
    | 'setGradientBottomColorRightBlack'
    | 'setGradientTopColor'
    | 'setLaneOpacity'
    | 'setLeftHandColor'
    | 'setNoteGradientDirection'
    | 'setNoteLabelColor'
    | 'setNoteLabelFormat'
    | 'setNoteLabelsOnKeys'
    | 'setNoteLabelsOnNotes'
    | 'setNoteLabelSize'
    | 'setNoteStyle'
    | 'setPitchClassColor'
    | 'setRightHandColor'
    | 'setSplitPitch'
    | 'setVelocityColors'
  >

export const createVisualizerAppearanceSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  VisualizerAppearanceStoreSlice
> = (set, _get) => ({
  ...createVisualizerSettingsDefaults(),

  setColorMode: (mode) => {
    validateColorMode(mode)

    set((state) => {
      state.colorMode = mode
    })
  },

  setPitchClassColor: (pitchClass, color) => {
    validatePitchClass(pitchClass)
    validateHexColor(color)

    set((state) => {
      state.pitchClassColors = {
        ...state.pitchClassColors,
        [pitchClass]: color,
      }
    })
  },

  setSplitPitch: (pitch) => {
    validateFiniteStateNumber(pitch, 'splitPitch')

    set((state) => {
      state.splitPitch = clamp(Math.round(pitch), 21, 108)
    })
  },

  setLeftHandColor: (color) => {
    validateHexColor(color)

    set((state) => {
      state.leftHandColor = color
    })
  },

  setRightHandColor: (color) => {
    validateHexColor(color)

    set((state) => {
      state.rightHandColor = color
    })
  },

  setVelocityColors: (low, high) => {
    validateHexColor(low)
    validateHexColor(high)

    set((state) => {
      state.velocityLowColor = low
      state.velocityHighColor = high
    })
  },

  setNoteStyle: (style) => {
    validateNoteStyle(style)

    set((state) => {
      state.noteStyle = style
    })
  },

  setNoteGradientDirection: (direction) => {
    validateNoteGradientDirection(direction)

    set((state) => {
      state.noteGradientDirection = direction
    })
  },

  setGradientTopColor: (color) => {
    validateHexColor(color)

    set((state) => {
      state.gradientTopColor = color
    })
  },

  setGradientBottomColorRight: (color) => {
    validateHexColor(color)

    set((state) => {
      state.gradientBottomColorRight = color
    })
  },

  setGradientBottomColorLeft: (color) => {
    validateHexColor(color)

    set((state) => {
      state.gradientBottomColorLeft = color
    })
  },

  setGradientBottomColorRightBlack: (color) => {
    validateHexColor(color)

    set((state) => {
      state.gradientBottomColorRightBlack = color
    })
  },

  setGradientBottomColorLeftBlack: (color) => {
    validateHexColor(color)

    set((state) => {
      state.gradientBottomColorLeftBlack = color
    })
  },

  setBackgroundColor: (color) => {
    validateHexColor(color)

    set((state) => {
      state.backgroundColor = color
    })
  },

  setLaneOpacity: (value) => {
    validateFiniteStateNumber(value, 'laneOpacity')

    set((state) => {
      state.laneOpacity = clamp(Math.round(value), 0, 100)
    })
  },

  setNoteLabelsOnNotes: (value) => {
    set((state) => {
      state.noteLabelsOnNotes = Boolean(value)
    })
  },

  setNoteLabelsOnKeys: (value) => {
    set((state) => {
      state.noteLabelsOnKeys = Boolean(value)
    })
  },

  setNoteLabelFormat: (format) => {
    validateNoteLabelFormat(format)

    set((state) => {
      state.noteLabelFormat = format
    })
  },

  setNoteLabelColor: (color) => {
    validateHexColor(color)

    set((state) => {
      state.noteLabelColor = color
    })
  },

  setNoteLabelSize: (size) => {
    validateFiniteStateNumber(size, 'noteLabelSize')

    set((state) => {
      state.noteLabelSize = clamp(Math.round(size), 8, 16)
    })
  },
})
