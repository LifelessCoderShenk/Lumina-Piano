import { useMemo } from 'react'

import { usePlaybackState, useProjectData } from '../../store/store'
import { tickToSeconds } from '../../tempo/tempoMap'

export interface TransportTimeState {
  currentTimeStr: string
  totalTimeStr: string
  currentProgress: number
}

export function useTransportTime(): TransportTimeState {
  const { currentTick } = usePlaybackState()
  const { isProjectLoaded, precomputedTempoMap, projectData } = useProjectData()

  return useMemo(() => {
    if (!isProjectLoaded || projectData == null || precomputedTempoMap == null) {
      return {
        currentProgress: 0,
        currentTimeStr: '0:00.000',
        totalTimeStr: '0:00',
      }
    }

    const currentSeconds = tickToSeconds(currentTick, precomputedTempoMap)
    const totalSeconds = tickToSeconds(projectData.totalTicks, precomputedTempoMap)
    const totalTicks = projectData.totalTicks

    return {
      currentProgress: totalTicks > 0 ? currentTick / totalTicks : 0,
      currentTimeStr: formatTimeWithMilliseconds(currentSeconds),
      totalTimeStr: formatTimeShort(totalSeconds),
    }
  }, [currentTick, isProjectLoaded, precomputedTempoMap, projectData])
}

function formatTimeWithMilliseconds(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  const wholeSeconds = Math.floor(remainingSeconds)
  const milliseconds = Math.floor((remainingSeconds - wholeSeconds) * 1000)

  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}

function formatTimeShort(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)

  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}`
}
