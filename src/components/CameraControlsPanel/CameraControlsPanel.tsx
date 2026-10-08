import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Crosshair, Crop, FlipHorizontal, FlipVertical, RotateCcw, RotateCw, Undo2 } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { useAppStore } from '../../store/store'
import type { CameraOverlaySettings } from '../../store/types'
import { clampCameraCropValue } from '../shared/cameraOrientation'
import styles from './CameraControlsPanel.module.css'

interface CameraControlsPanelProps {
  disabled?: boolean
  onBack(): void
  sourceVideoDimensions?: { height: number; width: number } | null
}

type CropDraft = Pick<CameraOverlaySettings, 'cropBottom' | 'cropLeft' | 'cropRight' | 'cropTop'>
type CropDraftKey = keyof CropDraft

export function CameraControlsPanel({ disabled = false, onBack, sourceVideoDimensions = null }: CameraControlsPanelProps) {
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const alignStep = useAppStore((state) => state.alignStep)
  const highCPoint = useAppStore((state) => state.highCPoint)
  const lowAPoint = useAppStore((state) => state.lowAPoint)
  const setCameraOverlay = useAppStore((state) => state.setCameraOverlay)
  const setAlignStep = useAppStore((state) => state.setAlignStep)
  const setHighCPoint = useAppStore((state) => state.setHighCPoint)
  const setLowAPoint = useAppStore((state) => state.setLowAPoint)
  const isAligned = alignStep === 'complete' && lowAPoint != null && highCPoint != null
  const [cropDraft, setCropDraft] = useState<CropDraft>(() => getCropDraft(cameraOverlay))
  const cropDraftRef = useRef(cropDraft)
  const cameraOverlayRef = useRef(cameraOverlay)
  const pendingCropFrameRef = useRef<number | null>(null)

  useEffect(() => {
    cameraOverlayRef.current = cameraOverlay
    if (pendingCropFrameRef.current == null) {
      const nextDraft = getCropDraft(cameraOverlay)
      cropDraftRef.current = nextDraft
      setCropDraft(nextDraft)
    }
  }, [cameraOverlay])

  useEffect(() => {
    return () => {
      if (pendingCropFrameRef.current != null) {
        cancelAnimationFrame(pendingCropFrameRef.current)
        pendingCropFrameRef.current = null
        setCameraOverlay(cropDraftRef.current)
      }
    }
  }, [setCameraOverlay])

  const flushCropDraft = () => {
    if (pendingCropFrameRef.current != null) {
      cancelAnimationFrame(pendingCropFrameRef.current)
      pendingCropFrameRef.current = null
    }
    setCameraOverlay(cropDraftRef.current)
  }

  const updateCropDraft = (key: CropDraftKey, rawValue: number) => {
    const overlayForBounds = { ...cameraOverlayRef.current, ...cropDraftRef.current }
    const nextValue = clampCameraCropValue(
      overlayForBounds,
      key.replace('crop', '').toLowerCase() as 'top' | 'right' | 'bottom' | 'left',
      rawValue,
      sourceVideoDimensions?.width,
      sourceVideoDimensions?.height,
    )
    const nextDraft = { ...cropDraftRef.current, [key]: nextValue }
    cropDraftRef.current = nextDraft
    setCropDraft(nextDraft)

    if (pendingCropFrameRef.current != null) {
      return
    }
    pendingCropFrameRef.current = requestAnimationFrame(() => {
      pendingCropFrameRef.current = null
      setCameraOverlay(cropDraftRef.current)
    })
  }

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
    <section className={`${styles.panel} ${disabled ? styles.disabled : ''}`} data-testid="camera-controls-panel" aria-disabled={disabled}>
      <button
        type="button"
        className={styles.backButton}
        onClick={onBack}
      >
        <AppIcon className={styles.buttonIcon} icon={ArrowLeft} size={18} />
        Pieces
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
          disabled={disabled}
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
          disabled={disabled}
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
          disabled={disabled}
          onChange={(event) => {
            setCameraOverlay({ scale: Number(event.target.value) })
          }}
        />
      </label>

      <div className={styles.controlGroup}>
        <span className={styles.label}>ORIENTATION</span>
        <div className={styles.orientationToggles}>
          <button
            type="button"
            className={styles.orientationButton}
            aria-pressed={cameraOverlay.flipHorizontal}
            disabled={disabled}
            onClick={() => setCameraOverlay({ flipHorizontal: !cameraOverlay.flipHorizontal })}
          >
            <AppIcon className={styles.buttonIcon} icon={FlipHorizontal} size={16} />
            Flip Horizontal
          </button>
          <button
            type="button"
            className={styles.orientationButton}
            aria-pressed={cameraOverlay.flipVertical}
            disabled={disabled}
            onClick={() => setCameraOverlay({ flipVertical: !cameraOverlay.flipVertical })}
          >
            <AppIcon className={styles.buttonIcon} icon={FlipVertical} size={16} />
            Flip Vertical
          </button>
        </div>
        <div className={styles.rotationControl}>
          <button
            type="button"
            className={styles.orientationButton}
            aria-label="Rotate Left"
            disabled={disabled}
            onClick={() => setCameraOverlay({ rotation: getNextRotation(cameraOverlay.rotation, -90) })}
          >
            <AppIcon icon={RotateCcw} size={18} />
          </button>
          <output className={styles.rotationValue} aria-label="Rotation">{cameraOverlay.rotation}°</output>
          <button
            type="button"
            className={styles.orientationButton}
            aria-label="Rotate Right"
            disabled={disabled}
            onClick={() => setCameraOverlay({ rotation: getNextRotation(cameraOverlay.rotation, 90) })}
          >
            <AppIcon icon={RotateCw} size={18} />
          </button>
        </div>
      </div>

      <div className={styles.controlGroup}>
        <span className={styles.label}><AppIcon className={styles.labelIcon} icon={Crop} size={16} />CROP</span>
        <div className={styles.cropGrid}>
          <label className={styles.cropField}>
            <span className={styles.cropLabel}>Top</span>
            <input
              aria-label="Crop Top"
              className={styles.numberInput}
              type="number"
              min="0"
              step="5"
              value={cropDraft.cropTop}
              disabled={disabled}
              onChange={(event) => {
                updateCropDraft('cropTop', Number(event.target.value))
              }}
              onBlur={flushCropDraft}
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
              value={cropDraft.cropRight}
              disabled={disabled}
              onChange={(event) => {
                updateCropDraft('cropRight', Number(event.target.value))
              }}
              onBlur={flushCropDraft}
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
              value={cropDraft.cropBottom}
              disabled={disabled}
              onChange={(event) => {
                updateCropDraft('cropBottom', Number(event.target.value))
              }}
              onBlur={flushCropDraft}
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
              value={cropDraft.cropLeft}
              disabled={disabled}
              onChange={(event) => {
                updateCropDraft('cropLeft', Number(event.target.value))
              }}
              onBlur={flushCropDraft}
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.resetCropButton}
          disabled={disabled}
          onClick={() => {
            if (pendingCropFrameRef.current != null) {
              cancelAnimationFrame(pendingCropFrameRef.current)
              pendingCropFrameRef.current = null
            }
            const resetDraft = { cropBottom: 0, cropLeft: 0, cropRight: 0, cropTop: 0 }
            cropDraftRef.current = resetDraft
            setCropDraft(resetDraft)
            setCameraOverlay({
              cropBottom: 0,
              cropLeft: 0,
              cropRight: 0,
              cropTop: 0,
            })
          }}
        >
          <AppIcon className={styles.buttonIcon} icon={Undo2} size={16} />
          Reset Crop
        </button>
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
        disabled={disabled}
        onClick={startAlignment}
      >
        <AppIcon className={styles.buttonIcon} icon={Crosshair} size={18} />
        ALIGN
      </button>

      {alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c' ? (
        <button
          type="button"
          className={styles.cancelButton}
          disabled={disabled}
          onClick={cancelAlignment}
        >
          Cancel
        </button>
      ) : null}
    </section>
  )
}

function getCropDraft(overlay: CameraOverlaySettings): CropDraft {
  return {
    cropBottom: overlay.cropBottom,
    cropLeft: overlay.cropLeft,
    cropRight: overlay.cropRight,
    cropTop: overlay.cropTop,
  }
}

function getNextRotation(rotation: CameraOverlaySettings['rotation'], delta: number): CameraOverlaySettings['rotation'] {
  return (((rotation + delta) % 360 + 360) % 360) as CameraOverlaySettings['rotation']
}
