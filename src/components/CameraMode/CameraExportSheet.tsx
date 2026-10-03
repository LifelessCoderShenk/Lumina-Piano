import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

import { hasRenderableMidiAudio, renderOfflineMidiAudioBuffer } from '../../audio/renderOfflineMidiAudio'
import { resolveExportDimensions } from '../../export/exportDimensions'
import { getActiveVisualizerCanvas } from '../../renderer/activeCanvas'
import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { getAppState } from '../../store/store'
import type { CameraOverlaySettings } from '../../store/types'
import { secondsToTick } from '../../tempo/tempoMap'
import { probeBlobDuration } from '../../utils/blobDuration'
import {
  compositeExport,
  getCompositePreviewLayout,
  resolveCompositeVisualizerSize,
} from '../../utils/compositeExport'
import { ExportComplete } from '../ExportModal/ExportComplete'
import { ExportSettings } from '../ExportModal/ExportSettings'
import { ExportSheetShell } from '../ExportModal/ExportSheetShell'
import { resolveRecordingExportTiming, type RecordingTimeline } from '../shared/recordingTimeline'
import styles from './CameraExportSheet.module.css'

type CameraExportPhase = 'idle' | 'exporting' | 'complete' | 'error'

interface CameraExportSheetProps {
  cameraOverlay: CameraOverlaySettings
  hasCameraAudio: boolean
  isOpen: boolean
  nativeVideoDimensions: { height: number; width: number } | null
  onClose(): void
  onExportingChange?(isExporting: boolean): void
  outputName: string
  preRollSeconds: number
  recordingBlob: Blob | null
  recordingDurationSeconds: number | null
  timeline: RecordingTimeline
}

