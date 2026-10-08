import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { exportEngine } from '../../export/ExportEngine'
import { resolveExportDimensions } from '../../export/exportDimensions'
import type { ExportProgress, ExportSettings } from '../../export/types'
import { getAppState, useExportState as useStoreExportState } from '../../store/store'
import type { VisualizerSettings } from '../../store/types'

export type ExportPhase = 'idle' | 'exporting' | 'complete' | 'error'

export interface ExportModalState {
  phase: ExportPhase
  outputPath: string
  includeAudio: boolean
  formatSummary: ExportFormatSummary | null
  framesRendered: number
  totalFrames: number
  progress: number
  estimatedSecondsRemaining: number
  phaseLabel: string
  errorMessage: string | null
  completedFilePath: string | null
}

export interface ExportFormatSummary {
  aspectRatio: VisualizerSettings['aspectRatio']
  fps: VisualizerSettings['framerate']
  height: number
  width: number
}

type LocalExportState = Omit<
  ExportModalState,
  'framesRendered' | 'totalFrames' | 'progress' | 'estimatedSecondsRemaining'
>

const DEFAULT_OUTPUT_PATH = 'export.mp4'

const INITIAL_LOCAL_STATE: LocalExportState = {
  completedFilePath: null,
  errorMessage: null,
  formatSummary: null,
  includeAudio: true,
  outputPath: '',
  phase: 'idle',
  phaseLabel: '',
}

