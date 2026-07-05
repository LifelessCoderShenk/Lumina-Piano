import React, { useEffect, useRef, useState } from 'react'

import { cameraSystem } from '../../camera/CameraSystem'
import { renderer } from '../../renderer/Renderer'
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

export function CanvasArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const availableAreaRef = useRef<HTMLDivElement>(null)
  const aspectRatioRef = useRef<SupportedAspectRatio>('fit')
  const initializeRendererRef = useRef<(() => void) | null>(null)
  const isInitializingRef = useRef(false)
  const [frameSize, setFrameSize] = useState<CanvasDimensions>({ width: 0, height: 0 })
  const appMode = useAppStore((state) => state.appMode)
  const aspectRatio = useAppStore((state) => state.visualizerSettings.aspectRatio)
  const showWindowExpandButton = appMode === 'create'

  aspectRatioRef.current = aspectRatio

  useEffect(() => {
    if (canvasRef.current == null || availableAreaRef.current == null) {
      return
    }

    let cancelled = false
    let resizeOuterFrameId: number | null = null
    let resizeInnerFrameId: number | null = null

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

      if (renderer.isReady()) {
        renderer.resize(nextSize.width, nextSize.height)
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
          await renderer.destroy()
          if (cancelled || canvasRef.current == null) {
            return
          }

          await renderer.init(canvasRef.current)
          if (cancelled) {
            return
          }

          resizeToAvailableArea()
        } finally {
          isInitializingRef.current = false
        }
      })()
    }

    initializeRendererRef.current = initializeRenderer

    const handleWindowResize = () => {
      if (!renderer.isReady()) {
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
      if (!renderer.isInitialized) {
        return
      }

      if (renderer.isReady()) {
        renderer.renderFrame(state.currentTick)
      }
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      console.warn('[Renderer] WebGL context lost')
      void renderer.destroy()
    }

    const handleContextRestored = () => {
      void (async () => {
        if (canvasRef.current == null) {
          return
        }

        await renderer.destroy()
        if (cancelled || canvasRef.current == null) {
          return
        }

        await renderer.init(canvasRef.current)
        if (cancelled) {
          return
        }

        scheduleResize()
        const state = getAppState()
        if (!renderer.isInitialized) {
          return
        }

        if (renderer.isReady()) {
          renderer.renderFrame(state.currentTick)
        }
      })()
    }

    const handleBeforeUnload = () => {
      void renderer.destroy()
    }

    initializeRenderer()

    window.addEventListener('resize', handleWindowResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    canvasRef.current.addEventListener('webglcontextlost', handleContextLost)
    canvasRef.current.addEventListener('webglcontextrestored', handleContextRestored)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      cancelled = true
      initializeRendererRef.current = null
      isInitializingRef.current = false
      window.removeEventListener('resize', handleWindowResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      canvasRef.current?.removeEventListener('webglcontextlost', handleContextLost)
      canvasRef.current?.removeEventListener('webglcontextrestored', handleContextRestored)
      if (resizeOuterFrameId != null) {
        cancelAnimationFrame(resizeOuterFrameId)
      }
      if (resizeInnerFrameId != null) {
        cancelAnimationFrame(resizeInnerFrameId)
      }
      void renderer.destroy()
    }
  }, [])

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

          if (!renderer.isReady()) {
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

          if (renderer.isReady()) {
            renderer.resize(nextSize.width, nextSize.height)
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
  }, [aspectRatio])

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
