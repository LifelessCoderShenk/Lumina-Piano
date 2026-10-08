/*
INPUT: Global app mode, mode-specific state, and visualizer UI components.
OUTPUT: The root application layout and the selected full-pane mode surface.
PURPOSE: Routes Transcriptor into the same right-pane canvas footprint as the visualizer while retaining the existing editor shell.
*/

import React, { useEffect, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { MenuBar } from './components/MenuBar/MenuBar'
import { TrackList } from './components/TrackList/TrackList'
import { CanvasArea } from './components/CanvasArea/CanvasArea'
import { CAMERA_MODE_TIMELINE_HEIGHT_PX, CameraMode, type CameraModePhase } from './components/CameraMode/CameraMode'
import { EditPanel } from './components/EditPanel/EditPanel'
import { RecordMode } from './components/RecordMode/RecordMode'
import { StatusBar } from './components/StatusBar/StatusBar'
import { ExportModal } from './components/ExportModal/ExportModal'
import { getExpandableVisualizerStyle } from './components/shared/expandableVisualizerLayout'
import { getActiveVisualizerRenderer } from './renderer/activeVisualizerRenderer'
import { useCommandShortcuts } from './commands/useCommandShortcuts'
import { useAppStore } from './store/store'
import styles from './App.module.css'

const appRootStyle = {
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text-body)',
  fontFamily: 'var(--font-family-base)',
} as const

