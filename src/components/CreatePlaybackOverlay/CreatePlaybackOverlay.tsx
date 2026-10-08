import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { Download, FastForward, ListMusic, Music, Pause, Play, Rewind } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { audioScheduler } from '../../audio/AudioScheduler'
import { playbackEngine } from '../../playback/PlaybackEngine'
import { useAppStore, usePlaybackState } from '../../store/store'
import { secondsToTick, tickToSeconds } from '../../tempo/tempoMap'
import styles from './CreatePlaybackOverlay.module.css'

const SKIP_SECONDS = 10
/** Give the first notes time to travel from the top of the Create visualizer. */
const CREATE_MODE_PRE_ROLL_SECONDS = 3

interface CreatePlaybackOverlayProps {
  hasEditor?: boolean
  editorVisible?: boolean
  onToggleEditor?: () => void
  hasScore?: boolean
  scoreVisible?: boolean
  onToggleScore?: () => void
  onOpenExport?: () => void
}

export function CreatePlaybackOverlay({ hasEditor = false, editorVisible = false, onToggleEditor, hasScore = false, scoreVisible = false, onToggleScore, onOpenExport }: CreatePlaybackOverlayProps) {
  const { currentTick, isPlaying } = usePlaybackState()
  const precomputedTempoMap = useAppStore((state) => state.precomputedTempoMap)
  const totalTicks = useAppStore((state) => state.projectData?.totalTicks ?? 0)
  const setErrorMessage = useAppStore((state) => state.setErrorMessage)
  const hasPlaybackTarget = precomputedTempoMap != null && totalTicks > 0
  const hasExportTarget = hasPlaybackTarget && onOpenExport != null
  const boundedTick = Math.min(Math.max(currentTick, 0), totalTicks)
  const currentSeconds = precomputedTempoMap ? tickToSeconds(boundedTick, precomputedTempoMap) : 0
  const totalSeconds = precomputedTempoMap ? tickToSeconds(totalTicks, precomputedTempoMap) : 0
  const leadInSeconds = precomputedTempoMap && currentTick < 0 ? Math.ceil(-tickToSeconds(currentTick, precomputedTempoMap)) : 0
  const [preparingAudio, setPreparingAudio] = useState(false)
  const startGeneration = useRef(0)
  const latestTransport = useRef({ precomputedTempoMap, totalTicks, currentTick, isPlaying })
  latestTransport.current = { precomputedTempoMap, totalTicks, currentTick, isPlaying }
  useEffect(() => () => { startGeneration.current++ }, [])
  const progressPercent = totalSeconds > 0
    ? Math.min(100, Math.max(0, (currentSeconds / totalSeconds) * 100))
    : 0
  const playbackLabel = preparingAudio ? 'Cancel playback start' : isPlaying ? 'Pause playback' : 'Play playback'
  const transportStatus = preparingAudio ? 'Preparing audio…' : leadInSeconds > 0 ? isPlaying ? `Starting in ${leadInSeconds}s` : 'Lead-in paused' : null
  const scrubberStyle = {
    '--scrubber-progress': `${progressPercent}%`,
  } as CSSProperties

  const cancelPreparing = () => { startGeneration.current++; setPreparingAudio(false) }
  const handleTogglePlayback = async () => {
    if (preparingAudio) { cancelPreparing(); return }
    if (!hasPlaybackTarget) {
      return
    }

    if (isPlaying) {
      playbackEngine.pause()
      return
    }

    const token = ++startGeneration.current
    setPreparingAudio(true)
    try {
      // Reuse the exact piano sampler Camera Mode warms before recording.
      // Normal Create playback previously started only the visual transport.
      await audioScheduler.warmUp()
      if (token !== startGeneration.current || latestTransport.current.precomputedTempoMap !== precomputedTempoMap || latestTransport.current.totalTicks !== totalTicks || latestTransport.current.isPlaying) return
      audioScheduler.setMuted(false)

      // Match Camera Mode's visual lead-in when starting a piece from its beginning.
      // Resuming or playing after a scrub remains immediate.
      if (latestTransport.current.currentTick === 0 || latestTransport.current.currentTick >= totalTicks) {
        playbackEngine.playWithPreRoll(CREATE_MODE_PRE_ROLL_SECONDS)
      } else {
        playbackEngine.play()
      }

      // A prior Camera recording can leave the scheduler positioned at its old
      // end tick. Reset it to the just-started Create transport before running.
      audioScheduler.seek(playbackEngine.getCurrentTick())
      audioScheduler.start()
    } catch (error) {
      if (token !== startGeneration.current) return
      console.warn('Unable to start MIDI audio for Create playback.', error)
      setErrorMessage('MIDI audio could not start.')
    } finally { if (token === startGeneration.current) setPreparingAudio(false) }
  }

  const handleSkip = (deltaSeconds: number) => {
    if (!hasPlaybackTarget || precomputedTempoMap == null) {
      return
    }

    cancelPreparing()
    const nextSeconds = clamp(currentSeconds + deltaSeconds, 0, totalSeconds)
    playbackEngine.seek(secondsToTick(nextSeconds, precomputedTempoMap))
  }

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    if (!hasPlaybackTarget || precomputedTempoMap == null) {
      return
    }

    cancelPreparing()
    playbackEngine.seek(secondsToTick(Number(event.target.value), precomputedTempoMap))
  }

  const handleOpenExport = () => {
    if (!hasExportTarget) {
      return
    }

    cancelPreparing()
    onOpenExport()
  }

  return (
    <div
      aria-label="Create playback controls"
      className={styles.overlay}
      data-testid="create-playback-overlay"
    >
      <div className={styles.bar}>
        <div className={styles.controls}>
          <button
            aria-label="Skip back 10 seconds"
            className={`${styles.iconButton} ${styles.transportButton}`}
            disabled={!hasPlaybackTarget}
            onClick={() => {
              handleSkip(-SKIP_SECONDS)
            }}
            title="Skip back 10 seconds"
            type="button"
          >
            <AppIcon className={styles.icon} icon={Rewind} size={24} />
          </button>

          <button
            aria-label={playbackLabel}
            aria-pressed={isPlaying}
            className={`${styles.iconButton} ${styles.transportButton}`}
            disabled={!hasPlaybackTarget}
            onClick={() => {
              void handleTogglePlayback()
            }}
            title={playbackLabel}
            type="button"
          >
            <AppIcon className={styles.icon} icon={isPlaying ? Pause : Play} size={24} />
          </button>

          <button
            aria-label="Skip forward 10 seconds"
            className={`${styles.iconButton} ${styles.transportButton}`}
            disabled={!hasPlaybackTarget}
            onClick={() => {
              handleSkip(SKIP_SECONDS)
            }}
            title="Skip forward 10 seconds"
            type="button"
          >
            <AppIcon className={styles.icon} icon={FastForward} size={24} />
          </button>
        </div>

        <span className={styles.timeDisplay} aria-label="Playback time">{formatTime(currentSeconds)} / {formatTime(totalSeconds)}</span>
        {hasScore ? <button type="button" className={`${styles.iconButton} ${styles.scoreButton}`} aria-label={scoreVisible ? 'Hide sheet music' : 'Show sheet music'} aria-pressed={scoreVisible} onClick={onToggleScore} title={scoreVisible ? 'Hide sheet music' : 'Show sheet music'}><AppIcon className={styles.icon} icon={Music} size={18} /></button> : null}
        {hasEditor ? <button type="button" className={`${styles.iconButton} ${styles.editorButton}`} aria-label={editorVisible ? 'Hide note editor' : 'Edit notes'} aria-pressed={editorVisible} onClick={onToggleEditor} title={editorVisible ? 'Hide note editor' : 'Edit notes'}><AppIcon className={styles.icon} icon={ListMusic} size={18} /></button> : null}
        {transportStatus && <span className={styles.transportStatus} role="status">{transportStatus}</span>}

        <div className={styles.scrubberShell} style={scrubberStyle}>
          <div aria-hidden="true" className={styles.scrubberTrack}>
            <div className={styles.scrubberProgress} />
          </div>
          <div aria-hidden="true" className={styles.scrubberHandle} />
          <input
            aria-label="Playback position"
            aria-valuetext={`${formatTime(currentSeconds)} of ${formatTime(totalSeconds)}`}
            className={styles.scrubberInput}
            data-testid="create-playback-scrubber"
            disabled={!hasPlaybackTarget}
            max={Math.max(totalSeconds, .01)}
            min="0"
            onChange={handleSeek}
            step="0.01"
            type="range"
            value={currentSeconds}
          />
        </div>

        <button
          aria-label="Export current piece"
          className={`${styles.iconButton} ${styles.exportButton}`}
          data-testid="create-playback-export-button"
          disabled={!hasExportTarget}
          onClick={handleOpenExport}
          title="Export current piece"
          type="button"
        >
          <AppIcon className={styles.icon} icon={Download} size={20} />
        </button>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
