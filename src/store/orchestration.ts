import type { StateCreator } from 'zustand'

import { getMidiPieceLoader } from './midiPieceLoaderAccess'
import {
  alignmentInitial,
  createExportDefaults,
  createInitialAppState,
  createPlaybackDefaults,
  createSelectionDefaults,
  createTrackDefaults,
  UNSUPPORTED_RECORDING_PIECE_MESSAGE,
} from './defaults'
import { StoreError } from './errors'
import type { AppActions, AppState, AppStore } from './types'
import {
  validateAppMode,
  validateProjectData,
  validateTempoMap,
  validateTrackId,
} from './validation'

type OrchestrationActions = Pick<
  AppActions,
  | 'batchUpdate'
  | 'clearLoadedPiece'
  | 'enterCameraMode'
  | 'loadPiece'
  | 'loadProject'
  | 'resetStore'
  | 'setAppMode'
>

export const createOrchestrationActions: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  OrchestrationActions
> = (set, get) => ({
  loadProject: (projectData, tempoMap) => {
    validateProjectData(projectData)
    validateTempoMap(tempoMap)

    const trackDefaults = createTrackDefaults(projectData.tracks)
    const playbackDefaults = createPlaybackDefaults()
    const selectionDefaults = createSelectionDefaults()
    const exportDefaults = createExportDefaults()

    set((state) => {
      state.projectData = projectData
      state.precomputedTempoMap = tempoMap
      state.isProjectLoaded = true

      state.currentTick = playbackDefaults.currentTick
      state.isPlaying = playbackDefaults.isPlaying
      state.loopEnabled = playbackDefaults.loopEnabled
      state.loopStartTick = playbackDefaults.loopStartTick
      state.loopEndTick = playbackDefaults.loopEndTick

      state.selectedNoteIds = selectionDefaults.selectedNoteIds
      state.hoveredNoteId = selectionDefaults.hoveredNoteId

      state.trackColors = trackDefaults.trackColors
      state.trackMuted = trackDefaults.trackMuted
      state.trackSoloed = trackDefaults.trackSoloed

      state.isExporting = exportDefaults.isExporting
      state.exportProgress = exportDefaults.exportProgress
      state.exportFramesRendered = exportDefaults.exportFramesRendered
      state.exportTotalFrames = exportDefaults.exportTotalFrames
      state.exportEstimatedSecondsRemaining = exportDefaults.exportEstimatedSecondsRemaining

      state.errorMessage = null
      state.loadPieceError = null
    })
  },

  clearLoadedPiece: () => {
    const playbackDefaults = createPlaybackDefaults()
    const selectionDefaults = createSelectionDefaults()
    const exportDefaults = createExportDefaults()

    set((state) => {
      state.alignStep = alignmentInitial.alignStep
      state.currentPieceId = null
      state.loadPieceError = null
      state.highCPoint = alignmentInitial.highCPoint
      state.lowAPoint = alignmentInitial.lowAPoint
      state.projectData = null
      state.precomputedTempoMap = null
      state.isProjectLoaded = false

      state.currentTick = playbackDefaults.currentTick
      state.isPlaying = playbackDefaults.isPlaying
      state.loopEnabled = playbackDefaults.loopEnabled
      state.loopStartTick = playbackDefaults.loopStartTick
      state.loopEndTick = playbackDefaults.loopEndTick

      state.selectedNoteIds = selectionDefaults.selectedNoteIds
      state.hoveredNoteId = selectionDefaults.hoveredNoteId

      state.trackColors = {}
      state.trackMuted = {}
      state.trackSoloed = {}

      state.isExporting = exportDefaults.isExporting
      state.exportProgress = exportDefaults.exportProgress
      state.exportFramesRendered = exportDefaults.exportFramesRendered
      state.exportTotalFrames = exportDefaults.exportTotalFrames
      state.exportEstimatedSecondsRemaining = exportDefaults.exportEstimatedSecondsRemaining

      state.errorMessage = null
    })
  },

  loadPiece: async (id) => {
    validateTrackId(id)

    set((state) => {
      state.loadPieceError = null
    })

    const piece = get().pieces.find((candidate) => candidate.id === id) ?? null
    if (piece == null || piece.filePath == null) {
      return false
    }

    if (!/\.(mid|midi)$/i.test(piece.filePath)) {
      console.warn('[loadPiece] Skipping non-MIDI file:', piece.filePath)
      set((state) => {
        state.loadPieceError = UNSUPPORTED_RECORDING_PIECE_MESSAGE
      })
      return false
    }

    try {
      const midiPieceLoader = getMidiPieceLoader()
      const loaded = await midiPieceLoader.loadMidiFileFromPath(piece.filePath)

      if (loaded) {
        set((state) => {
          state.currentPieceId = piece.id
          state.errorMessage = null
          state.loadPieceError = null
        })

        await midiPieceLoader.warmUpAudioAndStartPlayback()
      }

      return loaded
    } catch (error) {
      console.error(`Failed to load piece "${piece.name}":`, error)
      set((state) => {
        state.errorMessage = `Failed to load piece "${piece.name}".`
      })
      return false
    }
  },

  setAppMode: (mode) => {
    validateAppMode(mode)

    set((state) => {
      state.appMode = mode
      if (mode !== 'createCamera' && state.activeSecondBarTab === 'camera') {
        state.activeSecondBarTab = 'pieces'
      }
      if (mode !== 'createCamera') {
        state.alignStep = alignmentInitial.alignStep
        state.lowAPoint = alignmentInitial.lowAPoint
        state.highCPoint = alignmentInitial.highCPoint
      }
    })
  },

  enterCameraMode: () => {
    set((state) => {
      const hasLoadedPiece = (
        state.isProjectLoaded &&
        state.currentPieceId != null &&
        state.pieces.some((piece) => piece.id === state.currentPieceId)
      )

      if (!hasLoadedPiece) {
        return
      }

      state.appMode = 'createCamera'
      state.activeSecondBarTab = 'camera'
    })
  },

  batchUpdate: (fn) => {
    if (typeof fn !== 'function') {
      throw new StoreError('batchUpdate requires a function.', 'INVALID_STATE', fn)
    }

    set((state) => {
      fn(state as AppState)
    })
  },

  resetStore: () => {
    set(() => createInitialAppState())
  },
})
