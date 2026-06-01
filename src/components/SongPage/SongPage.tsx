import React, { useEffect, useMemo, useState } from 'react'

import midiDeviceManager from '../../learn/MidiDeviceManager'
import type { LearnHand } from '../../store/store'
import type { SongMetadata as SongMeta } from '../../learn/types'
import { useAppStore } from '../../store/store'
import styles from './SongPage.module.css'

type ModeCardConfig = {
  description: string
  mode: 'listen' | 'noteByNote' | 'playAlong'
  title: string
}

type CardState = {
  hand: LearnHand
  tempoMultiplier: number
}

const MODE_CARDS: ModeCardConfig[] = [
  {
    description: 'Play the song at a custom tempo, no input required',
    mode: 'listen',
    title: 'Listen',
  },
  {
    description: 'Stationary chords, play each to advance',
    mode: 'noteByNote',
    title: 'Note by Note',
  },
  {
    description: 'Falling notes, play along in real time',
    mode: 'playAlong',
    title: 'Play Along',
  },
]

const DEFAULT_CARD_STATE: CardState = {
  hand: 'both',
  tempoMultiplier: 1,
}

export function SongPage() {
  const selectedSongId = useAppStore((state) => state.learnV3.selectedSongId)
  const midiState = useAppStore((state) => state.learnV3.midi)
  const resetSessionConfig = useAppStore((state) => state.resetSessionConfig)
  const setSessionConfig = useAppStore((state) => state.setSessionConfig)
  const setAppMode = useAppStore((state) => state.setAppMode)
  const setMidiDevices = useAppStore((state) => state.setMidiDevices)
  const startSession = useAppStore((state) => state.startSession)
  const [song, setSong] = useState<SongMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cardStates, setCardStates] = useState<Record<ModeCardConfig['mode'], CardState>>({
    listen: { ...DEFAULT_CARD_STATE },
    noteByNote: { ...DEFAULT_CARD_STATE },
    playAlong: { ...DEFAULT_CARD_STATE },
  })

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      resetSessionConfig()
      setErrorMessage(null)
      setIsLoading(true)

      try {
        const electronApi = window.electronAPI
        if (electronApi == null || typeof electronApi.getSongs !== 'function') {
          throw new Error('Song library is unavailable.')
        }

        const songs = await electronApi.getSongs()
        if (!isMounted) {
          return
        }

        const matchedSong = songs.find((entry) => entry.id === selectedSongId) ?? null
        setSong(matchedSong)

        await midiDeviceManager.init()
        if (!isMounted) {
          return
        }

        setMidiDevices(midiDeviceManager.getDevices())
      } catch (error) {
        console.error('Failed to initialize song page:', error)
        if (!isMounted) {
          return
        }

        setSong(null)
        setErrorMessage('Failed to load song page.')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void initialize()

    return () => {
      isMounted = false
    }
  }, [resetSessionConfig, selectedSongId, setMidiDevices])

  const statusText = useMemo(() => {
    if (midiState.connectionStatus === 'connected') {
      return 'CONNECTED'
    }

    if (midiState.connectionStatus === 'failed') {
      return 'FAILED'
    }

    return null
  }, [midiState.connectionStatus])

  const handleCardTempoChange = (
    mode: ModeCardConfig['mode'],
    tempoMultiplier: number,
  ) => {
    setCardStates((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        tempoMultiplier,
      },
    }))
  }

  const handleCardHandChange = (
    mode: ModeCardConfig['mode'],
    hand: LearnHand,
  ) => {
    setCardStates((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        hand,
      },
    }))
  }

  const handleStart = (mode: ModeCardConfig['mode']) => {
    const config = cardStates[mode]
    setSessionConfig({
      hand: config.hand,
      mode,
      tempoMultiplier: config.tempoMultiplier,
    })
    startSession()
    setAppMode('learnSession')
  }

  const handleTestConnection = async () => {
    setErrorMessage(null)

    try {
      await midiDeviceManager.testConnection()
    } catch (error) {
      if (error !== 'timeout') {
        console.error('Failed to test MIDI connection:', error)
        setErrorMessage('Failed to test MIDI connection.')
      }
    }
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setAppMode('learn')}
          aria-label="Back to learn home"
        >
          Back
        </button>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>
            {song?.title ?? 'Song'}
          </h1>
          {song != null ? (
            <span className={getDifficultyClassName(song.difficulty, styles)}>
              {formatDifficulty(song.difficulty)}
            </span>
          ) : null}
        </div>
        <div className={styles.headerSpacer} />
      </header>

      {errorMessage != null ? (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.loadingState}>Loading song...</div>
      ) : song == null ? (
        <div className={styles.emptyState}>Selected song could not be found.</div>
      ) : (
        <>
          <div className={styles.cardGrid}>
            {MODE_CARDS.map((card) => (
              <ModeCard
                key={card.mode}
                card={card}
                state={cardStates[card.mode]}
                onHandChange={handleCardHandChange}
                onStart={handleStart}
                onTempoChange={handleCardTempoChange}
              />
            ))}
          </div>

          <footer className={styles.bottomBar}>
            <div className={styles.midiSection}>
              <div className={styles.midiLabel}>MIDI INPUT</div>
              <div className={styles.midiControls}>
                <select
                  className={styles.deviceSelect}
                  value={midiState.connectedDeviceId ?? ''}
                  onChange={(event) => {
                    midiDeviceManager.connect(event.target.value)
                  }}
                  aria-label="MIDI device"
                >
                  <option value="" disabled>
                    Select device
                  </option>
                  {midiState.devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.testButton}
                  onClick={() => {
                    void handleTestConnection()
                  }}
                  disabled={midiState.connectionStatus === 'connecting'}
                >
                  {midiState.connectionStatus === 'connecting' ? 'TESTING...' : 'TEST CONNECTION'}
                </button>
                {statusText != null ? (
                  <div
                    className={
                      midiState.connectionStatus === 'connected'
                        ? styles.connectedStatus
                        : styles.failedStatus
                    }
                  >
                    {`o ${statusText}`}
                  </div>
                ) : null}
              </div>
            </div>
          </footer>
        </>
      )}
    </section>
  )
}

