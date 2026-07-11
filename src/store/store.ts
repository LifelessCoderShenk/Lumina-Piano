import { enableMapSet } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { createOrchestrationActions } from './orchestration'
import { registerLearnV3ActivityReader } from './learnV3Activity'
import { registerProjectDataStoreAccess } from './projectDataAccess'
import { registerProjectLoadingStoreAccess } from './projectLoadingAccess'
import { createStoreSelectors } from './selectors'
import { createCameraViewportSlice } from './slices/cameraViewportSlice'
import { createCreateModeSlice } from './slices/createModeSlice'
import { createLearnSlice } from './slices/learnSlice'
import { createLearnVisualsSlice } from './slices/learnVisualsSlice'
import { createPiecesSlice } from './slices/piecesSlice'
import { createPlaybackSlice } from './slices/playbackSlice'
import { createProjectSlice } from './slices/projectSlice'
import { createSelectionSlice } from './slices/selectionSlice'
import { createTrackSlice } from './slices/trackSlice'
import { createUISlice } from './slices/uiSlice'
import { createVisualizerAppearanceSlice } from './slices/visualizerAppearanceSlice'
import { StoreError } from './errors'
import type { AppStore } from './types'

enableMapSet()

export const useAppStore = create<AppStore>()(
  immer((set, get) => ({
    ...createProjectSlice(set, get),
    ...createPlaybackSlice(set, get),
    ...createCameraViewportSlice(set, get),
    ...createSelectionSlice(set, get),
    ...createTrackSlice(set, get),
    ...createPiecesSlice(set, get),
    ...createCreateModeSlice(set, get),
    ...createUISlice(set, get),
    ...createLearnSlice(set, get),
    ...createLearnVisualsSlice(set, get),
    ...createVisualizerAppearanceSlice(set, get),
    ...createOrchestrationActions(set, get),
  })),
)

registerLearnV3ActivityReader(() => useAppStore.getState().learnV3.isActive)
registerProjectDataStoreAccess({
  getCurrentProjectData: () => useAppStore.getState().projectData,
  subscribeToProjectData: (listener) => {
    return useAppStore.subscribe((state, previousState) => {
      if (state.projectData !== previousState.projectData) {
        listener(state.projectData, previousState.projectData)
      }
    })
  },
})
registerProjectLoadingStoreAccess({
  getCurrentTick: () => useAppStore.getState().currentTick,
  loadProject: (projectData, tempoMap) => useAppStore.getState().loadProject(projectData, tempoMap),
})

export const {
  useCameraState,
  useExportState,
  usePlaybackState,
  useProjectData,
  useSelection,
  useTrackColors,
  useVisualizerSettings,
} = createStoreSelectors(useAppStore)

export const getAppState = () => useAppStore.getState()
export const subscribeToStore = useAppStore.subscribe
export const resetStore = () => useAppStore.getState().resetStore()

export { StoreError }
export {
  cameraOverlayInitial,
  DEFAULT_PITCH_CLASS_COLORS,
  DEFAULT_TRACK_COLORS,
  learnVisualsInitial,
  recordModeConfigInitial,
  visualizerSettingsInitial,
} from './defaults'
export type {
  AlignStep,
  AlignmentPoint,
  AppActions,
  AppMode,
  AppState,
  CameraOverlaySettings,
  CreateTab,
  LearnHand,
  LearnMode,
  LearnNoteColorMode,
  LearnSessionConfig,
  LearnStats,
  LearnV3State,
  LearnVisuals,
  MidiConnectionStatus,
  MidiDeviceInfo,
  Piece,
  PieceType,
  RecordModeConfig,
  VisualizerSettings,
} from './types'
