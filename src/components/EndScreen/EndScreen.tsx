import React, { useEffect, useMemo, useState } from 'react'

import { useAppStore } from '../../store/store'
import styles from './EndScreen.module.css'

export function EndScreen() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const sessionMode = useAppStore((state) => state.learnV3.sessionConfig.mode)
  const stats = useAppStore((state) => state.learnV3.stats)
  const exitSession = useAppStore((state) => state.exitSession)
  const startSession = useAppStore((state) => state.startSession)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const [songTitle, setSongTitle] = useState('Selected Song')

  useEffect(() => {
    let mounted = true

    const loadSongTitle = async () => {
      try {
        const electronApi = window.electronAPI
        if (electronApi == null || typeof electronApi.getSongs !== 'function') {
          return
        }

        const songs = await electronApi.getSongs()
        if (!mounted) {
          return
        }

        const song = songs.find((entry) => entry.id === selectedSongId) ?? null
        if (song != null) {
          setSongTitle(song.title)
        }
      } catch (error) {
        console.error('Failed to load end screen song metadata:', error)
      }
    }

    void loadSongTitle()

    return () => {
      mounted = false
    }
  }, [selectedSongId])

  const totalNotes = stats.correct + stats.wrong + stats.missed
  const accuracy = Math.round((stats.correct / totalNotes) * 100) || 0
  const accuracyColor = useMemo(() => {
    if (accuracy >= 80) {
      return '#10b981'
    }

    if (accuracy >= 50) {
      return '#f59e0b'
    }

    return '#ef4444'
  }, [accuracy])

  return (
    <section className={styles.screen}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => {
          exitSession()
          setAppMode('learn')
        }}
        aria-label="Back to learn home"
      >
        {'\u2190'}
      </button>

      <div className={styles.overlay} />

      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>{songTitle}</h1>
          <div className={styles.modeLabel}>{formatModeLabel(sessionMode)}</div>
        </header>

        <div className={styles.divider} />

        <section className={styles.accuracySection}>
          <div className={styles.accuracyValue} style={{ color: accuracyColor }}>
            {`${accuracy}%`}
          </div>
          <div className={styles.accuracyLabel}>ACCURACY</div>
        </section>

        <div className={styles.divider} />

        <section className={styles.statsGrid}>
          <StatItem label="NOTES HIT" value={stats.correct} />
          <StatItem label="TOTAL NOTES" value={totalNotes} />
          <StatItem label="WRONG" value={stats.wrong} />
          <StatItem label="MISSED" value={stats.missed} />
          <StatItem label="BEST STREAK" value={stats.bestStreak} />
        </section>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              exitSession()
              startSession()
              setAppMode('learnSession')
            }}
          >
            {'\u25b6 PLAY AGAIN'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              exitSession()
              setAppMode('learnSong')
            }}
          >
            BACK TO SONG
          </button>
        </div>
      </div>
    </section>
  )
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statItem}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

function formatModeLabel(mode: string | null): string {
  if (mode === 'noteByNote') {
    return 'NOTE BY NOTE'
  }

  if (mode === 'playAlong') {
    return 'PLAY ALONG'
  }

  if (mode === 'listen') {
    return 'LISTEN'
  }

  return 'SESSION'
}
