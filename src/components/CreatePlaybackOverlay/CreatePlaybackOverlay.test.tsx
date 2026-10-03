import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrecomputedTempoMap } from '../../tempo/tempoMap'

const mockPlaybackPause = vi.hoisted(() => vi.fn())
const mockPlaybackPlay = vi.hoisted(() => vi.fn())
const mockPlaybackPlayWithPreRoll = vi.hoisted(() => vi.fn())
const mockPlaybackGetCurrentTick = vi.hoisted(() => vi.fn(() => 500))
const mockPlaybackSeek = vi.hoisted(() => vi.fn())
const mockAudioSchedulerWarmUp = vi.hoisted(() => vi.fn(async () => undefined))
const mockAudioSchedulerSetMuted = vi.hoisted(() => vi.fn())
const mockAudioSchedulerSeek = vi.hoisted(() => vi.fn())
const mockAudioSchedulerStart = vi.hoisted(() => vi.fn())
const mockOpenExport = vi.hoisted(() => vi.fn())
const mockStoreState = vi.hoisted(() => ({
  currentTick: 500,
  isPlaying: false,
  setErrorMessage: vi.fn(),
  precomputedTempoMap: {
    segments: [
      {
        bpm: 120,
        endTick: Number.POSITIVE_INFINITY,
        microsecondsPerBeat: 500_000,
        startSeconds: 0,
        startTick: 0,
        ticksPerSecond: 100,
      },
    ],
  } as PrecomputedTempoMap | null,
  projectData: {
    totalTicks: 4_000,
  } as { totalTicks: number } | null,
}))

vi.mock('../../playback/PlaybackEngine', () => ({
  playbackEngine: {
    getCurrentTick: mockPlaybackGetCurrentTick,
    pause: mockPlaybackPause,
    play: mockPlaybackPlay,
    playWithPreRoll: mockPlaybackPlayWithPreRoll,
    seek: mockPlaybackSeek,
  },
}))

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    seek: mockAudioSchedulerSeek,
    setMuted: mockAudioSchedulerSetMuted,
    start: mockAudioSchedulerStart,
    warmUp: mockAudioSchedulerWarmUp,
  },
}))

vi.mock('../../store/store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
  usePlaybackState: () => ({
    currentTick: mockStoreState.currentTick,
    isPlaying: mockStoreState.isPlaying,
  }),
}))

const { CreatePlaybackOverlay } = await import('./CreatePlaybackOverlay')

