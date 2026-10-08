import { useCallback, useEffect, useState } from 'react'

import { getActiveVisualizerRenderer } from '../../renderer/activeVisualizerRenderer'
import { cameraOverlayInitial, useAppStore } from '../../store/store'
import {
  getFeedOrientationTransform,
  resolveCameraOrientationGeometry,
  resolveCameraPreviewFrameTransform,
} from './cameraOrientation'

interface SourceVideoDimensions {
  height: number
  width: number
}

export function useCameraAlignment(sourceVideoDimensions?: SourceVideoDimensions | null) {
  const [previewViewport, setPreviewViewport] = useState<HTMLElement | null>(null)
  const [previewViewportSize, setPreviewViewportSize] = useState({ height: 0, width: 0 })
  const alignStep = useAppStore((state) => state.alignStep)
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const setAlignStep = useAppStore((state) => state.setAlignStep)
  const setCameraOverlay = useAppStore((state) => state.setCameraOverlay)
  const setHighCPoint = useAppStore((state) => state.setHighCPoint)
  const setLowAPoint = useAppStore((state) => state.setLowAPoint)

  const geometry = sourceVideoDimensions == null
    ? null
    : resolveCameraOrientationGeometry(
      cameraOverlay,
      sourceVideoDimensions.width,
      sourceVideoDimensions.height,
    )
  useEffect(() => {
    if (previewViewport == null) {
      setPreviewViewportSize({ height: 0, width: 0 })
      return
    }

    const updateViewportSize = () => {
      setPreviewViewportSize({
        height: previewViewport.clientHeight,
        width: previewViewport.clientWidth,
      })
    }
    updateViewportSize()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateViewportSize) : null
    observer?.observe(previewViewport)
    return () => observer?.disconnect()
  }, [previewViewport])

  const setPreviewViewportElement = useCallback((element: HTMLElement | null) => {
    setPreviewViewport(element)
  }, [])

  const previewFrameTransform = geometry == null || sourceVideoDimensions == null
    ? null
    : resolveCameraPreviewFrameTransform(
      geometry,
      sourceVideoDimensions.width,
      sourceVideoDimensions.height,
      previewViewportSize.width,
      previewViewportSize.height,
    )
  const cropFrameStyle = previewFrameTransform == null
    ? {
      // The camera has not supplied metadata yet. Keep the video surface
      // stable rather than deriving a potentially huge CSS frame from typed
      // crop values.
      height: '100%',
      transform: 'translate3d(0, 0, 0) scale(1)',
      transformOrigin: 'top left',
      width: '100%',
    }
    : {
      // Values are source pixels; this is their cover-fit conversion to the
      // live/review viewport's CSS coordinate space. Width/height change
      // only when the viewport or video metadata changes; crop edits update
      // only this transform and stay on the compositor.
      height: `${previewFrameTransform.height}px`,
      transform: previewFrameTransform.transform,
      transformOrigin: 'top left',
      width: `${previewFrameTransform.width}px`,
    }
  const feedOrientationStyle = {
    transform: getFeedOrientationTransform(cameraOverlay),
    transformOrigin: 'center',
  }
  const isAligned = alignStep === 'complete'
  const isAlignmentActive = alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c'

  const startAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    getActiveVisualizerRenderer()?.setKeyboardOpacity(0.3)
    setAlignStep('waiting-low-a')
  }

  const cancelAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    setAlignStep('idle')
    getActiveVisualizerRenderer()?.setKeyboardOpacity(1)
  }

  const resetCameraOverlay = () => {
    setCameraOverlay({ ...cameraOverlayInitial })
  }

  return {
    alignStep,
    cameraOverlay,
    cancelAlignment,
    cropFrameStyle,
    geometry,
    feedOrientationStyle,
    isAligned,
    isAlignmentActive,
    setPreviewViewportElement,
    resetCameraOverlay,
    setCameraOverlay,
    startAlignment,
  }
}