export function useExportState() {
  const storeExportState = useStoreExportState()
  const [localState, setLocalState] = useState<LocalExportState>(INITIAL_LOCAL_STATE)
  const latestLocalStateRef = useRef(localState)
  const hasResolvedDefaultPathRef = useRef(false)
  const cancelRequestedRef = useRef(false)
  const activeExportPathRef = useRef<string | null>(null)

  useEffect(() => {
    latestLocalStateRef.current = localState
  }, [localState])

  useEffect(() => {
    exportEngine.onProgress((progress) => {
      if (cancelRequestedRef.current) {
        return
      }

      if (progress.phase === 'done') {
        setLocalState((previousState) => ({
          ...previousState,
          completedFilePath: activeExportPathRef.current ?? previousState.outputPath,
          errorMessage: null,
          phase: 'complete',
          phaseLabel: 'Complete',
        }))
        return
      }

      setLocalState((previousState) => ({
        ...previousState,
        errorMessage: null,
        phase: 'exporting',
        phaseLabel: phaseToLabel(progress.phase),
      }))
    })

    exportEngine.onError((message) => {
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false
        return
      }

      setLocalState((previousState) => ({
        ...previousState,
        completedFilePath: null,
        errorMessage: message,
        phase: 'error',
        phaseLabel: '',
      }))
    })

    exportEngine.onComplete((outputPath) => {
      if (cancelRequestedRef.current) {
        return
      }

      setLocalState((previousState) => ({
        ...previousState,
        completedFilePath: outputPath,
        errorMessage: null,
        phase: 'complete',
        phaseLabel: 'Complete',
      }))
    })

    return () => {
      exportEngine.onProgress(null)
      exportEngine.onError(null)
      exportEngine.onComplete(null)
    }
  }, [])

  const state = useMemo<ExportModalState>(() => ({
    ...localState,
    estimatedSecondsRemaining: storeExportState.exportEstimatedSecondsRemaining,
    framesRendered: storeExportState.exportFramesRendered,
    progress: storeExportState.exportProgress,
    totalFrames: storeExportState.exportTotalFrames,
  }), [localState, storeExportState])

  const setOutputPath = useCallback((outputPath: string) => {
    setLocalState((previousState) => ({
      ...previousState,
      outputPath,
    }))
  }, [])

  const setIncludeAudio = useCallback((includeAudio: boolean) => {
    setLocalState((previousState) => ({
      ...previousState,
      includeAudio,
    }))
  }, [])

  const browseOutputPath = useCallback(async () => {
    const electronAPI = getElectronAPI()
    if (electronAPI == null) {
      return
    }

    const currentOutputPath = latestLocalStateRef.current.outputPath || DEFAULT_OUTPUT_PATH
    const selectedPath = await electronAPI.dialog.showSaveDialog({
      defaultPath: currentOutputPath,
      filters: [{ name: 'Video', extensions: ['mp4'] }],
    })

    if (selectedPath != null && selectedPath.trim().length > 0) {
      setLocalState((previousState) => ({
        ...previousState,
        outputPath: selectedPath,
      }))
    }
  }, [])

  const ensureDefaultOutputPath = useCallback(async () => {
    if (hasResolvedDefaultPathRef.current || latestLocalStateRef.current.outputPath.trim().length > 0) {
      return
    }

    hasResolvedDefaultPathRef.current = true
    let nextOutputPath = DEFAULT_OUTPUT_PATH
    const electronAPI = getElectronAPI()

    try {
      const resolvedPath = await electronAPI?.dialog.getDefaultExportPath?.()
      if (resolvedPath != null && resolvedPath.trim().length > 0) {
        nextOutputPath = resolvedPath
      }
    } catch {
      nextOutputPath = DEFAULT_OUTPUT_PATH
    }

    setLocalState((previousState) => (
      previousState.outputPath.trim().length > 0
        ? previousState
        : {
          ...previousState,
          outputPath: nextOutputPath,
        }
    ))
  }, [])

  const startExport = useCallback(async () => {
    const currentState = latestLocalStateRef.current
    const outputPath = currentState.outputPath.trim()

    if (outputPath.length === 0) {
      return
    }

    cancelRequestedRef.current = false
    activeExportPathRef.current = outputPath
    getAppState().setExportProgress(0, 0, 0, 0)
    const visualizerSettings = getAppState().visualizerSettings
    const dimensions = resolveExportDimensions(
      visualizerSettings.resolution,
      visualizerSettings.aspectRatio,
    )

    setLocalState((previousState) => ({
      ...previousState,
      completedFilePath: null,
      errorMessage: null,
      formatSummary: {
        aspectRatio: visualizerSettings.aspectRatio,
        fps: visualizerSettings.framerate,
        height: dimensions.height,
        width: dimensions.width,
      },
      phase: 'exporting',
      phaseLabel: 'Rendering frames...',
    }))

    const settings: ExportSettings = {
      includeAudio: currentState.includeAudio,
      outputPath,
    }

    try {
      await exportEngine.export(settings)
    } catch (error: unknown) {
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false
        return
      }

      console.error('[Export] Full error:', error)
      console.error('[Export] Error stack:', error instanceof Error ? error.stack : error)

      setLocalState((previousState) => ({
        ...previousState,
        completedFilePath: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        phase: 'error',
        phaseLabel: '',
      }))
    }
  }, [])

  const cancelExport = useCallback(() => {
    cancelRequestedRef.current = true
    activeExportPathRef.current = null

    setLocalState((previousState) => ({
      ...previousState,
      completedFilePath: null,
      errorMessage: null,
      formatSummary: null,
      phase: 'idle',
      phaseLabel: '',
    }))

    exportEngine.cancel()
  }, [])

  const resetTransientState = useCallback(() => {
    cancelRequestedRef.current = false
    activeExportPathRef.current = null

    setLocalState((previousState) => ({
      ...previousState,
      completedFilePath: null,
      errorMessage: null,
      formatSummary: null,
      phase: 'idle',
      phaseLabel: '',
    }))
  }, [])

  const openFile = useCallback(() => {
    const electronAPI = getElectronAPI()
    const path = latestLocalStateRef.current.completedFilePath

    if (electronAPI == null || path == null || path.length === 0) {
      return
    }

    void electronAPI.shell.openPath(path).catch(() => undefined)
  }, [])

  return {
    browseOutputPath,
    cancelExport,
    ensureDefaultOutputPath,
    openFile,
    resetTransientState,
    setIncludeAudio,
    setOutputPath,
    startExport,
    state,
  }
}

function phaseToLabel(phase: ExportProgress['phase']): string {
  switch (phase) {
    case 'frames':
      return 'Rendering frames...'
    case 'audio':
      return 'Rendering audio...'
    case 'combining':
      return 'Combining video...'
    case 'done':
      return 'Complete'
    default:
      return ''
  }
}

function getElectronAPI() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Export failed'
}