describe('CreatePlaybackOverlay', () => {
  beforeEach(() => {
    mockPlaybackPause.mockReset()
    mockPlaybackPlay.mockReset()
    mockPlaybackPlayWithPreRoll.mockReset()
    mockPlaybackGetCurrentTick.mockReset()
    mockPlaybackGetCurrentTick.mockReturnValue(500)
    mockPlaybackSeek.mockReset()
    mockAudioSchedulerWarmUp.mockReset()
    mockAudioSchedulerWarmUp.mockImplementation(async () => undefined)
    mockAudioSchedulerSetMuted.mockReset()
    mockAudioSchedulerSeek.mockReset()
    mockAudioSchedulerStart.mockReset()
    mockOpenExport.mockReset()
    mockStoreState.currentTick = 500
    mockStoreState.isPlaying = false
    mockStoreState.precomputedTempoMap = {
      segments: [
        {
          bpm: 120,
          endTick: Number.POSITIVE_INFINITY,
          microsecondsPerBeat: 500_000,
          startSeconds: 0,
          startTick: 0,
          ticksPerSecond: 100,
        },
      ],
    }
    mockStoreState.projectData = {
      totalTicks: 4_000,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('opens export when the export button is clicked', () => {
    render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Export current piece' }))
    expect(mockOpenExport).toHaveBeenCalledTimes(1)
  })

  it('warms and starts the Camera Mode piano sampler for regular playback', async () => {
    const view = render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }))
    await Promise.resolve()

    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1)
    expect(mockAudioSchedulerWarmUp).toHaveBeenCalledTimes(1)
    expect(mockAudioSchedulerSetMuted).toHaveBeenCalledWith(false)
    expect(mockAudioSchedulerSeek).toHaveBeenCalledWith(500)
    expect(mockAudioSchedulerStart).toHaveBeenCalledTimes(1)

    mockStoreState.isPlaying = true
    view.rerender(<CreatePlaybackOverlay />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }))
    expect(mockPlaybackPause).toHaveBeenCalledTimes(1)
  })

  it('gives notes a three-second visual lead-in when playback begins at tick zero', async () => {
    mockStoreState.currentTick = 0
    mockPlaybackGetCurrentTick.mockReturnValue(-300)

    render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }))
    await Promise.resolve()

    expect(mockPlaybackPlayWithPreRoll).toHaveBeenCalledWith(3)
    expect(mockPlaybackPlay).not.toHaveBeenCalled()
    expect(mockAudioSchedulerSeek).toHaveBeenCalledWith(-300)
    expect(mockAudioSchedulerStart).toHaveBeenCalledTimes(1)
  })

  it('renders the transport controls in skip back, play/pause, skip forward order', () => {
    render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    const skipBackButton = screen.getByRole('button', { name: 'Skip back 10 seconds' })
    const playButton = screen.getByRole('button', { name: 'Play playback' })
    const skipForwardButton = screen.getByRole('button', { name: 'Skip forward 10 seconds' })

    expect(skipBackButton.compareDocumentPosition(playButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(playButton.compareDocumentPosition(skipForwardButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(skipBackButton.querySelector('svg.lucide-rewind')).toBeTruthy()
    expect(playButton.querySelector('svg.lucide-play[fill="none"]')).toBeTruthy()
  })

  it('skips backward and forward in 10-second increments using tick conversions', () => {
    render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip back 10 seconds' }))
    expect(mockPlaybackSeek).toHaveBeenNthCalledWith(1, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Skip forward 10 seconds' }))
    expect(mockPlaybackSeek).toHaveBeenNthCalledWith(2, 1_500)
  })

  it('seeks through playbackEngine.seek when the scrubber moves', () => {
    render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    fireEvent.change(screen.getByTestId('create-playback-scrubber'), {
      target: { value: '24' },
    })

    expect(mockPlaybackSeek).toHaveBeenCalledWith(2_400)
  })

  it('shows elapsed and total time and seeks by seconds across tempo changes', () => {
    mockStoreState.precomputedTempoMap = { segments: [
      { bpm: 120, microsecondsPerBeat: 500000, startTick: 0, endTick: 1000, startSeconds: 0, ticksPerSecond: 100 },
      { bpm: 60, microsecondsPerBeat: 1000000, startTick: 1000, endTick: Infinity, startSeconds: 10, ticksPerSecond: 50 },
    ] }
    mockStoreState.currentTick = 2000
    render(<CreatePlaybackOverlay />)
    expect(screen.getByLabelText('Playback time').textContent).toBe('0:30 / 1:10')
    const scrubber = screen.getByRole('slider', { name: 'Playback position' }) as HTMLInputElement
    expect(scrubber.value).toBe('30')
    expect(scrubber.max).toBe('70')
    expect(scrubber.getAttribute('aria-valuetext')).toBe('0:30 of 1:10')
    fireEvent.change(scrubber, { target: { value: '40' } })
    expect(mockPlaybackSeek).toHaveBeenCalledWith(2500)
  })

  it('shows the lead-in countdown and clears it when the piece starts', () => {
    mockStoreState.currentTick = -250
    mockStoreState.isPlaying = true
    const view = render(<CreatePlaybackOverlay />)
    expect(screen.getByRole('status').textContent).toBe('Starting in 3s')
    expect(screen.getByLabelText('Playback time').textContent).toBe('0:00 / 0:40')
    mockStoreState.currentTick = 0
    view.rerender(<CreatePlaybackOverlay />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('resumes a paused lead-in without resetting its countdown', async () => {
    mockStoreState.currentTick = -100
    render(<CreatePlaybackOverlay />)
    expect(screen.getByRole('status').textContent).toBe('Lead-in paused')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play playback' })) })
    expect(mockPlaybackPlay).toHaveBeenCalledOnce()
    expect(mockPlaybackPlayWithPreRoll).not.toHaveBeenCalled()
  })

  it('allows canceling audio preparation without starting playback later', async () => {
    let finishWarmUp!: () => void
    mockAudioSchedulerWarmUp.mockImplementation(() => new Promise<void>((resolve) => { finishWarmUp = resolve }))
    render(<CreatePlaybackOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }))
    expect(screen.getByRole('status').textContent).toBe('Preparing audio…')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel playback start' }))
    await act(async () => { finishWarmUp() })
    expect(mockPlaybackPlay).not.toHaveBeenCalled()
    expect(mockAudioSchedulerStart).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('replays from the beginning when the piece has ended', async () => {
    mockStoreState.currentTick = 4000
    render(<CreatePlaybackOverlay />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play playback' })) })
    expect(mockPlaybackPlayWithPreRoll).toHaveBeenCalledWith(3)
  })

  it('disables export when no export handler is provided', () => {
    render(<CreatePlaybackOverlay />)

    expect((screen.getByTestId('create-playback-export-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables transport controls when no project is loaded', () => {
    mockStoreState.precomputedTempoMap = null
    mockStoreState.projectData = null

    render(<CreatePlaybackOverlay onOpenExport={mockOpenExport} />)

    expect((screen.getByRole('button', { name: 'Play playback' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Skip back 10 seconds' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Skip forward 10 seconds' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('create-playback-scrubber') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Export current piece' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
