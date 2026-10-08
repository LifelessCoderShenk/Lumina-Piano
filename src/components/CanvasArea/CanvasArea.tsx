/*
INPUT: The selected renderer plus view-level canvas options.
OUTPUT: A responsive mounted visualizer canvas and optional pointer keyboard interaction.
PURPOSE: Hosts one shared renderer canvas; Transcriptor uses keyboardOnly to retain the full standard keyboard beneath its SVG score.
*/

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { audioScheduler } from '../../audio/AudioScheduler'
import { cameraSystem } from '../../camera/CameraSystem'
import { CreatePlaybackOverlay } from '../CreatePlaybackOverlay/CreatePlaybackOverlay'
import { CreateScoreOverlay } from '../CreateScoreOverlay/CreateScoreOverlay'
import { CreateNoteEditor } from '../CreateNoteEditor/CreateNoteEditor'
import { clearActiveVisualizerCanvas, registerActiveVisualizerCanvas } from '../../renderer/activeCanvas'
import {
  clearActiveVisualizerRenderer,
  registerActiveVisualizerRenderer,
  type ActiveVisualizerRenderer,
} from '../../renderer/activeVisualizerRenderer'
import { renderer } from '../../renderer/Renderer'
import { threeRenderer } from '../../renderer/ThreeRenderer'
import type { VisualizerEngine } from '../../renderer/VisualizerRenderer'
import { getKeyAtCanvasPoint } from '../../renderer/pianoMath'
import type { RenderLayoutContext } from '../../renderer/layoutConstants'
import { getAppState, useAppStore } from '../../store/store'
import type { VisualizerSettings } from '../../store/types'
import styles from './CanvasArea.module.css'

type SupportedAspectRatio = VisualizerSettings['aspectRatio']

interface CanvasDimensions {
  width: number
  height: number
}

export function getConstrainedDimensions(
  availableWidth: number,
  availableHeight: number,
  aspectRatio: SupportedAspectRatio,
): CanvasDimensions {
  if (aspectRatio === 'fit') {
    return {
      width: availableWidth,
      height: availableHeight,
    }
  }

  const [wRatio, hRatio] = aspectRatio.split(':').map(Number)
  const targetRatio = wRatio / hRatio
  const availableRatio = availableWidth / availableHeight

  if (availableRatio > targetRatio) {
    const height = availableHeight
    const width = height * targetRatio
    return { width, height }
  }

  const width = availableWidth
  const height = width / targetRatio
  return { width, height }
}

export interface PointerKeyboardNoteEvent {
  readonly type: 'noteon' | 'noteoff'
  readonly pitch: number
  readonly velocity: number
  readonly timestampMs: number
}

interface CanvasAreaProps {
  aspectRatioOverride?: SupportedAspectRatio
  engine: VisualizerEngine
  onOpenExport?: () => void
  /** Enables mouse play on the rendered piano keyboard. */
  keyboardPointerEnabled?: boolean
  onKeyboardNote?: (event: PointerKeyboardNoteEvent) => void
  /** Renders the static keyboard only; used by Camera Mode's framing setup. */
  guideOnly?: boolean
  /** Hides falling-note effects while preserving the normal keyboard and live highlights. */
  keyboardOnly?: boolean
  /** Keeps file-note travel proportional when Camera/Record expands the note field. */
  noteFieldTravelSeconds?: number
  /** Overrides the rendered piano height while preserving the full canvas. */
  keyboardHeightRatio?: number
}

interface HeldPointerKey {
  pointerId: number
  pitch: number | null
}

const POINTER_NOTE_SOURCE = 'pointer-keyboard'
const RECORD_MIDI_NOTE_SOURCE = 'record-midi'
const POINTER_NOTE_VELOCITY = 100
const MIDI_ACTIVITY_WINDOW_MS = 600

