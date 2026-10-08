import type { StateCreator } from 'zustand'

import { createVisualizerSettingsDefaults } from '../defaults'
import type { AppActions, AppStore, VisualizerSettingsSlice } from '../types'
import {
  clamp,
  validateColorMode,
  validateBackgroundStyle,
  validateFiniteStateNumber,
  validateHexColor,
  validateNoteGradientDirection,
  validateNoteLabelFormat,
  validateNoteStyle,
  validatePitchClass,
  validateScoreOverlaySize,
} from '../validation'

type VisualizerAppearanceStoreSlice =
  & VisualizerSettingsSlice
  & Pick<
    AppActions,
    | 'setBackgroundColor'
    | 'setBackgroundImage'
    | 'setBackgroundStyle'
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
    | 'setFallSpeed'
    | 'setNoteWidth'
    | 'setNoteOpacity'
    | 'setNoteGlow'
    | 'setLightingIntensity'
    | 'setKeyboardSaber'
    | 'setScoreOverlayOpacity'
    | 'setScoreOverlaySize'
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

  setFallSpeed: (value) => {
    validateFiniteStateNumber(value, 'fallSpeed')
    set((state) => { state.fallSpeed = clamp(Math.round(value), 50, 200) })
  },

  setNoteWidth: (value) => {
    validateFiniteStateNumber(value, 'noteWidth')
    set((state) => { state.noteWidth = clamp(Math.round(value), 60, 120) })
  },

  setNoteOpacity: (value) => {
    validateFiniteStateNumber(value, 'noteOpacity')
    set((state) => { state.noteOpacity = clamp(Math.round(value), 20, 100) })
  },

  setNoteGlow: (value) => {
    validateFiniteStateNumber(value, 'noteGlow')
    set((state) => { state.noteGlow = clamp(Math.round(value), 0, 200) })
  },

  setLightingIntensity: (value) => {
    validateFiniteStateNumber(value, 'lightingIntensity')
    set((state) => { state.lightingIntensity = clamp(Math.round(value), 0, 200) })
  },

  setKeyboardSaber: (value) => {
    set((state) => { state.keyboardSaber = value })
  },

  setScoreOverlaySize: (size) => {
    validateScoreOverlaySize(size)
    set((state) => { state.scoreOverlaySize = size })
  },

  setScoreOverlayOpacity: (value) => {
    validateFiniteStateNumber(value, 'scoreOverlayOpacity')
    set((state) => { state.scoreOverlayOpacity = clamp(Math.round(value), 50, 100) })
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

  setBackgroundImage: (image) => {
    if (image != null && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) {
      throw new Error('Background image must be a PNG, JPEG, or WebP image.')
    }

    set((state) => {
      state.backgroundImage = image
    })
  },

  setBackgroundStyle: (style) => {
    validateBackgroundStyle(style)
    set((state) => { state.backgroundStyle = style })
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
