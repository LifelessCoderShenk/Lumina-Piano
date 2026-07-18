import type { StateCreator } from 'zustand'

import {
  alignmentInitial,
  cameraOverlayInitial,
  createCreateNoteColorDefaults,
  recordModeConfigInitial,
  visualizerSettingsInitial,
} from '../defaults'
import type {
  AppActions,
  AppStore,
  CameraOverlaySettings,
  CreateNoteColorsSlice,
  CreateVisualizerSettingsSlice,
  CameraOverlaySlice,
  AlignmentSlice,
  RecordModeSlice,
  VisualizerSettings,
} from '../types'
import {
  normalizeVisualizerAspectRatio,
  validateAlignmentPoint,
  validateAlignStep,
  validateCreateNoteColorMode,
  validateFiniteStateNumber,
  validateHexColor,
  validatePitchClass,
  validateRecordModeConfigPatch,
} from '../validation'

type CreateModeStoreSlice =
  & CreateVisualizerSettingsSlice
  & CreateNoteColorsSlice
  & CameraOverlaySlice
  & AlignmentSlice
  & RecordModeSlice
  & Pick<
    AppActions,
    | 'enterRecordMode'
    | 'setCreateNoteColorMode'
    | 'setCreatePitchClassColor'
    | 'setCreateSingleNoteColor'
    | 'setAlignStep'
    | 'setCameraOverlay'
    | 'setHighCPoint'
    | 'setLowAPoint'
    | 'setRecordModeConfig'
    | 'setVisualizerSettings'
  >

export const createCreateModeSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  CreateModeStoreSlice
> = (set) => ({
  visualizerSettings: { ...visualizerSettingsInitial },
  createNoteColors: createCreateNoteColorDefaults(),
  cameraOverlay: { ...cameraOverlayInitial },
  alignStep: alignmentInitial.alignStep,
  lowAPoint: alignmentInitial.lowAPoint,
  highCPoint: alignmentInitial.highCPoint,
  recordModeConfig: { ...recordModeConfigInitial },

  setVisualizerSettings: (patch) => {
    set((state) => {
      const normalizedAspectRatio = normalizeVisualizerAspectRatio(
        (patch as Partial<VisualizerSettings> & { aspectRatio?: VisualizerSettings['aspectRatio'] | '9:16' }).aspectRatio,
      )

      state.visualizerSettings = {
        ...state.visualizerSettings,
        ...patch,
        ...(normalizedAspectRatio == null ? {} : { aspectRatio: normalizedAspectRatio }),
      }
    })
  },

  setCreateNoteColorMode: (mode) => {
    validateCreateNoteColorMode(mode)

    set((state) => {
      if (state.createNoteColors.mode === mode) {
        return
      }

      state.createNoteColors.mode = mode
    })
  },

  setCreateSingleNoteColor: (color) => {
    validateHexColor(color)

    set((state) => {
      if (state.createNoteColors.singleColor === color) {
        return
      }

      state.createNoteColors.singleColor = color
    })
  },

  setCreatePitchClassColor: (pitchClass, color) => {
    validatePitchClass(pitchClass)
    validateHexColor(color)

    set((state) => {
      if (state.createNoteColors.pitchClassColors[pitchClass] === color) {
        return
      }

      state.createNoteColors.pitchClassColors = {
        ...state.createNoteColors.pitchClassColors,
        [pitchClass]: color,
      }
    })
  },

  setCameraOverlay: (patch) => {
    if (patch.offsetX != null) {
      validateFiniteStateNumber(patch.offsetX, 'cameraOverlay.offsetX')
    }
    if (patch.offsetY != null) {
      validateFiniteStateNumber(patch.offsetY, 'cameraOverlay.offsetY')
    }
    if (patch.scale != null) {
      validateFiniteStateNumber(patch.scale, 'cameraOverlay.scale')
    }
    if (patch.cropTop != null) {
      validateFiniteStateNumber(patch.cropTop, 'cameraOverlay.cropTop')
    }
    if (patch.cropRight != null) {
      validateFiniteStateNumber(patch.cropRight, 'cameraOverlay.cropRight')
    }
    if (patch.cropBottom != null) {
      validateFiniteStateNumber(patch.cropBottom, 'cameraOverlay.cropBottom')
    }
    if (patch.cropLeft != null) {
      validateFiniteStateNumber(patch.cropLeft, 'cameraOverlay.cropLeft')
    }

    set((state) => {
      state.cameraOverlay = {
        ...state.cameraOverlay,
        ...patch,
      }
    })
  },

  setAlignStep: (step) => {
    validateAlignStep(step)

    set((state) => {
      state.alignStep = step
    })
  },

  setLowAPoint: (point) => {
    validateAlignmentPoint(point, 'lowAPoint')

    set((state) => {
      state.lowAPoint = point
    })
  },

  setHighCPoint: (point) => {
    validateAlignmentPoint(point, 'highCPoint')

    set((state) => {
      state.highCPoint = point
    })
  },

  enterRecordMode: () => {
    set((state) => {
      state.appMode = 'createRecord'
      state.activeSecondBarTab = 'pieces'
      state.alignStep = alignmentInitial.alignStep
      state.lowAPoint = alignmentInitial.lowAPoint
      state.highCPoint = alignmentInitial.highCPoint
    })
  },

  setRecordModeConfig: (patch) => {
    validateRecordModeConfigPatch(patch)

    set((state) => {
      state.recordModeConfig = {
        ...state.recordModeConfig,
        ...patch,
      }
    })
  },
})
