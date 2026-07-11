import React, { useEffect, useRef, useState } from 'react'

import { cameraSystem } from '../../camera/CameraSystem'
import { clearActiveVisualizerCanvas, registerActiveVisualizerCanvas } from '../../renderer/activeCanvas'
import { clearActiveVisualizerRenderer, registerActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { renderer } from '../../renderer/Renderer'
import { threeRenderer } from '../../renderer/ThreeRenderer'
import type { VisualizerEngine, VisualizerRenderer } from '../../renderer/VisualizerRenderer'
import { getAppState, useAppStore } from '../../store/store'
import styles from './CanvasArea.module.css'

type SupportedAspectRatio = 'fit' | '16:9' | '1:1' | '4:3'

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

interface CanvasAreaProps {
  engine: VisualizerEngine
}

export function CanvasArea({ engine }: CanvasAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const availableAreaRef = useRef<HTMLDivElement>(null)
  const aspectRatioRef = useRef<SupportedAspectRatio>('fit')
  const initializeRendererRef = useRef<(() => void) | null>(null)
  const isInitializingRef = useRef(false)
  const isRendererReadyRef = useRef(false)
  const rendererCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [frameSize, setFrameSize] = useState<CanvasDimensions>({ width: 0, height: 0 })
  const appMode = useAppStore((state) => state.appMode)
  const aspectRatio = useAppStore((state) => state.visualizerSettings.aspectRatio)
  const showWindowExpandButton = appMode === 'create'
  const activeRenderer: VisualizerRenderer = engine === 'three' ? threeRenderer : renderer

  aspectRatioRef.current = aspectRatio

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
        activeRenderer.resize(nextSize.width, nextSize.height)
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
            activeRenderer.resize(nextSize.width, nextSize.height)
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
  }, [activeRenderer, aspectRatio])

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
            fontSize: 20,
            lineHeight: 1,
            padding: 0,
          }}
        >
          {'<>'}
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
            className={styles.canvas}
            style={{
              width: `${frameSize.width}px`,
              height: `${frameSize.height}px`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
