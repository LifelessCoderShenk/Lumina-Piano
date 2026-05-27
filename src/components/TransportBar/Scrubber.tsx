import { useCallback, useEffect, useRef, useState } from 'react'

import { DensityOverview } from './DensityOverview'
import styles from './Scrubber.module.css'

export interface ScrubberProps {
  progress: number
  onSeek: (progress: number) => void
  densityData: number[]
  ariaValueMin?: number
  ariaValueMax?: number
  ariaValueNow?: number
  disabled?: boolean
}

export function Scrubber({
  ariaValueMax = 0,
  ariaValueMin = 0,
  ariaValueNow = 0,
  densityData,
  disabled = false,
  onSeek,
  progress,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const displayProgress = clamp(dragProgress ?? progress, 0, 1)

  const getProgressFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (track == null) {
      return 0
    }

    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) {
      return 0
    }

    return clamp((clientX - rect.left) / rect.width, 0, 1)
  }, [])

  const handleSeekAtClientX = useCallback(
    (clientX: number) => {
      const nextProgress = getProgressFromClientX(clientX)
      setDragProgress(nextProgress)
      onSeek(nextProgress)
    },
    [getProgressFromClientX, onSeek],
  )

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }

    event.preventDefault()
    setIsDragging(true)
    handleSeekAtClientX(event.clientX)
  }

  useEffect(() => {
    if (!isDragging) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      handleSeekAtClientX(event.clientX)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setDragProgress(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleSeekAtClientX, isDragging])

  useEffect(() => {
    if (!isDragging) {
      setDragProgress(null)
    }
  }, [isDragging, progress])

  return (
    <div className={styles.scrubber}>
      <div
        aria-disabled={disabled}
        aria-valuemax={ariaValueMax}
        aria-valuemin={ariaValueMin}
        aria-valuenow={ariaValueNow}
        className={styles.track}
        onMouseDown={handleMouseDown}
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
      >
        <DensityOverview densityData={densityData} />
        <div className={styles.trackInner}>
          <div
            className={styles.progressFill}
            style={{ width: `${displayProgress * 100}%` }}
          />
        </div>
        <div
          className={styles.playhead}
          style={{ left: `${displayProgress * 100}%` }}
        />
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
