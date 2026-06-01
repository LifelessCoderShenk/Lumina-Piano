import React, { useEffect, useState } from 'react'

import type { SongMetadata as SongMeta } from '../../learn/types'
import { useAppStore } from '../../store/store'
import styles from './LearnHome.module.css'

export function LearnHome() {
  const [songs, setSongs] = useState<SongMeta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const setSelectedSong = useAppStore((state) => state.setSelectedSong)
  const setAppMode = useAppStore((state) => state.setAppMode)

  const loadSongs = async () => {
    const electronApi = window.electronAPI
    if (electronApi == null || typeof electronApi.getSongs !== 'function') {
      setSongs([])
      setErrorMessage('Song library is unavailable.')
      setIsLoading(false)
      return
    }

    setErrorMessage(null)
    setIsLoading(true)

    try {
      const nextSongs = await electronApi.getSongs()
      setSongs(Array.isArray(nextSongs) ? nextSongs : [])
    } catch (error) {
      console.error('Failed to load songs:', error)
      setSongs([])
      setErrorMessage('Failed to load song library.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSongs()

    const handleFocus = () => {
      void loadSongs()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const handleSelectSong = (songId: string) => {
    setSelectedSong(songId)
    setAppMode('learnSong')
  }

  const handleDeleteSong = async (
    event: React.MouseEvent<HTMLButtonElement>,
    song: SongMeta,
  ) => {
    event.stopPropagation()

    if (!window.confirm(`Delete "${song.title}"?`)) {
      return
    }

    const electronApi = window.electronAPI
    if (electronApi == null || typeof electronApi.deleteSong !== 'function') {
      setErrorMessage('Song deletion is unavailable.')
      return
    }

    setErrorMessage(null)

    try {
      await electronApi.deleteSong(song.id)
      await loadSongs()
    } catch (error) {
      console.error('Failed to delete song:', error)
      setErrorMessage('Failed to delete song.')
    }
  }

  const handleUploadSong = async () => {
    const electronApi = window.electronAPI
    if (electronApi == null || typeof electronApi.uploadSong !== 'function') {
      setErrorMessage('Song upload is unavailable.')
      return
    }

    setErrorMessage(null)

    try {
      const uploadedSong = await electronApi.uploadSong()
      if (uploadedSong != null) {
        await loadSongs()
      }
    } catch (error) {
      console.error('Failed to upload song:', error)
      setErrorMessage('Failed to upload song.')
    }
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setAppMode('select')}
          aria-label="Back to mode selector"
        >
          Back
        </button>
        <h1 className={styles.title}>Learn</h1>
        <button
          type="button"
          className={styles.uploadButton}
          onClick={() => {
            void handleUploadSong()
          }}
        >
          Add MIDI
        </button>
      </header>

      {errorMessage != null ? (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.loadingState}>Loading songs...</div>
      ) : songs.length === 0 ? (
        <div className={styles.emptyState}>No songs in your library yet.</div>
      ) : (
        <div className={styles.songGrid}>
          {songs.map((song) => (
            <div
              key={song.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${song.title}`}
              className={styles.songCard}
              onClick={() => handleSelectSong(song.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleSelectSong(song.id)
                }
              }}
            >
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={`Delete ${song.title}`}
                onClick={(event) => {
                  void handleDeleteSong(event, song)
                }}
              >
                x
              </button>
              <div className={styles.cardHeader}>
                <span className={styles.songTitle}>{song.title}</span>
                <span className={getDifficultyClassName(song.difficulty, styles)}>
                  {formatDifficulty(song.difficulty)}
                </span>
              </div>
              <div className={styles.songComposer}>{song.composer}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function formatDifficulty(difficulty: SongMeta['difficulty']): string {
  switch (difficulty) {
    case 'beginner':
      return 'Beginner'
    case 'intermediate':
      return 'Intermediate'
    case 'advanced':
      return 'Advanced'
    default:
      return difficulty
  }
}

function getDifficultyClassName(
  difficulty: SongMeta['difficulty'],
  classNames: Record<string, string>,
): string {
  const badgeClassName =
    difficulty === 'beginner'
      ? classNames.beginnerBadge
      : difficulty === 'intermediate'
        ? classNames.intermediateBadge
        : classNames.advancedBadge

  return `${classNames.difficultyBadge} ${badgeClassName}`
}