export function CameraExportSheet({
  cameraOverlay,
  hasCameraAudio,
  isOpen,
  nativeVideoDimensions,
  onClose,
  onExportingChange,
  outputName,
  preRollSeconds,
  recordingBlob,
  recordingDurationSeconds,
  timeline,
}: CameraExportSheetProps) {
  const [phase, setPhase] = useState<CameraExportPhase>('idle')
  const [outputPath, setOutputPath] = useState('camera-recording.webm')
  const [includeAudio, setIncludeAudio] = useState(true)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [completedPath, setCompletedPath] = useState<string | null>(null)
  const [formatSnapshot, setFormatSnapshot] = useState<{ fps: 30 | 60; height: number; width: number } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isExporting = phase === 'exporting'
  const currentState = getAppState()
  const midiAvailable = hasRenderableMidiAudio(currentState)
  const currentExportResolution = resolveExportDimensions(
    currentState.visualizerSettings.resolution,
    currentState.visualizerSettings.aspectRatio,
  )

  useEffect(() => {
    if (!isOpen || phase !== 'idle') {
      return
    }

    void (async () => {
      const defaultPath = await window.electronAPI?.dialog.getDefaultExportPath?.()
      if (defaultPath != null && defaultPath.trim().length > 0) {
        setOutputPath(toWebmPath(defaultPath))
      }
    })()
  }, [isOpen, phase])

  useEffect(() => {
    onExportingChange?.(isExporting)
  }, [isExporting, onExportingChange])

  const resetTransientState = () => {
    abortControllerRef.current = null
    setCompletedPath(null)
    setErrorMessage(null)
    setWarningMessage(null)
    setFormatSnapshot(null)
    setPhase('idle')
    setProgress(0)
  }

  const requestClose = () => {
    if (isExporting) {
      return
    }
    resetTransientState()
    onClose()
  }

  const browseOutputPath = async () => {
    const nextPath = await window.electronAPI?.dialog.showSaveDialog({
      defaultPath: outputPath || 'camera-recording.webm',
      filters: [{ extensions: ['webm'], name: 'WebM Video' }],
    })
    if (nextPath != null && nextPath.trim().length > 0) {
      setOutputPath(toWebmPath(nextPath))
    }
  }

  const startExport = async () => {
    const blob = recordingBlob
    const pixiCanvas = getActiveVisualizerCanvas()
    const selectedOutputPath = toWebmPath(outputPath.trim())
    if (blob == null || pixiCanvas == null || selectedOutputPath.length === 0) {
      return
    }

    // Snapshot all mutable settings exactly when Start Export is pressed.
    const stateSnapshot = getAppState()
    const timelineSnapshot = { startOffsetMs: { ...timeline.startOffsetMs } }
    const exportStartTiming = resolveRecordingExportTiming(0, preRollSeconds * 1000, timelineSnapshot)
    const overlaySnapshot = { ...cameraOverlay }
    const frameRate = stateSnapshot.visualizerSettings.framerate
    const outputResolution = resolveExportDimensions(
      stateSnapshot.visualizerSettings.resolution,
      stateSnapshot.visualizerSettings.aspectRatio,
    )
    const cameraAudioSnapshot = includeAudio && hasCameraAudio
    const midiAvailableSnapshot = includeAudio && hasRenderableMidiAudio(stateSnapshot)
    const previewLayout = getCompositePreviewLayout(
      document.querySelector<HTMLElement>('[data-testid="camera-visualizer-slot"]'),
      pixiCanvas,
    )
    const abortController = new AbortController()
    const visualizerResolutionCleanup: { current: (() => void) | null } = { current: null }
    abortControllerRef.current = abortController
    setErrorMessage(null)
    setWarningMessage(null)
    setProgress(0)
    setFormatSnapshot({
      fps: frameRate,
      height: outputResolution.height,
      width: outputResolution.width,
    })
    setPhase('exporting')

    try {
      const duration = recordingDurationSeconds ?? await probeBlobDuration(blob) ?? 0.001
      let midiAudioBuffer: AudioBuffer | null = null
      if (midiAvailableSnapshot) {
        try {
          midiAudioBuffer = await renderOfflineMidiAudioBuffer(
            stateSnapshot,
            Math.max(0.001, duration),
            preRollSeconds,
          )
        } catch (error) {
          console.warn('Unable to render MIDI audio for camera export.', error)
          setWarningMessage('MIDI audio was unavailable, so this export will contain the remaining available audio only.')
        }
      }
      const result = await compositeExport(blob, pixiCanvas, outputName, {
        abortSignal: abortController.signal,
        cameraOverlay: overlaySnapshot,
        frameRate,
        includeCameraAudio: cameraAudioSnapshot,
        midiAudioBuffer,
        midiAudioSourceTimeAtExportStartSeconds: exportStartTiming.midiAudioBufferTimeMs / 1000,
        onWarning: setWarningMessage,
        onProgress: setProgress,
        expectedDurationSeconds: duration,
        outputPath: selectedOutputPath,
        outputResolution,
        previewLayout,
        // The visible canvas is normally only as large as its on-screen CSS
        // box. Render its backing store at the native camera composite size
        // before the 2D compositor samples it, then restore it afterwards.
        // This avoids enlarging a small preview canvas into a soft export.
        onBeforeExportStart: async (exportVideo, exportCanvasSize) => {
          const activeRenderer = getActiveVisualizerRenderer()
          playbackEngine.pause()
          activeRenderer?.setReviewTimelineTick?.(null)
          // Keep export compatible with lightweight renderer adapters used by
          // non-Three views/tests; only the full renderer needs this upgrade.
          if (
            activeRenderer == null ||
            typeof activeRenderer.isReady !== 'function' ||
            typeof activeRenderer.resize !== 'function' ||
            typeof activeRenderer.renderFrame !== 'function' ||
            !activeRenderer.isReady()
          ) {
            await exportVideo.play()
            return
          }

          const liveState = getAppState()
          const previousViewport = {
            height: liveState.viewportHeight,
            width: liveState.viewportWidth,
          }
          const liveLayoutContext = activeRenderer.getRenderLayoutContext?.()
          const exportSize = resolveCompositeVisualizerSize(
            exportCanvasSize.width,
            exportCanvasSize.height,
            previewLayout,
          )
          activeRenderer.resize(exportSize.width, exportSize.height, {
            ...(liveLayoutContext == null ? {} : { layoutContext: liveLayoutContext }),
            pixelRatio: 1,
            postprocessScale: 1,
          })
          const tempoMap = stateSnapshot.precomputedTempoMap
          activeRenderer.renderFrame(tempoMap == null
            ? liveState.currentTick
            : secondsToTick(exportStartTiming.midiVideoPerformanceTimeMs / 1000, tempoMap))

          visualizerResolutionCleanup.current = () => {
            activeRenderer.resize(previousViewport.width, previousViewport.height, {
              ...(liveLayoutContext == null ? {} : { layoutContext: liveLayoutContext }),
            })
            activeRenderer.renderFrame(getAppState().currentTick)
          }
          await exportVideo.play()
        },
        onBeforeDrawFrame: (cameraSourceTimeSeconds) => {
          const activeRenderer = getActiveVisualizerRenderer()
          const tempoMap = stateSnapshot.precomputedTempoMap
          if (activeRenderer == null || !activeRenderer.isReady() || tempoMap == null) return
          const timing = resolveRecordingExportTiming(
            cameraSourceTimeSeconds * 1000,
            preRollSeconds * 1000,
            timelineSnapshot,
          )
          activeRenderer.renderFrame(secondsToTick(timing.midiVideoPerformanceTimeMs / 1000, tempoMap))
        },
        onAfterExportStop: () => {
          playbackEngine.pause()
          playbackEngine.seek(0)
          getActiveVisualizerRenderer()?.setReviewTimelineTick?.(null)
        },
      })
      setCompletedPath(result.outputPath ?? selectedOutputPath)
      setPhase('complete')
    } catch (error) {
      if (abortController.signal.aborted) {
        resetTransientState()
        return
      }
      setErrorMessage(error instanceof Error ? error.message : 'Camera export failed')
      setPhase('error')
    } finally {
      visualizerResolutionCleanup.current?.()
      abortControllerRef.current = null
    }
  }

  const content = phase === 'complete' ? (
    <>
      <ExportComplete
        completedFilePath={completedPath}
        onClose={requestClose}
        onOpenFile={() => {
          if (completedPath != null) {
            void window.electronAPI?.shell.openPath(completedPath).catch(() => undefined)
          }
        }}
      />
      {warningMessage != null ? <p className={styles.warning}>{warningMessage}</p> : null}
    </>
  ) : phase === 'exporting' ? (
    <div className={styles.content}>
      <p className={styles.context}>Exporting {formatSnapshot?.width ?? 0}×{formatSnapshot?.height ?? 0} at {formatSnapshot?.fps ?? 60} FPS...</p>
      <progress className={styles.progress} max={1} value={progress} />
      <p className={styles.context}>{Math.round(progress * 100)}%</p>
      <button className={styles.cancelButton} onClick={() => abortControllerRef.current?.abort()} type="button">Cancel Export</button>
    </div>
  ) : phase === 'error' ? (
    <div className={styles.content}>
      <p className={styles.error}>{errorMessage}</p>
      <button className={styles.primaryButton} onClick={resetTransientState} type="button">Try Again</button>
    </div>
  ) : (
    <div className={styles.content}>
      <section className={styles.contextSection}>
        <h3>Camera Composite</h3>
        <p>Camera source: {formatNativeDimensions(nativeVideoDimensions)}</p>
        <p>Output frame: {currentExportResolution.width}×{currentExportResolution.height}</p>
        <p>Camera audio: {hasCameraAudio ? 'Available' : 'Not captured'} / MIDI audio: {midiAvailable ? 'Available' : 'No audible MIDI'}</p>
        <p>Timeline offsets are included in this export.</p>
      </section>
      <section className={styles.contextSection}>
        <h3>Visualizer Settings</h3>
        <p>Aspect ratio, resolution, and framerate apply to the full composite.</p>
      </section>
      {warningMessage != null ? <p className={styles.warning}>{warningMessage}</p> : null}
      <ExportSettings
        includeAudio={includeAudio}
        onBrowse={() => { void browseOutputPath() }}
        onIncludeAudioChange={setIncludeAudio}
        onOutputPathChange={setOutputPath}
        onStartExport={() => { void startExport() }}
        outputPath={outputPath}
        startDisabled={outputPath.trim().length === 0 || recordingBlob == null}
      />
    </div>
  )

  const sheet = (
    <ExportSheetShell
      canDismiss={!isExporting}
      isOpen={isOpen}
      onClose={requestClose}
      title="Export Camera Video"
      variant="sheet"
    >
      {content}
    </ExportSheetShell>
  )
  const canvasShell = document.querySelector<HTMLElement>('[data-testid="create-visualizer-area"]')
  return canvasShell == null ? sheet : createPortal(sheet, canvasShell)
}

function formatNativeDimensions(dimensions: { height: number; width: number } | null): string {
  return dimensions == null ? 'Reading recording metadata...' : `${dimensions.width}x${dimensions.height}`
}

function toWebmPath(path: string): string {
  if (path.length === 0) {
    return path
  }
  return /\.[^\\/.]+$/.test(path) ? path.replace(/\.[^\\/.]+$/, '.webm') : `${path}.webm`
}
