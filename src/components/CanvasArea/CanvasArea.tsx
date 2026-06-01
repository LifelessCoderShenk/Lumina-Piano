import React, { useEffect, useRef } from 'react'
import { getAppState } from '../../store/store'
import { renderer } from '../../renderer/Renderer'
import { cameraSystem } from '../../camera/CameraSystem'
import styles from './CanvasArea.module.css'

export function CanvasArea() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (canvasRef.current == null || containerRef.current == null) {
      return
    }

    let disposed = false
    let resizeFrameId: number | null = null

    const resizeToContainer = () => {
      if (containerRef.current == null) {
        return false
      }

      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      if (width <= 0 || height <= 0) {
        return false
      }

      if (!cameraSystem.isInitialized()) {
        cameraSystem.init(width, height)
      } else {
        cameraSystem.setViewportSize(width, height)
      }

      if (renderer.isReady()) {
        renderer.resize(width, height)
      }

      return true
    }

    const scheduleResize = () => {
      if (resizeFrameId != null) {
        cancelAnimationFrame(resizeFrameId)
      }

      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = null
        resizeToContainer()
      })
    }

    const init = async () => {
      if (canvasRef.current == null || containerRef.current == null) {
        return
      }

      if (!resizeToContainer()) {
        return
      }

      renderer.destroy()

      await renderer.init(canvasRef.current)

      if (disposed) {
        return
      }

      scheduleResize()
    }

    init()

    const handleWindowResize = () => {
      scheduleResize()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }

      scheduleResize()

      const state = getAppState()
      if (renderer.isReady() && state.projectData != null && state.isProjectLoaded) {
        renderer.renderFrame(state.currentTick)
      }
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      console.warn('[Renderer] WebGL context lost')

      renderer.destroy()
    }

    const handleContextRestored = () => {
      console.log('[Renderer] WebGL context restored — reinitializing')

      if (canvasRef.current == null) {
        return
      }

      renderer.destroy()

      void renderer.init(canvasRef.current).then(() => {
        scheduleResize()
        const state = getAppState()
        if (state.projectData != null && state.isProjectLoaded) {
          renderer.renderFrame(state.currentTick)
        }
      })
    }

    const handleBeforeUnload = () => {
      renderer.destroy()
    }

    window.addEventListener('resize', handleWindowResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    canvasRef.current.addEventListener('webglcontextlost', handleContextLost)
    canvasRef.current.addEventListener('webglcontextrestored', handleContextRestored)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleWindowResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      canvasRef.current?.removeEventListener('webglcontextlost', handleContextLost)
      canvasRef.current?.removeEventListener('webglcontextrestored', handleContextRestored)
      if (resizeFrameId != null) {
        cancelAnimationFrame(resizeFrameId)
      }
    }
  }, [])

  useEffect(() => {
    let resizeFrameId: number | null = null

    const scheduleResize = () => {
      if (resizeFrameId != null) {
        cancelAnimationFrame(resizeFrameId)
      }

      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = null

        if (containerRef.current == null) {
          return
        }

        const width = containerRef.current.clientWidth
        const height = containerRef.current.clientHeight
        if (width <= 0 || height <= 0 || !renderer.isReady()) {
          return
        }

        if (!cameraSystem.isInitialized()) {
          return
        }

        cameraSystem.setViewportSize(width, height)
        renderer.resize(width, height)
      })
    }

    const observer = new ResizeObserver(() => {
      scheduleResize()
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      observer.disconnect()
      if (resizeFrameId != null) {
        cancelAnimationFrame(resizeFrameId)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={styles.canvasArea}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
