import React, { useEffect, useRef } from 'react'
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

      // 1. Renderer
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

    window.addEventListener('resize', handleWindowResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleWindowResize)
      if (resizeFrameId != null) {
        cancelAnimationFrame(resizeFrameId)
      }
      renderer.destroy()
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