export function App() {
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [isCreateSettingsOpen, setIsCreateSettingsOpen] = useState(false)
  const [isCameraTimelineVisible, setIsCameraTimelineVisible] = useState(false)
  const [cameraPhase, setCameraPhase] = useState<CameraModePhase>('setup')
  const [isRecordModeBusy, setIsRecordModeBusy] = useState(false)
  const [isTranscriptionSidebarCollapsed, setIsTranscriptionSidebarCollapsed] = useState(false)
  const [cameraSourceDimensions, setCameraSourceDimensions] = useState<{ height: number; width: number } | null>(null)
  const createCanvasShellRef = useRef<HTMLDivElement | null>(null)
  const appMode = useAppStore((state) => state.appMode)
  const alignStep = useAppStore((state) => state.alignStep)
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const recordModeView = useAppStore((state) => state.recordModeView)
  const isCameraMode = appMode === 'createCamera'
  const isRecordMode = appMode === 'createRecord'
  const cameraVisualizerHeight = isCameraTimelineVisible
    ? `calc(60% - ${CAMERA_MODE_TIMELINE_HEIGHT_PX}px)`
    : '60%'
  const cameraModeHeight = isCameraTimelineVisible
    ? `calc(40% + ${CAMERA_MODE_TIMELINE_HEIGHT_PX}px)`
    : '40%'
  const cameraVisualizerStyle = getExpandableVisualizerStyle(cameraVisualizerHeight, cameraOverlay)

  // Use stub in dev (non-Electron), real API in production
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.electronAPI) {
      // Dynamically inject stub for dev environment
      import('./preload/stub').then(({ installStub }) => installStub())
    }
  }, [])

  useEffect(() => {
    if (appMode !== 'createCamera') {
      setIsCameraTimelineVisible(false)
      setCameraPhase('setup')
    }
  }, [appMode])

  // Wire command shortcuts globally
  useCommandShortcuts()

  const openExportModal = () => {
    if (
      appMode === 'select' ||
      appMode === 'create' ||
      appMode === 'createCamera' ||
      appMode === 'createRecord'
    ) {
      setIsCreateSettingsOpen(true)
    }
    setExportModalOpen(true)
  }

  const handleFullPanelClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rightPanelRect =
      createCanvasShellRef.current?.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rightPanelRect.left
    const y = event.clientY - rightPanelRect.top
    const state = useAppStore.getState()

    if (state.alignStep === 'waiting-low-a') {
      state.setLowAPoint({ x, y })
      state.setHighCPoint(null)
      state.setAlignStep('waiting-high-c')
      return
    }

    if (state.alignStep !== 'waiting-high-c' || state.lowAPoint == null) {
      return
    }

    const activeRenderer = getActiveVisualizerRenderer()
    if (activeRenderer == null) {
      return
    }

    const fakeAX = activeRenderer.getKeyX(21)
    const fakeCX = activeRenderer.getKeyX(108)
    const realWidth = Math.max(1, x - state.lowAPoint.x)
    const fakeWidth = Math.max(1, fakeCX - fakeAX)
    const scale = Math.max(0.05, realWidth / fakeWidth)
    const offsetX = state.lowAPoint.x - (fakeAX * scale)
    const offsetY = state.lowAPoint.y - activeRenderer.getKeyboardY()

    state.setHighCPoint({ x, y })
    state.setCameraOverlay({
      offsetX,
      offsetY,
      scale,
    })
    activeRenderer.setKeyboardOpacity(1)
    state.setAlignStep('complete')
  }

  if (
    appMode === 'select' ||
    appMode === 'create' ||
    appMode === 'createCamera' ||
    appMode === 'createRecord'
  ) {
    return (
      <div className={styles.app} style={appRootStyle}>
        <div className={styles.createShell}>
          <EditPanel
            cameraSourceDimensions={cameraSourceDimensions}
            isSettingsOpen={isCreateSettingsOpen}
            onSettingsOpenChange={setIsCreateSettingsOpen}
            isCameraTransformLocked={isCameraMode && (cameraPhase === 'countdown' || cameraPhase === 'recording')}
            isCreateNavigationLocked={isRecordModeBusy || (isCameraMode && (cameraPhase === 'countdown' || cameraPhase === 'recording'))}
            isCollapsed={isRecordMode && recordModeView === 'transcription' && isTranscriptionSidebarCollapsed}
          />
          <div
            ref={createCanvasShellRef}
            className={styles.createCanvasShell}
            data-testid="create-visualizer-area"
            style={{ width: '75%', flexBasis: '75%' }}
          >
            {isRecordMode ? (
              <RecordMode
                isTranscriptionSidebarCollapsed={isTranscriptionSidebarCollapsed}
                onSourceVideoDimensionsChange={setCameraSourceDimensions}
                onBusyChange={setIsRecordModeBusy}
                onTranscriptionSidebarCollapsedChange={setIsTranscriptionSidebarCollapsed}
              />
            ) : (
              <div
                className={isCameraMode ? styles.cameraLayout : styles.createVisualizerLayout}
                data-testid={isCameraMode ? 'camera-layout' : 'create-layout'}
              >
                <div
                  className={isCameraMode ? styles.cameraVisualizer : styles.createVisualizerSlot}
                  data-testid={isCameraMode ? 'camera-visualizer-slot' : 'create-visualizer-slot'}
                  style={isCameraMode
                    ? cameraVisualizerStyle
                    : undefined}
                >
                  <CanvasArea
                    engine="three"
                    guideOnly={isCameraMode && cameraPhase === 'setup'}
                    noteFieldTravelSeconds={isCameraMode ? 3 : undefined}
                    onOpenExport={openExportModal}
                  />
                </div>
                <div
                  className={styles.cameraModeSlot}
                  style={isCameraMode ? { height: cameraModeHeight } : { display: 'none' }}
                >
                  {isCameraMode ? (
                    <CameraMode
                      isTimelineVisible={isCameraTimelineVisible}
                      onSourceVideoDimensionsChange={setCameraSourceDimensions}
                      onOpenExportSheet={() => {
                        setIsCreateSettingsOpen(true)
                      }}
                      onPhaseChange={setCameraPhase}
                      onTimelineVisibilityChange={setIsCameraTimelineVisible}
                    />
                  ) : null}
                </div>
              </div>
            )}
            {(isCameraMode || isRecordMode) && (
              alignStep === 'waiting-low-a' ||
              alignStep === 'waiting-high-c'
            ) ? (
              <div
                aria-hidden="true"
                className={styles.fullPanelAlignOverlay}
                data-testid="full-panel-align-overlay"
                onClick={handleFullPanelClick}
              />
            ) : null}
            <ExportModal
              isOpen={exportModalOpen}
              onClose={() => setExportModalOpen(false)}
              variant="sheet"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.app} style={appRootStyle}>
      <TitleBar />
      <MenuBar onExportClick={openExportModal} />

      <div className={styles.workspace}>
        <TrackList />
        <div className={styles.centerColumn}>
          <div className={styles.canvasWrapper}>
            <CanvasArea engine="pixi" />
          </div>
        </div>
      </div>

      <StatusBar />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  )
}
