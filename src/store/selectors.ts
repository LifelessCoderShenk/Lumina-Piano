import { useShallow } from 'zustand/react/shallow'

import type { AppState, AppStore } from './types'

const projectDataSelector = (state: AppState) => ({
  isProjectLoaded: state.isProjectLoaded,
  precomputedTempoMap: state.precomputedTempoMap,
  projectData: state.projectData,
})

const playbackSelector = (state: AppState) => ({
  currentTick: state.currentTick,
  isPlaying: state.isPlaying,
  loopEnabled: state.loopEnabled,
  loopEndTick: state.loopEndTick,
  loopStartTick: state.loopStartTick,
})

const cameraSelector = (state: AppState) => ({
  panX: state.panX,
  panY: state.panY,
  renderScale: state.renderScale,
  viewportHeight: state.viewportHeight,
  viewportWidth: state.viewportWidth,
  worldZoom: state.worldZoom,
})

const selectionSelector = (state: AppState) => ({
  hoveredNoteId: state.hoveredNoteId,
  selectedNoteIds: state.selectedNoteIds,
})

const trackColorsSelector = (state: AppState) => state.trackColors

const exportSelector = (state: AppState) => ({
  exportEstimatedSecondsRemaining: state.exportEstimatedSecondsRemaining,
  exportFramesRendered: state.exportFramesRendered,
  exportProgress: state.exportProgress,
  exportTotalFrames: state.exportTotalFrames,
  isExporting: state.isExporting,
})

const visualizerSelector = (state: AppState) => ({
  backgroundColor: state.backgroundColor,
  colorMode: state.colorMode,
  gradientBottomColorLeft: state.gradientBottomColorLeft,
  gradientBottomColorLeftBlack: state.gradientBottomColorLeftBlack,
  gradientBottomColorRight: state.gradientBottomColorRight,
  gradientBottomColorRightBlack: state.gradientBottomColorRightBlack,
  gradientTopColor: state.gradientTopColor,
  laneOpacity: state.laneOpacity,
  leftHandColor: state.leftHandColor,
  noteGradientDirection: state.noteGradientDirection,
  noteStyle: state.noteStyle,
  noteLabelFormat: state.noteLabelFormat,
  noteLabelColor: state.noteLabelColor,
  noteLabelSize: state.noteLabelSize,
  noteLabelsOnKeys: state.noteLabelsOnKeys,
  noteLabelsOnNotes: state.noteLabelsOnNotes,
  pitchClassColors: state.pitchClassColors,
  rightHandColor: state.rightHandColor,
  splitPitch: state.splitPitch,
  velocityHighColor: state.velocityHighColor,
  velocityLowColor: state.velocityLowColor,
})

type StoreHook = <T>(selector: (state: AppStore) => T) => T

export function createStoreSelectors(useAppStore: StoreHook) {
  const useProjectData = () => useAppStore(useShallow(projectDataSelector))
  const usePlaybackState = () => useAppStore(useShallow(playbackSelector))
  const useCameraState = () => useAppStore(useShallow(cameraSelector))
  const useSelection = () => useAppStore(useShallow(selectionSelector))
  const useTrackColors = () => useAppStore(trackColorsSelector)
  const useExportState = () => useAppStore(useShallow(exportSelector))
  const useVisualizerSettings = () => useAppStore(useShallow(visualizerSelector))

  return {
    useCameraState,
    useExportState,
    usePlaybackState,
    useProjectData,
    useSelection,
    useTrackColors,
    useVisualizerSettings,
  }
}
