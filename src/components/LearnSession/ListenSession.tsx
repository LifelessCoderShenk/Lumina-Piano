import React, { useEffect, useRef, useState } from 'react'

import { audioScheduler } from '../../audio/AudioScheduler'
import { loadMidiFileFromPath } from '../../midi/loadMidiProject'
import type { Note, ProjectData } from '../../midi/types'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { renderer } from '../../renderer/Renderer'
import { useAppStore, usePlaybackState } from '../../store/store'
import styles from './ListenSession.module.css'

const TEMPO_PRESETS = [0.5, 0.75, 1.0] as const
const WAVEFORM_COMPLETED_COLOR = '#3b82f6'
const WAVEFORM_PENDING_COLOR = 'rgba(255, 255, 255, 0.4)'

export function ListenSession() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const tempoMultiplier = useAppStore((state) => state.learnV3.sessionConfig.tempoMultiplier)
  const projectData = useAppStore((state) => state.projectData)
  const { currentTick, isPlaying } = usePlaybackState()
  const endSession = useAppStore((state) => state.endSession)
  const exitSession = useAppStore((state) => state.exitSession)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setNoteLabelsOnKeys = useAppStore((state) => state.setNoteLabelsOnKeys)
  const setNoteLabelsOnNotes = useAppStore((state) => state.setNoteLabelsOnNotes)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showWaveform, setShowWaveform] = useState(true)
  const [activeTempoMultiplier, setActiveTempoMultiplier] = useState(tempoMultiplier)
  const sessionExitReasonRef = useRef<'back' | 'ended' | null>(null)
  const restoreSessionDefaultsRef = useRef<(() => void) | null>(null)
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const waveformColumnsRef = useRef<number[]>([])
  const completedUpToXRef = useRef(0)

  useEffect(() => {
    let disposed = false
    const previousSettings = {
      noteLabelsOnKeys: useAppStore.getState().noteLabelsOnKeys,
      noteLabelsOnNotes: useAppStore.getState().noteLabelsOnNotes,
    }

    setNoteLabelsOnNotes(true)
    setNoteLabelsOnKeys(true)

    const handleEnded = () => {
      sessionExitReasonRef.current = 'ended'
      endSession()
      setAppMode('learnEnd')
    }

    restoreSessionDefaultsRef.current = () => {
      setNoteLabelsOnNotes(previousSettings.noteLabelsOnNotes)
      setNoteLabelsOnKeys(previousSettings.noteLabelsOnKeys)
    }

    const startSession = async () => {
      await playbackEngine.setTempoMultiplier(tempoMultiplier)
      setActiveTempoMultiplier(tempoMultiplier)
      renderer.forceResume()
      setErrorMessage(null)

      try {
        if (useAppStore.getState().projectData == null) {
          const electronApi = window.electronAPI
          if (electronApi == null || typeof electronApi.getSongs !== 'function') {
            throw new Error('Song library is unavailable.')
          }

          const songs = await electronApi.getSongs()
          if (disposed) {
            return
          }

          const song = songs.find((entry) => entry.id === selectedSongId) ?? null
          const filePath = song?.filePath ?? song?.file
          if (filePath == null || filePath.length === 0) {
            throw new Error('Selected song file could not be found.')
          }

          await loadMidiFileFromPath(filePath)
          if (disposed) {
            return
          }
        }

        playbackEngine.seek(0)
        await audioScheduler.warmUpAudio()
        if (disposed) {
          return
        }

        playbackEngine.play()
      } catch (error) {
        console.error('Failed to start listen session:', error)
        if (!disposed) {
          setErrorMessage('Failed to start listen session.')
        }
      }
    }

    playbackEngine.on('onEnded', handleEnded)
    void startSession()

    return () => {
      disposed = true
      playbackEngine.off('onEnded', handleEnded)
      playbackEngine.pause()
      playbackEngine.seek(0)
      playbackEngine.setTempoMultiplier(1.0)
      restoreSessionDefaultsRef.current = null

      if (sessionExitReasonRef.current == null) {
        exitSession()
        setAppMode('learnSong')
      }
    }
  }, [
    endSession,
    exitSession,
    selectedSongId,
    setAppMode,
    setNoteLabelsOnKeys,
    setNoteLabelsOnNotes,
    tempoMultiplier,
  ])

  const totalTicks = projectData?.totalTicks ?? 0
  const tempoDisplay = formatTempoDisplay(activeTempoMultiplier)

  useEffect(() => {
    if (!showWaveform) {
      return
    }

    drawWaveform({
      canvas: waveformCanvasRef.current,
      columnsRef: waveformColumnsRef,
      completedUpToXRef,
      currentTick,
      projectData,
      totalTicks,
    })
  }, [currentTick, projectData, showWaveform, totalTicks])

  useEffect(() => {
    if (!showWaveform) {
      return
    }

    const handleResize = () => {
      drawWaveform({
        canvas: waveformCanvasRef.current,
        columnsRef: waveformColumnsRef,
        completedUpToXRef,
        currentTick,
        projectData,
        totalTicks,
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [currentTick, projectData, showWaveform, totalTicks])

  return (
    <section className={styles.overlay} data-testid="listen-session-top-bar">
      {errorMessage != null ? (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className={styles.sessionBar}>
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={async () => {
              sessionExitReasonRef.current = 'back'
              playbackEngine.pause()
              playbackEngine.seek(0)
              void playbackEngine.setTempoMultiplier(1.0)
              await renderer.destroy()
              restoreSessionDefaultsRef.current?.()
              exitSession()
              setAppMode('learnSong')
            }}
            aria-label="Back to song page"
          >
            Back
          </button>

          <button
            type="button"
            className={styles.controlButton}
            onClick={() => {
              if (isPlaying) {
                playbackEngine.pause()
                return
              }

              playbackEngine.play()
            }}
            aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            className={`${styles.controlButton} ${styles.tempoButton}`}
            onClick={async () => {
              const nextTempo = getNextTempoPreset(activeTempoMultiplier)
              setActiveTempoMultiplier(nextTempo)
              await playbackEngine.setTempoMultiplier(nextTempo)
              renderer.forceResume()
            }}
            aria-label="Tempo multiplier"
          >
            {tempoDisplay}
          </button>

          <div />

          <button
            type="button"
            className={`${styles.controlButton} ${styles.waveformToggle}`}
            onClick={() => {
              setShowWaveform((current) => !current)
            }}
            aria-label={showWaveform ? 'Hide waveform' : 'Show waveform'}
            title={showWaveform ? 'Hide waveform' : 'Show waveform'}
          >
            {showWaveform ? 'Hide' : 'Show'}
          </button>
        </div>

        {showWaveform ? (
          <div className={styles.waveformRow}>
            <canvas
              ref={waveformCanvasRef}
              className={styles.waveformCanvas}
              aria-label="Session waveform"
              onClick={(event) => {
                const canvas = waveformCanvasRef.current
                if (canvas == null || totalTicks <= 0) {
                  return
                }

                const rect = canvas.getBoundingClientRect()
                const width = rect.width || canvas.clientWidth || 1
                const ratio = clamp((event.clientX - rect.left) / width, 0, 1)
                const tick = Math.round(totalTicks * ratio)
                playbackEngine.seek(tick)
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function formatTempoDisplay(tempoMultiplier: number): string {
  const fixed = tempoMultiplier.toFixed(2)
  if (fixed.endsWith('00')) {
    return `${tempoMultiplier.toFixed(1)}x`
  }

  if (fixed.endsWith('0')) {
    return `${fixed.slice(0, -1)}x`
  }

  return `${fixed}x`
}

function getNextTempoPreset(currentTempo: number): number {
  const currentIndex = TEMPO_PRESETS.findIndex((tempo) => tempo === currentTempo)
  if (currentIndex === -1) {
    return TEMPO_PRESETS[TEMPO_PRESETS.length - 1]
  }

  return TEMPO_PRESETS[(currentIndex + 1) % TEMPO_PRESETS.length]
}

function drawWaveform({
  canvas,
  columnsRef,
  completedUpToXRef,
  currentTick,
  projectData,
  totalTicks,
}: {
  canvas: HTMLCanvasElement | null
  columnsRef: React.MutableRefObject<number[]>
  completedUpToXRef: React.MutableRefObject<number>
  currentTick: number
  projectData: ProjectData | null
  totalTicks: number
}): void {
  if (canvas == null || projectData == null || totalTicks <= 0) {
    return
  }

  const context = canvas.getContext('2d')
  if (context == null) {
    return
  }

  const width = Math.max(1, Math.floor(canvas.clientWidth || canvas.getBoundingClientRect().width || 0))
  const height = Math.max(1, Math.floor(canvas.clientHeight || canvas.getBoundingClientRect().height || 48))
  const devicePixelRatio = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
    ? Math.max(1, window.devicePixelRatio)
    : 1

  const scaledWidth = Math.max(1, Math.floor(width * devicePixelRatio))
  const scaledHeight = Math.max(1, Math.floor(height * devicePixelRatio))
  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth
    canvas.height = scaledHeight
  }

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.scale(devicePixelRatio, devicePixelRatio)

  const columnCount = Math.max(1, Math.floor(width / 2))
  const columns = buildWaveformColumns(projectData.tracks.flatMap((track) => track.notes), totalTicks, columnCount)
  const progressX = Math.round(clamp(currentTick / totalTicks, 0, 1) * width)
  const shouldRedrawAll =
    columnsRef.current.length !== columns.length ||
    progressX < completedUpToXRef.current

  if (shouldRedrawAll) {
    columnsRef.current = columns
    completedUpToXRef.current = 0
    context.clearRect(0, 0, width, height)
    drawWaveformRange(context, columns, 0, width, WAVEFORM_PENDING_COLOR, width, height)
  }

  if (progressX > completedUpToXRef.current) {
    drawWaveformRange(
      context,
      columnsRef.current,
      completedUpToXRef.current,
      progressX,
      WAVEFORM_COMPLETED_COLOR,
      width,
      height,
    )
    completedUpToXRef.current = progressX
  }
}

function buildWaveformColumns(notes: Note[], totalTicks: number, columnCount: number): number[] {
  const columns = new Array<number>(columnCount).fill(0)
  const ticksPerColumn = totalTicks / columnCount

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const sliceStart = columnIndex * ticksPerColumn
    const sliceEnd = (columnIndex + 1) * ticksPerColumn

    let density = 0
    for (const note of notes) {
      if (note.startTick < sliceEnd && note.endTick > sliceStart) {
        density += 1
      }
    }

    columns[columnIndex] = density
  }

  return columns
}

function drawWaveformRange(
  context: CanvasRenderingContext2D,
  columns: number[],
  fromX: number,
  toX: number,
  color: string,
  width: number,
  height: number,
): void {
  if (toX <= fromX || columns.length === 0) {
    return
  }

  const maxDensity = Math.max(1, ...columns)
  const centerY = height / 2
  const columnWidth = width / columns.length

  context.fillStyle = color

  const startColumn = Math.max(0, Math.floor(fromX / columnWidth))
  const endColumn = Math.min(columns.length, Math.ceil(toX / columnWidth))

  for (let index = startColumn; index < endColumn; index += 1) {
    const density = columns[index]
    const normalizedHeight = density === 0 ? 2 : Math.max(2, (density / maxDensity) * (height * 0.8))
    const barHeight = Math.min(height, normalizedHeight)
    const x = Math.floor(index * columnWidth)
    const barWidth = Math.max(1, Math.ceil(columnWidth))
    const y = Math.round(centerY - (barHeight / 2))
    context.clearRect(x, 0, barWidth, height)
    context.fillRect(x, y, barWidth, Math.round(barHeight))
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