export function CanvasArea({
  aspectRatioOverride,
  engine,
  onOpenExport,
  keyboardPointerEnabled,
  onKeyboardNote,
  guideOnly = false,
  keyboardOnly = false,
  noteFieldTravelSeconds,
  keyboardHeightRatio,
}: CanvasAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const availableAreaRef = useRef<HTMLDivElement>(null)
  const aspectRatioRef = useRef<SupportedAspectRatio>('fit')
  const initializeRendererRef = useRef<(() => void) | null>(null)
  const isInitializingRef = useRef(false)
  const isRendererReadyRef = useRef(false)
  const rendererCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastAppliedRenderSizeRef = useRef<CanvasDimensions | null>(null)
  const layoutContextRef = useRef<Partial<RenderLayoutContext> | null>(null)
  const keyboardNoteCallbackRef = useRef(onKeyboardNote)
  keyboardNoteCallbackRef.current = onKeyboardNote
  const heldPointerKeyRef = useRef<HeldPointerKey | null>(null)
  const [frameSize, setFrameSize] = useState<CanvasDimensions>({ width: 0, height: 0 })
  const appMode = useAppStore((state) => state.appMode)
  const storedAspectRatio = useAppStore((state) => state.visualizerSettings.aspectRatio)
  const aspectRatio = aspectRatioOverride ?? storedAspectRatio
  const isPlaybackRunning = useAppStore((state) => state.isPlaying)
  const showCreatePlaybackOverlay = appMode === 'create'
  const hasImportedScore = useAppStore((state) => state.projectData?.tracks.some((track) => track.notes.some((note) => note.id.startsWith('xml-'))) ?? false)
  const hasEditableNotes = useAppStore((state) => state.projectData?.tracks.some((track) => track.notes.length > 0) ?? false)
  const [showScore, setShowScore] = useState(true)
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const showWindowExpandButton = appMode === 'create'
  const isPointerKeyboardEnabled = keyboardPointerEnabled ?? appMode === 'create'
  const activeRenderer: ActiveVisualizerRenderer = engine === 'three' ? threeRenderer : renderer

  layoutContextRef.current = keyboardHeightRatio == null && noteFieldTravelSeconds == null
    ? null
    : {
        ...(keyboardHeightRatio == null ? {} : { keyboardHeightRatio, preserveKeyboardHeightRatio: true }),
        ...(noteFieldTravelSeconds == null ? {} : { noteFieldTravelSeconds }),
      }

  aspectRatioRef.current = aspectRatio

  const clearPointerKey = useCallback(() => {
    if (heldPointerKeyRef.current == null) {
      return
    }

    const pitch = heldPointerKeyRef.current.pitch
    heldPointerKeyRef.current = null
    if (pitch != null) keyboardNoteCallbackRef.current?.({ type: 'noteoff', pitch, velocity: 0, timestampMs: performance.now() })
    activeRenderer.setLiveNoteSource?.(POINTER_NOTE_SOURCE, [])
  }, [activeRenderer])

  const isPointerKeyboardBlocked = () => (
    isPlaybackRunning ||
    activeRenderer.isLiveNoteSourceActiveOrRecent?.(RECORD_MIDI_NOTE_SOURCE, MIDI_ACTIVITY_WINDOW_MS) === true
  )

  const getPitchFromPointerEvent = (event: React.PointerEvent<HTMLCanvasElement>): number | null => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0 || frameSize.width <= 0 || frameSize.height <= 0) {
      return null
    }

    const x = ((event.clientX - bounds.left) / bounds.width) * frameSize.width
    const y = ((event.clientY - bounds.top) / bounds.height) * frameSize.height
    return getKeyAtCanvasPoint(
      x,
      y,
      frameSize.width,
      frameSize.height,
      activeRenderer.getRenderLayoutContext?.(),
    )
  }

  const setPointerKeyPitch = (pitch: number | null) => {
    const heldPointerKey = heldPointerKeyRef.current
    if (heldPointerKey == null || heldPointerKey.pitch === pitch) {
      return
    }

    const timestampMs = performance.now()
    if (heldPointerKey.pitch != null) keyboardNoteCallbackRef.current?.({ type: 'noteoff', pitch: heldPointerKey.pitch, velocity: 0, timestampMs })
    heldPointerKey.pitch = pitch
    if (pitch != null) keyboardNoteCallbackRef.current?.({ type: 'noteon', pitch, velocity: POINTER_NOTE_VELOCITY, timestampMs })
    activeRenderer.setLiveNoteSource?.(
      POINTER_NOTE_SOURCE,
      pitch == null
        ? []
        : [{
          id: `pointer:${pitch}`,
          pitch,
          startedAtMs: timestampMs,
          velocity: POINTER_NOTE_VELOCITY,
        }],
    )

    if (pitch != null) {
      void audioScheduler.playLiveNote(pitch, POINTER_NOTE_VELOCITY)
    }
  }

  useEffect(() => {
    if (isPlaybackRunning || !isPointerKeyboardEnabled) {
      clearPointerKey()
    }
  }, [isPlaybackRunning, isPointerKeyboardEnabled, clearPointerKey])

  useEffect(() => {
    window.addEventListener('blur', clearPointerKey)
    return () => {
      window.removeEventListener('blur', clearPointerKey)
      clearPointerKey()
      activeRenderer.setLiveNoteSource?.(POINTER_NOTE_SOURCE, [])
    }
  }, [activeRenderer, clearPointerKey])

  useEffect(() => {
    activeRenderer.setGuideOnly?.(guideOnly)

    return () => {
      activeRenderer.setGuideOnly?.(false)
    }
  }, [activeRenderer, guideOnly])

  useEffect(() => {
    activeRenderer.setKeyboardOnly?.(keyboardOnly)

    return () => {
      activeRenderer.setKeyboardOnly?.(false)
    }
  }, [activeRenderer, keyboardOnly])

  const handleKeyboardPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (guideOnly || engine !== 'three' || !isPointerKeyboardEnabled || event.button !== 0 || isPointerKeyboardBlocked() || heldPointerKeyRef.current != null) {
      return
    }

    const pitch = getPitchFromPointerEvent(event)
    if (pitch == null) {
      return
    }

    event.preventDefault()
    heldPointerKeyRef.current = { pointerId: event.pointerId, pitch: null }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPointerKeyPitch(pitch)
  }

  const handleKeyboardPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const heldPointerKey = heldPointerKeyRef.current
    if (heldPointerKey == null || heldPointerKey.pointerId !== event.pointerId) {
      return
    }

    if (isPointerKeyboardBlocked()) {
      clearPointerKey()
      return
    }

    setPointerKeyPitch(getPitchFromPointerEvent(event))
  }

  const handleKeyboardPointerRelease = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (heldPointerKeyRef.current?.pointerId !== event.pointerId) {
      return
    }

    clearPointerKey()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas == null) {
      return
    }

    registerActiveVisualizerCanvas(canvas)

    return () => {
      clearActiveVisualizerCanvas(canvas)
    }
  }, [])

  useEffect(() => {
    registerActiveVisualizerRenderer(activeRenderer)

    return () => {
      clearActiveVisualizerRenderer(activeRenderer)
    }
  }, [activeRenderer])

  useEffect(() => {
    if (canvasRef.current == null || availableAreaRef.current == null) {
      return
    }

    let cancelled = false
    let resizeOuterFrameId: number | null = null
    let resizeInnerFrameId: number | null = null

    const detachRendererCanvasListeners = () => {
      rendererCanvasRef.current?.removeEventListener('webglcontextlost', handleContextLost)
      rendererCanvasRef.current?.removeEventListener('webglcontextrestored', handleContextRestored)
      rendererCanvasRef.current = null
    }

    const attachRendererCanvasListeners = () => {
      if (!isRendererReadyRef.current) {
        return
      }

      const rendererCanvas = activeRenderer.getCanvas()
      if (rendererCanvasRef.current === rendererCanvas) {
        return
      }

      detachRendererCanvasListeners()
      rendererCanvas.addEventListener('webglcontextlost', handleContextLost)
      rendererCanvas.addEventListener('webglcontextrestored', handleContextRestored)
      rendererCanvasRef.current = rendererCanvas
    }

    const syncCanvasElementSize = (width: number, height: number) => {
      if (canvasRef.current == null) {
        return
      }

      canvasRef.current.style.width = `${width}px`
      canvasRef.current.style.height = `${height}px`
    }

    const resizeToAvailableArea = () => {
      const container = availableAreaRef.current
      if (container == null) {
        return false
      }

      const availableWidth = container.clientWidth
      const availableHeight = container.clientHeight
      if (availableWidth <= 0 || availableHeight <= 0) {
        return false
      }

      const nextSize = getConstrainedDimensions(availableWidth, availableHeight, aspectRatioRef.current)
      const previousSize = lastAppliedRenderSizeRef.current
      if (previousSize?.width === nextSize.width && previousSize.height === nextSize.height) {
        return true
      }
      lastAppliedRenderSizeRef.current = nextSize
      setFrameSize((currentSize) => {
        if (currentSize.width === nextSize.width && currentSize.height === nextSize.height) {
          return currentSize
        }

        return nextSize
      })

      syncCanvasElementSize(nextSize.width, nextSize.height)

      if (!cameraSystem.isInitialized()) {
        cameraSystem.init(nextSize.width, nextSize.height)
      } else {
        cameraSystem.setViewportSize(nextSize.width, nextSize.height)
      }

      if (isRendererReadyRef.current) {
        const layoutContext = layoutContextRef.current
        if (layoutContext == null) {
          activeRenderer.resize(nextSize.width, nextSize.height)
        } else {
          activeRenderer.resize(nextSize.width, nextSize.height, {
            layoutContext,
          })
        }
        syncCanvasElementSize(nextSize.width, nextSize.height)
      }

      return true
    }

    const scheduleResize = () => {
      if (resizeOuterFrameId != null) {
        cancelAnimationFrame(resizeOuterFrameId)
      }
      if (resizeInnerFrameId != null) {
        cancelAnimationFrame(resizeInnerFrameId)
      }

      resizeOuterFrameId = window.requestAnimationFrame(() => {
        resizeOuterFrameId = null
        resizeInnerFrameId = window.requestAnimationFrame(() => {
          resizeInnerFrameId = null
          resizeToAvailableArea()
        })
      })
    }

    const initializeRenderer = () => {
      if (isInitializingRef.current || cancelled) {
        return
      }

      if (canvasRef.current == null || availableAreaRef.current == null) {
        return
      }

      if (!resizeToAvailableArea()) {
        return
      }

      isInitializingRef.current = true

      void (async () => {
        try {
          isRendererReadyRef.current = false
          detachRendererCanvasListeners()
          await activeRenderer.destroy()
          if (cancelled || canvasRef.current == null) {
            return
          }

          await activeRenderer.init(canvasRef.current)
          if (cancelled) {
            return
          }

          isRendererReadyRef.current = true
          // Initialization can create post-processing resources after the
          // pre-init measurement. Apply that size once to the ready renderer.
          lastAppliedRenderSizeRef.current = null
          attachRendererCanvasListeners()
          resizeToAvailableArea()
        } finally {
          isInitializingRef.current = false
        }
      })()
    }

    initializeRendererRef.current = initializeRenderer

    const handleWindowResize = () => {
      if (!isRendererReadyRef.current) {
        initializeRenderer()
        return
      }

      scheduleResize()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }

      scheduleResize()

      const state = getAppState()
      if (!isRendererReadyRef.current) {
        return
      }

      activeRenderer.renderFrame(state.currentTick)
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      console.warn(`[Renderer] WebGL context lost for ${engine}`)
      isRendererReadyRef.current = false
      void activeRenderer.destroy()
    }

    const handleContextRestored = () => {
      void (async () => {
        if (canvasRef.current == null) {
          return
        }

        isRendererReadyRef.current = false
        detachRendererCanvasListeners()
        await activeRenderer.destroy()
        if (cancelled || canvasRef.current == null) {
          return
        }

        await activeRenderer.init(canvasRef.current)
        if (cancelled) {
          return
        }

        isRendererReadyRef.current = true
        attachRendererCanvasListeners()
        scheduleResize()
        const state = getAppState()
        if (!isRendererReadyRef.current) {
          return
        }

        activeRenderer.renderFrame(state.currentTick)
      })()
    }

    const handleBeforeUnload = () => {
      isRendererReadyRef.current = false
      detachRendererCanvasListeners()
      void activeRenderer.destroy()
    }

    initializeRenderer()

    window.addEventListener('resize', handleWindowResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      cancelled = true
      lastAppliedRenderSizeRef.current = null
      initializeRendererRef.current = null
      isInitializingRef.current = false
      isRendererReadyRef.current = false
      window.removeEventListener('resize', handleWindowResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      detachRendererCanvasListeners()
      if (resizeOuterFrameId != null) {
        cancelAnimationFrame(resizeOuterFrameId)
      }
      if (resizeInnerFrameId != null) {
        cancelAnimationFrame(resizeInnerFrameId)
      }
      void activeRenderer.destroy()
    }
  }, [activeRenderer, engine])

  useEffect(() => {
    // The Camera/Record note-field timing can change without a DOM resize
    // (for example when switching modes while this canvas remains mounted).
    // Force one measured resize so the renderer receives the new context.
    lastAppliedRenderSizeRef.current = null
    let resizeOuterFrameId: number | null = null
    let resizeInnerFrameId: number | null = null

    const scheduleResize = () => {
      if (resizeOuterFrameId != null) {
        cancelAnimationFrame(resizeOuterFrameId)
      }
      if (resizeInnerFrameId != null) {
        cancelAnimationFrame(resizeInnerFrameId)
      }

      resizeOuterFrameId = window.requestAnimationFrame(() => {
        resizeOuterFrameId = null
        resizeInnerFrameId = window.requestAnimationFrame(() => {
          resizeInnerFrameId = null

          if (!isRendererReadyRef.current) {
            initializeRendererRef.current?.()
            return
          }

          if (availableAreaRef.current == null) {
            return
          }

          const availableWidth = availableAreaRef.current.clientWidth
          const availableHeight = availableAreaRef.current.clientHeight
          if (availableWidth <= 0 || availableHeight <= 0) {
            return
          }

          const nextSize = getConstrainedDimensions(availableWidth, availableHeight, aspectRatio)
          const previousSize = lastAppliedRenderSizeRef.current
          if (previousSize?.width === nextSize.width && previousSize.height === nextSize.height) {
            return
          }
          lastAppliedRenderSizeRef.current = nextSize
          setFrameSize(nextSize)

          if (canvasRef.current != null) {
            canvasRef.current.style.width = `${nextSize.width}px`
            canvasRef.current.style.height = `${nextSize.height}px`
          }

          if (!cameraSystem.isInitialized()) {
            return
          }

          cameraSystem.setViewportSize(nextSize.width, nextSize.height)

          if (isRendererReadyRef.current) {
            const layoutContext = layoutContextRef.current
            if (layoutContext == null) {
              activeRenderer.resize(nextSize.width, nextSize.height)
            } else {
              activeRenderer.resize(nextSize.width, nextSize.height, {
                layoutContext,
              })
            }
            if (canvasRef.current != null) {
              canvasRef.current.style.width = `${nextSize.width}px`
              canvasRef.current.style.height = `${nextSize.height}px`
            }
          }
        })
      })
    }

    const observer = new ResizeObserver(() => {
      scheduleResize()
    })

    if (availableAreaRef.current) {
      observer.observe(availableAreaRef.current)
    }

    scheduleResize()

    return () => {
      observer.disconnect()
      if (resizeOuterFrameId != null) {
        cancelAnimationFrame(resizeOuterFrameId)
      }
      if (resizeInnerFrameId != null) {
        cancelAnimationFrame(resizeInnerFrameId)
      }
    }
  }, [activeRenderer, aspectRatio, keyboardHeightRatio, noteFieldTravelSeconds])

  useEffect(() => {
    const size = lastAppliedRenderSizeRef.current
    if (!isRendererReadyRef.current || size == null) return

    const layoutContext = layoutContextRef.current
    if (layoutContext == null) {
      activeRenderer.resize(size.width, size.height)
    } else {
      activeRenderer.resize(size.width, size.height, { layoutContext })
    }
  }, [activeRenderer, keyboardHeightRatio, noteFieldTravelSeconds])

  const handleWindowExpand = async () => {
    const maximizeWindow = window.electronAPI?.window?.maximize
    if (typeof maximizeWindow === 'function') {
      await maximizeWindow()
    }
  }

  return (
    <div
      data-testid="canvas-area"
      className={styles.canvasArea}
      style={{ flex: '1 1 100%', width: '100%', height: '100%', margin: 0, padding: 0, overflow: 'hidden' }}
    >
      {showWindowExpandButton ? (
        <button
          type="button"
          aria-label="Expand window"
          title="Expand window"
          onClick={() => {
            void handleWindowExpand()
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            background: 'transparent',
            border: '0',
            color: '#2e65a2',
            cursor: 'pointer',
            lineHeight: 1,
            padding: 0,
          }}
        >
          <AppIcon icon={Maximize2} size={20} />
        </button>
      ) : null}
      <div ref={availableAreaRef} data-testid="canvas-available-area" className={styles.availableArea}>
        <div
          data-testid="canvas-preview-frame"
          className={styles.previewFrame}
          style={{
            width: `${frameSize.width}px`,
            height: `${frameSize.height}px`,
          }}
        >
          <canvas
            ref={canvasRef}
            data-testid="visualizer-canvas"
            className={styles.canvas}
            onPointerDown={handleKeyboardPointerDown}
            onPointerMove={handleKeyboardPointerMove}
            onPointerUp={handleKeyboardPointerRelease}
            onPointerCancel={handleKeyboardPointerRelease}
            onLostPointerCapture={handleKeyboardPointerRelease}
            onPointerLeave={handleKeyboardPointerRelease}
            style={{
              width: `${frameSize.width}px`,
              height: `${frameSize.height}px`,
            }}
          />
          {showCreatePlaybackOverlay && hasImportedScore && showScore && !showNoteEditor ? <CreateScoreOverlay /> : null}
          {showCreatePlaybackOverlay && showNoteEditor ? <CreateNoteEditor /> : null}
          {showCreatePlaybackOverlay ? <CreatePlaybackOverlay hasEditor={hasEditableNotes} editorVisible={showNoteEditor} onToggleEditor={() => { setShowNoteEditor((visible) => !visible); setShowScore(false) }} hasScore={hasImportedScore} scoreVisible={showScore && !showNoteEditor} onToggleScore={() => { setShowScore((visible) => !visible); setShowNoteEditor(false) }} onOpenExport={onOpenExport} /> : null}
        </div>
      </div>
    </div>
  )
}
