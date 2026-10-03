import React, { useRef } from 'react'
import { GripVertical, RotateCcw } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import {
  RECORDING_TIMELINE_OFFSET_LIMIT_MS,
  RECORDING_TRACK_IDS,
  type RecordingTimeline,
  type RecordingTrackId,
} from '../shared/recordingTimeline'
import styles from './RecordingTimelineEditor.module.css'

const PIXELS_PER_SECOND = 24

const TRACK_LABELS: Record<RecordingTrackId, string> = {
  cameraAudio: 'Camera Audio',
  cameraVideo: 'Camera Video',
  midiAudio: 'MIDI Audio',
  midiVideo: 'MIDI Visuals',
  performanceAudio: 'Soundtrack',
}

interface RecordingTimelineEditorProps {
  cameraAudioLinked: boolean
  hasCameraAudio: boolean
  hasPerformanceAudio?: boolean
  isCameraAudioEnabled?: boolean
  isMidiAudioEnabled?: boolean
  isPerformanceAudioEnabled?: boolean
  readOnly?: boolean
  onCameraAudioEnabledChange?(enabled: boolean): void
  onMidiAudioEnabledChange?(enabled: boolean): void
  onPerformanceAudioEnabledChange?(enabled: boolean): void
  onTrackOffsetChange(trackId: RecordingTrackId, offsetMs: number): void
  onReset(): void
  /** Camera Mode is video-only, so it omits the camera-audio track entirely. */
  showCameraAudio?: boolean
  showPerformanceAudio?: boolean
  timeline: RecordingTimeline
}

export function RecordingTimelineEditor({
  cameraAudioLinked,
  hasCameraAudio,
  hasPerformanceAudio = false,
  isCameraAudioEnabled = true,
  isMidiAudioEnabled = true,
  isPerformanceAudioEnabled = true,
  readOnly = false,
  onCameraAudioEnabledChange,
  onMidiAudioEnabledChange,
  onPerformanceAudioEnabledChange,
  onTrackOffsetChange,
  onReset,
  showCameraAudio = true,
  showPerformanceAudio = false,
  timeline,
}: RecordingTimelineEditorProps) {
  const dragRef = useRef<{ offsetMs: number; startX: number; trackId: RecordingTrackId } | null>(null)

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, trackId: RecordingTrackId) => {
    if (
      readOnly ||
      (trackId === 'cameraAudio' && (!hasCameraAudio || cameraAudioLinked)) ||
      (trackId === 'performanceAudio' && !hasPerformanceAudio)
    ) {
      return
    }

    dragRef.current = {
      offsetMs: timeline.startOffsetMs[trackId],
      startX: event.clientX,
      trackId,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (drag == null || drag.trackId !== event.currentTarget.dataset.trackId) {
      return
    }
    onTrackOffsetChange(drag.trackId, drag.offsetMs + (((event.clientX - drag.startX) / PIXELS_PER_SECOND) * 1000))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <section className={styles.editor} data-testid="recording-timeline-editor">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Recording Timeline</h2>
          <p className={styles.subtitle}>
            Positive offsets start later.
            {showCameraAudio ? ' Camera audio is linked to camera video in this recording.' : ' MIDI is the only audio source.'}
            {' Preview and export use the same timing.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.audioToggles} aria-label="Review audio sources">
            <button
              type="button"
              aria-pressed={isMidiAudioEnabled}
              className={`${styles.audioToggle} ${isMidiAudioEnabled ? styles.audioToggleActive : ''}`}
              disabled={readOnly || onMidiAudioEnabledChange == null}
              onClick={() => onMidiAudioEnabledChange?.(!isMidiAudioEnabled)}
            >
              MIDI Audio
            </button>
            {showCameraAudio ? (
              <button
                type="button"
                aria-pressed={isCameraAudioEnabled}
                className={`${styles.audioToggle} ${isCameraAudioEnabled ? styles.audioToggleActive : ''}`}
                disabled={readOnly || !hasCameraAudio || onCameraAudioEnabledChange == null}
                onClick={() => onCameraAudioEnabledChange?.(!isCameraAudioEnabled)}
              >
                Camera Audio
              </button>
            ) : null}
            {showPerformanceAudio ? (
              <button
                type="button"
                aria-pressed={isPerformanceAudioEnabled}
                className={`${styles.audioToggle} ${isPerformanceAudioEnabled ? styles.audioToggleActive : ''}`}
                disabled={readOnly || !hasPerformanceAudio || onPerformanceAudioEnabledChange == null}
                onClick={() => onPerformanceAudioEnabledChange?.(!isPerformanceAudioEnabled)}
              >
                Soundtrack
              </button>
            ) : null}
          </div>
          <button type="button" className={styles.resetButton} disabled={readOnly} onClick={onReset}>
            <AppIcon icon={RotateCcw} size={16} />
            Reset All
          </button>
        </div>
      </div>
      <div className={styles.ruler} aria-hidden="true"><span>-10s</span><span>0</span><span>+10s</span></div>
      {RECORDING_TRACK_IDS.filter((trackId) => (
        (showCameraAudio || trackId !== 'cameraAudio') &&
        (showPerformanceAudio || trackId !== 'performanceAudio')
      )).map((trackId) => {
        const isCameraAudio = trackId === 'cameraAudio'
        const isPerformanceAudio = trackId === 'performanceAudio'
        const disabled = readOnly ||
          (isCameraAudio && (!hasCameraAudio || cameraAudioLinked)) ||
          (isPerformanceAudio && !hasPerformanceAudio)
        const offsetMs = timeline.startOffsetMs[trackId]
        const position = ((offsetMs + RECORDING_TIMELINE_OFFSET_LIMIT_MS) / (RECORDING_TIMELINE_OFFSET_LIMIT_MS * 2)) * 100
        const status = isCameraAudio
          ? (hasCameraAudio ? 'Linked to Camera Video' : 'No camera audio captured')
          : isPerformanceAudio && !hasPerformanceAudio ? 'No soundtrack added' : null
        return (
          <div className={styles.row} data-testid={`recording-timeline-row-${trackId}`} key={trackId}>
            <div className={styles.trackLabel}><strong>{TRACK_LABELS[trackId]}</strong>{status ? <small>{status}</small> : null}</div>
            <div className={styles.trackScale}>
              <span className={styles.zeroLine} />
              <button
                type="button"
                aria-label={`Drag ${TRACK_LABELS[trackId]} offset`}
                className={styles.handle}
                data-track-id={trackId}
                disabled={disabled}
                onPointerCancel={endDrag}
                onPointerDown={(event) => beginDrag(event, trackId)}
                onPointerMove={updateDrag}
                onPointerUp={endDrag}
                style={{ left: `${position}%` }}
              ><AppIcon icon={GripVertical} size={16} /></button>
            </div>
            <label className={styles.inputLabel}>
              <span className={styles.srOnly}>{TRACK_LABELS[trackId]} offset</span>
              <input
                aria-label={`${TRACK_LABELS[trackId]} offset`}
                disabled={disabled}
                max={RECORDING_TIMELINE_OFFSET_LIMIT_MS}
                min={-RECORDING_TIMELINE_OFFSET_LIMIT_MS}
                step="25"
                type="number"
                value={offsetMs}
                onChange={(event) => onTrackOffsetChange(trackId, Number(event.target.value))}
              />
              <span>ms</span>
            </label>
          </div>
        )
      })}
      {readOnly ? <p className={styles.readOnlyNote}>Offsets are editable during review only. Live recording remains unshifted.</p> : null}
      {/* TODO: Enable independent camera-audio controls after audio/video are captured separately. */}
    </section>
  )
}
