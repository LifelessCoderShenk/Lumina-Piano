import React, { useEffect, useRef, useState } from 'react'

import { CreateColorPanel } from '../CreateColorPanel/CreateColorPanel'
import { ParticlesPanel } from '../ParticlesPanel/ParticlesPanel'
import { useAppStore } from '../../store/store'
import { CameraControlsPanel } from '../CameraControlsPanel/CameraControlsPanel'
import { PieceFilesColumn } from '../PieceFilesColumn/PieceFilesColumn'
import { PiecesColumn } from '../PiecesColumn/PiecesColumn'
import { SecondBar } from '../SecondBar/SecondBar'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { TopBar } from '../TopBar/TopBar'
import styles from './EditPanel.module.css'

const MIN_PANEL_WIDTH = 340
const MAX_PANEL_WIDTH = 520
const DEFAULT_PANEL_WIDTH = 360

interface EditPanelProps {
  cameraSourceDimensions?: { height: number; width: number } | null
  isCameraTransformLocked?: boolean
  isCreateNavigationLocked?: boolean
  isCollapsed?: boolean
  isSettingsOpen?: boolean
  onSettingsOpenChange?(isOpen: boolean): void
}

export function EditPanel({
  cameraSourceDimensions = null,
  isCameraTransformLocked = false,
  isCreateNavigationLocked = false,
  isCollapsed = false,
  isSettingsOpen: controlledIsSettingsOpen,
  onSettingsOpenChange,
}: EditPanelProps) {
  const [uncontrolledIsSettingsOpen, setUncontrolledIsSettingsOpen] = useState(false)
  const [isSamplePiecesSelected, setIsSamplePiecesSelected] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const resizeHandleRef = useRef<HTMLDivElement | null>(null)
  const resizePointerIdRef = useRef<number | null>(null)
  const previousUserSelectRef = useRef<string | null>(null)
  const activeTab = useAppStore((state) => state.activeSecondBarTab)
  const appMode = useAppStore((state) => state.appMode)
  const recordModeView = useAppStore((state) => state.recordModeView)
  const setActiveSecondBarTab = useAppStore((state) => state.setActiveSecondBarTab)
  const isSettingsOpen = controlledIsSettingsOpen ?? uncontrolledIsSettingsOpen
  const setIsSettingsOpen = onSettingsOpenChange ?? setUncontrolledIsSettingsOpen

  useEffect(() => {
    if (appMode === 'createRecord' && recordModeView === 'transcription' && isSettingsOpen) setIsSettingsOpen(false)
  }, [appMode, recordModeView, isSettingsOpen, setIsSettingsOpen])

  useEffect(() => {
    return () => {
      if (previousUserSelectRef.current != null) {
        document.body.style.userSelect = previousUserSelectRef.current
      }
    }
  }, [])

  const updatePanelWidth = (clientX: number) => {
    const createShell = resizeHandleRef.current?.parentElement?.parentElement
    if (createShell == null) {
      return
    }

    setPanelWidth(clamp(
      clientX - createShell.getBoundingClientRect().left,
      MIN_PANEL_WIDTH,
      MAX_PANEL_WIDTH,
    ))
  }

  const stopResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    resizePointerIdRef.current = null
    document.body.style.userSelect = previousUserSelectRef.current ?? ''
    previousUserSelectRef.current = null
    setIsResizing(false)
  }

  return (
    <aside
      className={`${styles.editPanel} ${isResizing ? styles.isResizing : ''}`}
      data-testid="edit-panel"
      aria-hidden={isCollapsed || undefined}
      style={{ width: isCollapsed ? '0px' : `${panelWidth}px`, flexBasis: isCollapsed ? '0px' : `${panelWidth}px` }}
      >
      {!isCollapsed && <><TopBar
        isSettingsOpen={isSettingsOpen}
        isCreateNavigationLocked={isCreateNavigationLocked}
        onToggleSettings={() => {
          setIsSettingsOpen(!isSettingsOpen)
        }}
      />
      {appMode !== 'createRecord' || recordModeView === 'video' ? <SecondBar /> : null}

      <div className={styles.body} data-testid="edit-panel-body">
        {appMode === 'createRecord' && recordModeView === 'transcription' ? (
          <div id="transcription-sidebar-root" className={styles.transcriptionSidebarHost} data-testid="transcription-sidebar" />
        ) : isSettingsOpen ? (
          <SettingsPanel
            onClose={() => {
              setIsSettingsOpen(false)
            }}
          />
        ) : activeTab === 'pieces' ? (
          <>
            <PieceFilesColumn
              isSamplePiecesSelected={isSamplePiecesSelected}
              onSelectPieceSource={(source) => {
                setIsSamplePiecesSelected(source === 'samples')
              }}
            />
            <div className={styles.divider} data-testid="edit-panel-divider" />
            <PiecesColumn showSamplePieces={isSamplePiecesSelected} />
          </>
        ) : activeTab === 'camera' ? (
          <CameraControlsPanel
            disabled={isCameraTransformLocked}
            sourceVideoDimensions={cameraSourceDimensions}
            onBack={() => {
              setActiveSecondBarTab('pieces')
            }}
          />
        ) : activeTab === 'particles' ? (
          <ParticlesPanel />
        ) : (
          <CreateColorPanel />
        )}
      </div>
      <div
        ref={resizeHandleRef}
        aria-label="Resize edit panel"
        className={styles.resizeHandle}
        onPointerCancel={stopResizing}
        onPointerDown={(event) => {
          event.preventDefault()
          previousUserSelectRef.current = document.body.style.userSelect
          document.body.style.userSelect = 'none'
          resizePointerIdRef.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          updatePanelWidth(event.clientX)
          setIsResizing(true)
        }}
        onPointerMove={(event) => {
          if (resizePointerIdRef.current === event.pointerId) {
            updatePanelWidth(event.clientX)
          }
        }}
        onPointerUp={stopResizing}
        role="separator"
        aria-orientation="vertical"
      /></>}
    </aside>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
