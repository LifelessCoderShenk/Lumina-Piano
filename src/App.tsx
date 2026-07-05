import React, { useEffect, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { MenuBar } from './components/MenuBar/MenuBar'
import { TrackList } from './components/TrackList/TrackList'
import { CanvasArea } from './components/CanvasArea/CanvasArea'
import { CAMERA_MODE_TIMELINE_HEIGHT_PX, CameraMode } from './components/CameraMode/CameraMode'
import { EditPanel } from './components/EditPanel/EditPanel'
import { RecordMode } from './components/RecordMode/RecordMode'
import { StatusBar } from './components/StatusBar/StatusBar'
import { ExportModal } from './components/ExportModal/ExportModal'
import { EndScreen } from './components/EndScreen/EndScreen'
import { LearnHome } from './components/LearnHome/LearnHome'
import { LearnOptionsPanel } from './components/LearnOptionsPanel/LearnOptionsPanel'
import { ListenSession } from './components/LearnSession/ListenSession'
import { NoteByNoteSession } from './components/LearnSession/NoteByNoteSession'
import { PlayAlongSession } from './components/LearnSession/PlayAlongSession'
import { renderer } from './renderer/Renderer'
import { SongPage } from './components/SongPage/SongPage'
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
  const [isCameraTimelineVisible, setIsCameraTimelineVisible] = useState(false)
  const createCanvasShellRef = useRef<HTMLDivElement | null>(null)
  const appMode = useAppStore((state) => state.appMode)
  const alignStep = useAppStore((state) => state.alignStep)
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const learnSessionMode = useAppStore((state) => state.learnV3.sessionConfig.mode)
  const isCameraMode = appMode === 'createCamera'
  const isRecordMode = appMode === 'createRecord'
  const cameraVisualizerHeight = isCameraTimelineVisible
    ? `calc(60% - ${CAMERA_MODE_TIMELINE_HEIGHT_PX}px)`
    : '60%'
  const cameraModeHeight = isCameraTimelineVisible
    ? `calc(40% + ${CAMERA_MODE_TIMELINE_HEIGHT_PX}px)`
    : '40%'

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
    }
  }, [appMode])

  // Wire command shortcuts globally
  useCommandShortcuts()

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

    const fakeAX = renderer.getKeyX(21)
    const fakeCX = renderer.getKeyX(108)
    const realWidth = Math.max(1, x - state.lowAPoint.x)
    const fakeWidth = Math.max(1, fakeCX - fakeAX)
    const scale = Math.max(0.05, realWidth / fakeWidth)
    const offsetX = state.lowAPoint.x - (fakeAX * scale)
    const offsetY = state.lowAPoint.y - renderer.getKeyboardY()

    state.setHighCPoint({ x, y })
    state.setCameraOverlay({
      offsetX,
      offsetY,
      scale,
    })
    renderer.setKeyboardOpacity(1)
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
          <EditPanel />
          <div
            ref={createCanvasShellRef}
            className={styles.createCanvasShell}
            data-testid="create-visualizer-area"
            style={{ width: '75%', flexBasis: '75%' }}
          >
            {isRecordMode ? (
              <RecordMode />
            ) : (
              <div
                className={isCameraMode ? styles.cameraLayout : styles.createVisualizerLayout}
                data-testid={isCameraMode ? 'camera-layout' : 'create-layout'}
              >
                <div
                  className={isCameraMode ? styles.cameraVisualizer : styles.createVisualizerSlot}
                  data-testid={isCameraMode ? 'camera-visualizer-slot' : 'create-visualizer-slot'}
                  style={isCameraMode
                    ? {
                      height: cameraVisualizerHeight,
                      transform: `translate3d(0px, ${cameraOverlay.offsetY}px, 0)`,
                    }
                    : undefined}
                >
                  <CanvasArea />
                </div>
                <div
                  className={styles.cameraModeSlot}
                  style={isCameraMode ? { height: cameraModeHeight } : { display: 'none' }}
                >
                  {isCameraMode ? (
                    <CameraMode
                      isTimelineVisible={isCameraTimelineVisible}
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
          </div>
        </div>

        <ExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className={styles.app} style={appRootStyle}>
      <TitleBar />
      <MenuBar onExportClick={() => setExportModalOpen(true)} />

      <div className={styles.workspace}>
        <TrackList />
        <div className={styles.centerColumn}>
          <div className={styles.canvasWrapper}>
            {appMode === 'learn' ? (
              <LearnHome />
            ) : appMode === 'learnSong' ? (
              <SongPage />
            ) : appMode === 'learnSession' ? (
              learnSessionMode === 'listen' ? (
                <div className={styles.listenSessionLayout}>
                  <ListenSession />
                  <CanvasArea />
                </div>
              ) : learnSessionMode === 'noteByNote' ? (
                <div className={styles.listenSessionLayout}>
                  <NoteByNoteSession />
                  <CanvasArea />
                </div>
              ) : learnSessionMode === 'playAlong' ? (
                <>
                  <CanvasArea />
                  <PlayAlongSession />
                </>
              ) : (
                <div className={styles.learnMode}>
                  <div className={styles.learnMessage}>Learn Session Coming Soon</div>
                </div>
              )
            ) : appMode === 'learnEnd' ? (
              <EndScreen />
            ) : (
              <CanvasArea />
            )}
          </div>
        </div>
        {appMode === 'learnSession' ? (
          <LearnOptionsPanel />
        ) : null}
      </div>

      <StatusBar />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  )
}
