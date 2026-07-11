import React, { useEffect } from 'react'

import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { useAppStore } from '../../store/store'
import styles from './CameraControlsPanel.module.css'

interface CameraControlsPanelProps {
  onBack(): void
}

export function CameraControlsPanel({ onBack }: CameraControlsPanelProps) {
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const alignStep = useAppStore((state) => state.alignStep)
  const highCPoint = useAppStore((state) => state.highCPoint)
  const lowAPoint = useAppStore((state) => state.lowAPoint)
  const setCameraOverlay = useAppStore((state) => state.setCameraOverlay)
  const setAlignStep = useAppStore((state) => state.setAlignStep)
  const setHighCPoint = useAppStore((state) => state.setHighCPoint)
  const setLowAPoint = useAppStore((state) => state.setLowAPoint)
  const isAligned = alignStep === 'complete' && lowAPoint != null && highCPoint != null

  useEffect(() => {
    return () => {
      setAlignStep('idle')
      setLowAPoint(null)
      setHighCPoint(null)
      getActiveVisualizerRenderer()?.setKeyboardOpacity(1)
    }
  }, [setAlignStep, setHighCPoint, setLowAPoint])

  const cancelAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    setAlignStep('idle')
    getActiveVisualizerRenderer()?.setKeyboardOpacity(1)
  }

  const startAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    getActiveVisualizerRenderer()?.setKeyboardOpacity(0.3)
    setAlignStep('waiting-low-a')
  }

  return (
    <section className={styles.panel} data-testid="camera-controls-panel">
      <button
        type="button"
        className={styles.backButton}
        onClick={onBack}
      >
        {'← Pieces'}
      </button>

      <label className={styles.controlGroup}>
        <span className={styles.labelRow}>
          <span className={styles.label}>MOVE X</span>
          <span className={styles.value}>{cameraOverlay.offsetX}px</span>
        </span>
        <input
          aria-label="Move X"
          className={styles.slider}
          type="range"
          min="-500"
          max="500"
          value={cameraOverlay.offsetX}
          onChange={(event) => {
            setCameraOverlay({ offsetX: Number(event.target.value) })
          }}
        />
      </label>

      <label className={styles.controlGroup}>
        <span className={styles.labelRow}>
          <span className={styles.label}>MOVE Y</span>
          <span className={styles.value}>{cameraOverlay.offsetY}px</span>
        </span>
        <input
          aria-label="Move Y"
          className={styles.slider}
          type="range"
          min="-500"
          max="500"
          value={cameraOverlay.offsetY}
          onChange={(event) => {
            setCameraOverlay({ offsetY: Number(event.target.value) })
          }}
        />
      </label>

      <label className={styles.controlGroup}>
        <span className={styles.labelRow}>
          <span className={styles.label}>SCALE</span>
          <span className={styles.value}>{cameraOverlay.scale.toFixed(2)}x</span>
        </span>
        <input
          aria-label="Scale"
          className={styles.slider}
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={cameraOverlay.scale}
          onChange={(event) => {
            setCameraOverlay({ scale: Number(event.target.value) })
          }}
        />
      </label>

      <div className={styles.controlGroup}>
        <span className={styles.label}>CROP</span>
        <div className={styles.cropGrid}>
          <label className={styles.cropField}>
            <span className={styles.cropLabel}>Top</span>
            <input
              aria-label="Crop Top"
              className={styles.numberInput}
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropTop}
              onChange={(event) => {
                setCameraOverlay({ cropTop: Number(event.target.value) })
              }}
            />
          </label>
          <label className={styles.cropField}>
            <span className={styles.cropLabel}>Right</span>
            <input
              aria-label="Crop Right"
              className={styles.numberInput}
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropRight}
              onChange={(event) => {
                setCameraOverlay({ cropRight: Number(event.target.value) })
              }}
            />
          </label>
          <label className={styles.cropField}>
            <span className={styles.cropLabel}>Bottom</span>
            <input
              aria-label="Crop Bottom"
              className={styles.numberInput}
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropBottom}
              onChange={(event) => {
                setCameraOverlay({ cropBottom: Number(event.target.value) })
              }}
            />
          </label>
          <label className={styles.cropField}>
            <span className={styles.cropLabel}>Left</span>
            <input
              aria-label="Crop Left"
              className={styles.numberInput}
              type="number"
              min="0"
              step="5"
              value={cameraOverlay.cropLeft}
              onChange={(event) => {
                setCameraOverlay({ cropLeft: Number(event.target.value) })
              }}
            />
          </label>
        </div>
      </div>

      {alignStep === 'waiting-low-a' ? (
        <p className={styles.alignInstruction}>
          Click the lowest A key on your piano in the camera feed
        </p>
      ) : null}
      {alignStep === 'waiting-high-c' ? (
        <p className={styles.alignInstruction}>
          Now click the highest C key on your piano in the camera feed
        </p>
      ) : null}
      {isAligned ? (
        <p className={styles.alignInstruction}>
          Aligned - adjust with Move X/Y if needed
        </p>
      ) : null}

      <button
        type="button"
        className={styles.alignButton}
        onClick={startAlignment}
      >
        ALIGN
      </button>

      {alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c' ? (
        <button
          type="button"
          className={styles.cancelButton}
          onClick={cancelAlignment}
        >
          Cancel
        </button>
      ) : null}
    </section>
  )
}
