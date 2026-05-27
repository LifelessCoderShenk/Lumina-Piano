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

    const init = async () => {
      if (canvasRef.current == null || containerRef.current == null) {
        return
      }

      const { width, height } = containerRef.current.getBoundingClientRect()
      if (width <= 0 || height <= 0) {
        return
      }

      if (!cameraSystem.isInitialized()) {
        cameraSystem.init(width, height)
      } else {
        cameraSystem.setViewportSize(width, height)
      }

      // 1. Renderer
      await renderer.init(canvasRef.current)

      if (disposed) {
        return
      }

      renderer.resize(width, height)
    }

    init()

    return () => {
      disposed = true
      renderer.destroy()
    }
  }, [])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width <= 0 || height <= 0) {
        return
      }

      if (!renderer.isReady()) {
        return
      }

      renderer.resize(width, height)
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={styles.canvasArea}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
