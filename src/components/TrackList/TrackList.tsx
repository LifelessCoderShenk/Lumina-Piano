import React from 'react'
import cx from 'classnames'
import { useAppStore, useProjectData, useTrackColors } from '../../store/store'
import type { Track } from '../../midi/types'
import styles from './TrackList.module.css'

export function TrackList() {
  const { projectData } = useProjectData()
  const trackColors = useTrackColors()

  if (!projectData) {
    return (
      <div className={styles.trackList}>
        <div className={styles.header}>
          <span>TRACKS</span>
        </div>
        <div className={styles.empty}>No tracks loaded</div>
      </div>
    )
  }

  return (
    <div className={styles.trackList}>
      <div className={styles.header}>
        <span>TRACKS</span>
      </div>
      <div className={styles.tracks}>
        {projectData.tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            color={trackColors[track.id]}
            index={i}
          />
        ))}
      </div>
    </div>
  )
}

function TrackRow({ track, color, index }: { track: Track; color: string; index: number }) {
  const muted = useAppStore(s => s.trackMuted[track.id])
  const soloed = useAppStore(s => s.trackSoloed[track.id])

  return (
    <div className={styles.trackRow}>
      <input
        type="color"
        value={color}
        onChange={e => useAppStore.getState().setTrackColor(track.id, e.target.value)}
        className={styles.swatch}
      />
      <span className={styles.trackName}>{track.name || `Track ${index + 1}`}</span>
      <div className={styles.controls}>
        <button
          className={cx(styles.muteBtn, { [styles.active]: muted })}
          onClick={() => useAppStore.getState().setTrackMuted(track.id, !muted)}
        >
          M
        </button>
        <button
          className={cx(styles.soloBtn, { [styles.active]: soloed })}
          onClick={() => useAppStore.getState().setTrackSoloed(track.id, !soloed)}
        >
          S
        </button>
      </div>
    </div>
  )
}