function ModeCard({
  card,
  state,
  onTempoChange,
  onHandChange,
  onStart,
}: {
  card: ModeCardConfig
  onHandChange: (mode: ModeCardConfig['mode'], hand: LearnHand) => void
  onStart: (mode: ModeCardConfig['mode']) => void
  onTempoChange: (mode: ModeCardConfig['mode'], tempoMultiplier: number) => void
  state: CardState
}) {
  return (
    <section className={styles.modeCard} aria-label={`${card.title} mode`}>
      <div className={styles.modeContent}>
        <h2 className={styles.modeTitle}>{card.title}</h2>
        <p className={styles.modeDescription}>{card.description}</p>

        <div className={styles.controlGroup}>
          <div className={styles.controlHeader}>
            <span className={styles.controlLabel}>TEMPO</span>
            <span className={styles.controlValue}>{state.tempoMultiplier.toFixed(2).replace(/0$/, '')}x</span>
          </div>
          <input
            className={styles.tempoSlider}
            type="range"
            min="0.25"
            max="1"
            step="0.05"
            value={state.tempoMultiplier}
            onChange={(event) => {
              onTempoChange(card.mode, Number(event.target.value))
            }}
            aria-label={`${card.title} tempo`}
          />
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlHeader}>
            <span className={styles.controlLabel}>HAND</span>
          </div>
          <div className={styles.handControl}>
            {(['left', 'right', 'both'] as const).map((hand) => (
              <button
                key={hand}
                type="button"
                className={
                  state.hand === hand
                    ? `${styles.handButton} ${styles.handButtonActive}`
                    : styles.handButton
                }
                onClick={() => {
                  onHandChange(card.mode, hand)
                }}
              >
                {formatHand(hand)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={styles.startButton}
        onClick={() => {
          onStart(card.mode)
        }}
      >
        START
      </button>
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

function formatHand(hand: LearnHand): string {
  if (hand === 'left') {
    return 'L'
  }

  if (hand === 'right') {
    return 'R'
  }

  return 'Both'
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
