import { renderer } from '../../renderer/Renderer'
import { cameraOverlayInitial, useAppStore } from '../../store/store'

export function useCameraAlignment() {
  const alignStep = useAppStore((state) => state.alignStep)
  const cameraOverlay = useAppStore((state) => state.cameraOverlay)
  const setAlignStep = useAppStore((state) => state.setAlignStep)
  const setCameraOverlay = useAppStore((state) => state.setCameraOverlay)
  const setHighCPoint = useAppStore((state) => state.setHighCPoint)
  const setLowAPoint = useAppStore((state) => state.setLowAPoint)

  const cropTop = Math.max(0, cameraOverlay.cropTop)
  const cropRight = Math.max(0, cameraOverlay.cropRight)
  const cropBottom = Math.max(0, cameraOverlay.cropBottom)
  const cropLeft = Math.max(0, cameraOverlay.cropLeft)
  const cropFrameStyle = {
    height: `calc(100% + ${cropTop + cropBottom}px)`,
    left: `-${cropLeft}px`,
    top: `-${cropTop}px`,
    width: `calc(100% + ${cropLeft + cropRight}px)`,
  }
  const isAligned = alignStep === 'complete'
  const isAlignmentActive = alignStep === 'waiting-low-a' || alignStep === 'waiting-high-c'

  const startAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    renderer.setKeyboardOpacity(0.3)
    setAlignStep('waiting-low-a')
  }

  const cancelAlignment = () => {
    setLowAPoint(null)
    setHighCPoint(null)
    setAlignStep('idle')
    renderer.setKeyboardOpacity(1)
  }

  const resetCameraOverlay = () => {
    setCameraOverlay({ ...cameraOverlayInitial })
  }

  return {
    alignStep,
    cameraOverlay,
    cancelAlignment,
    cropBottom,
    cropFrameStyle,
    cropLeft,
    cropRight,
    cropTop,
    isAligned,
    isAlignmentActive,
    resetCameraOverlay,
    setCameraOverlay,
    startAlignment,
  }
}
