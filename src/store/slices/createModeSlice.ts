import type { StateCreator } from 'zustand'

import {
  alignmentInitial,
  cameraOverlayInitial,
  createCreateNoteColorDefaults,
  createParticleSettingsDefaults,
  recordModeConfigInitial,
  handVisualizationInitial,
  visualizerSettingsInitial,
} from '../defaults'
import { getParticlePreset, type ParticlePresetName } from '../particlePresets'
import type {
  AppActions,
  AppStore,
  CameraOverlaySettings,
  CreateNoteColorsSlice,
  ParticleSettingsSlice,
  CreateVisualizerSettingsSlice,
  CameraOverlaySlice,
  HandVisualizationSlice,
  AlignmentSlice,
  RecordModeSlice,
} from '../types'
import {
  normalizeVisualizerAspectRatio,
  validateAlignmentPoint,
  validateAlignStep,
  validateCreateNoteColorMode,
  validateFiniteStateNumber,
  validateHexColor,
  validatePitchClass,
  validatePitchClassColors,
  validateParticleSettingsPatch,
  validateRecordModeConfigPatch,
} from '../validation'

type CreateModeStoreSlice =
  & CreateVisualizerSettingsSlice
  & CreateNoteColorsSlice
  & ParticleSettingsSlice
  & HandVisualizationSlice
  & CameraOverlaySlice
  & AlignmentSlice
  & RecordModeSlice
  & Pick<
    AppActions,
    | 'enterRecordMode'
    | 'setCreateNoteColorMode'
    | 'setCreatePitchClassColor'
    | 'setCreatePitchClassColors'
    | 'setCreateSingleNoteColor'
    | 'setCreateVelocityColors'
    | 'setParticleSettings'
    | 'setParticlePreset'
    | 'resetParticleSettings'
    | 'setHandVisualization'
    | 'setAlignStep'
    | 'setCameraOverlay'
    | 'setHighCPoint'
    | 'setLowAPoint'
    | 'setRecordModeConfig'
    | 'setRecordModeView'
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
  particleSettings: createParticleSettingsDefaults(),
  handVisualization: { ...handVisualizationInitial },
  cameraOverlay: { ...cameraOverlayInitial },
  alignStep: alignmentInitial.alignStep,
  lowAPoint: alignmentInitial.lowAPoint,
  highCPoint: alignmentInitial.highCPoint,
  recordModeConfig: { ...recordModeConfigInitial },
  recordModeView: 'video',

  setVisualizerSettings: (patch) => {
    set((state) => {
      const normalizedAspectRatio = normalizeVisualizerAspectRatio(
        patch.aspectRatio,
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

  setCreatePitchClassColors: (colors) => {
    validatePitchClassColors(colors)

    const nextColors = Object.fromEntries(
      Array.from({ length: 12 }, (_, pitchClass) => [pitchClass, colors[pitchClass]]),
    ) as Record<number, string>

    set((state) => {
      const colorsAreEqual = Array.from({ length: 12 }, (_, pitchClass) => pitchClass).every(
        (pitchClass) => state.createNoteColors.pitchClassColors[pitchClass] === nextColors[pitchClass],
      )
      if (colorsAreEqual) {
        return
      }

      state.createNoteColors.pitchClassColors = nextColors
    })
  },

  setCreateVelocityColors: (lowColor, highColor) => {
    validateHexColor(lowColor)
    validateHexColor(highColor)

    set((state) => {
      if (
        state.createNoteColors.velocityLowColor === lowColor
        && state.createNoteColors.velocityHighColor === highColor
      ) {
        return
      }

      state.createNoteColors.velocityLowColor = lowColor
      state.createNoteColors.velocityHighColor = highColor
    })
  },

  setParticleSettings: (patch) => {
    validateParticleSettingsPatch(patch)

    set((state) => {
      state.particleSettings = {
        ...state.particleSettings,
        ...(patch.enabled == null ? {} : { enabled: patch.enabled }),
        ...(patch.style == null ? {} : { style: patch.style }),
        ...(patch.colorMode == null ? {} : { colorMode: patch.colorMode }),
        ...(patch.customColor == null ? {} : { customColor: patch.customColor }),
        ...(patch.density == null ? {} : { density: Math.min(200, Math.max(25, patch.density)) }),
        ...(patch.size == null ? {} : { size: Math.min(200, Math.max(50, patch.size)) }),
        ...(patch.speed == null ? {} : { speed: Math.min(200, Math.max(50, patch.speed)) }),
        ...(patch.spread == null ? {} : { spread: Math.min(200, Math.max(0, patch.spread)) }),
        ...(patch.lifetime == null ? {} : { lifetime: Math.min(200, Math.max(50, patch.lifetime)) }),
        ...(patch.glow == null ? {} : { glow: Math.min(200, Math.max(50, patch.glow)) }),
      }
    })
  },

  setParticlePreset: (name: ParticlePresetName) => {
    const preset = getParticlePreset(name)

    set((state) => {
      state.particleSettings = { ...preset.settings }
    })
  },

  resetParticleSettings: () => {
    set((state) => {
      state.particleSettings = createParticleSettingsDefaults()
    })
  },

  setHandVisualization: (patch) => {
    if (patch.enabled != null && typeof patch.enabled !== 'boolean') {
      throw new Error('handVisualization.enabled must be a boolean')
    }
    if (patch.opacity != null) {
      validateFiniteStateNumber(patch.opacity, 'handVisualization.opacity')
    }

    set((state) => {
      state.handVisualization = {
        ...state.handVisualization,
        ...(patch.enabled == null ? {} : { enabled: patch.enabled }),
        ...(patch.opacity == null ? {} : { opacity: Math.min(80, Math.max(10, Math.round(patch.opacity))) }),
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
    if (patch.flipHorizontal != null && typeof patch.flipHorizontal !== 'boolean') {
      throw new Error('cameraOverlay.flipHorizontal must be a boolean')
    }
    if (patch.flipVertical != null && typeof patch.flipVertical !== 'boolean') {
      throw new Error('cameraOverlay.flipVertical must be a boolean')
    }
    const normalizedRotation = patch.rotation == null ? undefined : normalizeCameraRotation(patch.rotation)
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
        ...(normalizedRotation == null ? {} : { rotation: normalizedRotation }),
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
      state.activeSecondBarTab = state.recordModeView === 'video' ? 'camera' : 'pieces'
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

  setRecordModeView: (view) => {
    if (view !== 'video' && view !== 'transcription') throw new Error('Record mode view is invalid.')
    set((state) => {
      if (
        state.recordModeView === 'transcription'
        && view !== 'transcription'
        && state.transcriptionPhase !== 'idle'
        && state.transcriptionPhase !== 'stopped'
      ) {
        return
      }

      if (view === 'transcription') {
        let mediaSources = [...(state.transcriptionSettings.mediaSources ?? [])]
        const sharedVideoIndex = mediaSources.findIndex((source) => source.id === 'shared-face-camera')
        if (sharedVideoIndex >= 0) {
          mediaSources[sharedVideoIndex] = { ...mediaSources[sharedVideoIndex], deviceId: state.recordModeConfig.cameraDeviceId, enabled: state.recordModeConfig.cameraDeviceId != null }
        } else if (state.recordModeConfig.cameraDeviceId != null) {
          mediaSources.push({ id: 'shared-face-camera', kind: 'video' as const, role: 'face' as const, name: 'Face camera', deviceId: state.recordModeConfig.cameraDeviceId, enabled: true, volume: 1, latencyMs: 0, overlay: { x: .73, y: .04, width: .24, mirror: true, crop: 0 } })
        }
        const sharedAudioIndex = mediaSources.findIndex((source) => source.id === 'shared-audio-input')
        if (sharedAudioIndex >= 0) {
          mediaSources[sharedAudioIndex] = { ...mediaSources[sharedAudioIndex], deviceId: state.recordModeConfig.audioSourceDeviceId, enabled: state.recordModeConfig.useMic }
        } else if (state.recordModeConfig.audioSourceDeviceId != null || state.recordModeConfig.useMic) {
          mediaSources.push({ id: 'shared-audio-input', kind: 'audio' as const, role: 'microphone' as const, name: 'Audio input', deviceId: state.recordModeConfig.audioSourceDeviceId, enabled: state.recordModeConfig.useMic, volume: 1, latencyMs: 0 })
        }
        state.transcriptionSettings = {
          ...state.transcriptionSettings,
          midiDeviceId: state.recordModeConfig.midiDeviceId,
          cameraDeviceId: state.recordModeConfig.cameraDeviceId,
          microphoneDeviceId: state.recordModeConfig.audioSourceDeviceId,
          mediaSources,
        }
      } else {
        const sources = state.transcriptionSettings.mediaSources ?? []
        const video = sources.find((source) => source.id === 'shared-face-camera')
          ?? sources.find((source) => source.kind === 'video' && source.role === 'face')
          ?? sources.find((source) => source.kind === 'video')
        const audio = sources.find((source) => source.id === 'shared-audio-input')
          ?? sources.find((source) => source.kind === 'audio' && (source.role === 'microphone' || source.role === 'room'))
          ?? sources.find((source) => source.kind === 'audio')
        state.recordModeConfig = {
          ...state.recordModeConfig,
          midiDeviceId: state.transcriptionSettings.midiDeviceId,
          cameraDeviceId: video ? video.deviceId : state.transcriptionSettings.cameraDeviceId ?? null,
          audioSourceDeviceId: audio ? audio.deviceId : state.transcriptionSettings.microphoneDeviceId ?? null,
          useMic: audio?.enabled ?? false,
        }
        state.activeSecondBarTab = 'camera'
      }

      state.recordModeView = view
      state.appMode = 'createRecord'
      state.alignStep = alignmentInitial.alignStep
      state.lowAPoint = alignmentInitial.lowAPoint
      state.highCPoint = alignmentInitial.highCPoint
      if (view === 'transcription' && state.transcriptionPhase !== 'recording' && state.transcriptionPhase !== 'paused') {
        state.transcriptionPhase = state.transcriptionNotes.length > 0 ? 'stopped' : 'idle'
      }
    })
  },
})

function normalizeCameraRotation(rotation: number): CameraOverlaySettings['rotation'] {
  validateFiniteStateNumber(rotation, 'cameraOverlay.rotation')
  if (rotation % 90 !== 0) {
    throw new Error('cameraOverlay.rotation must be a multiple of 90 degrees')
  }

  return (((rotation % 360) + 360) % 360) as CameraOverlaySettings['rotation']
}
