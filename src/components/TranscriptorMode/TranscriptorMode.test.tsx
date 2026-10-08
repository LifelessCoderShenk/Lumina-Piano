/*
INPUT: TranscriptorMode with mocked shared MIDI input and keyboard renderer services.
OUTPUT: UI coverage for record/stop/clear, disabled MIDI, toggles, and octave-qualified key feedback.
PURPOSE: Verifies the mode-level contract without requiring a physical MIDI device or WebGL context.
*/

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const controllerState = vi.hoisted(() => ({
  deviceListener: null as null | ((devices: readonly { id: string; name: string }[]) => void),
  emit: null as null | ((event: { type: 'noteon' | 'noteoff'; pitch: number; velocity: number; channel: number; timestampMs: number }) => void),
  initialize: vi.fn(async () => [{ id: 'studio', name: 'Studio Keyboard' }]),
  selectDevice: vi.fn(() => true),
}))
const pointerState = vi.hoisted(() => ({ emit: null as null | ((event: { type: 'noteon' | 'noteoff'; pitch: number; velocity: number; timestampMs: number }) => void) }))
const rendererState = vi.hoisted(() => ({
  setLiveNoteSource: vi.fn(),
}))
const mockExportTranscription = vi.hoisted(() => vi.fn(async () => 'performance.mid'))
vi.mock('../../transcription/exportTranscription', () => ({ exportTranscription: mockExportTranscription }))
vi.mock('../../transcription/metronome', () => ({ TranscriptionMetronome: class { async start() {} stop() {} dispose() {} } }))

const mockParseMidi = vi.hoisted(() => vi.fn())
const mockWarmUp = vi.hoisted(() => vi.fn(async () => undefined))
const mockPlayLiveNote = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../CanvasArea/CanvasArea', () => ({
  CanvasArea: ({ keyboardOnly, keyboardHeightRatio, keyboardPointerEnabled, onKeyboardNote }: { keyboardOnly?: boolean; keyboardHeightRatio?: number; keyboardPointerEnabled?: boolean; onKeyboardNote?: typeof pointerState.emit }) => {
    pointerState.emit = onKeyboardNote ?? null
    return <div data-testid="transcriptor-keyboard-canvas" data-keyboard-only={String(keyboardOnly)} data-keyboard-height-ratio={keyboardHeightRatio} data-pointer-enabled={String(keyboardPointerEnabled)} />
  },
}))

vi.mock('../../renderer/activeVisualizerRenderer', () => ({
  getActiveVisualizerRenderer: () => ({
    getKeyX: (pitch: number) => pitch * 10,
    setLiveNoteSource: rendererState.setLiveNoteSource,
  }),
}))

vi.mock('../../midi/parser', () => ({
  parseMidi: mockParseMidi,
}))

vi.mock('../../audio/AudioScheduler', () => ({
  audioScheduler: {
    playLiveNote: mockPlayLiveNote,
    warmUp: mockWarmUp,
  },
}))

vi.mock('../../midi/LiveMidiInputController', () => ({
  LiveMidiInputController: class {
    initialize = controllerState.initialize
    selectDevice = controllerState.selectDevice
    subscribe(listener: typeof controllerState.emit) {
      controllerState.emit = listener
      return () => { controllerState.emit = null }
    }
    subscribeDevices(listener: typeof controllerState.deviceListener) {
      controllerState.deviceListener = listener
      listener?.([])
      return () => { controllerState.deviceListener = null }
    }
    dispose() {}
  },
}))

vi.mock('./ScoreSheet', () => ({
  ScoreSheet: ({ score, showChordNames }: { score: { measures: unknown[] }; showChordNames: boolean }) => (
    <div data-testid="score-sheet" data-measures={score.measures.length} data-chords={String(showChordNames)} />
  ),
}))

const { TranscriptorMode } = await import('./TranscriptorMode')
const { resetStore, useAppStore } = await import('../../store/store')

class TestResizeObserver {
  observe() {}
  disconnect() {}
}

describe('TranscriptorMode', () => {
  it('starts after the count-in and excludes pauses from the recorded notes', async () => {
    vi.useFakeTimers()
    useAppStore.getState().setTranscriptionSettings({ countInBeats: 4 })
    render(<TranscriptorMode />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(useAppStore.getState().transcriptionPhase).toBe('countdown')
    act(() => {
      pointerState.emit?.({ type: 'noteon', pitch: 90, velocity: 100, timestampMs: performance.now() })
      vi.advanceTimersByTime(2000)
    })
    expect(useAppStore.getState().transcriptionPhase).toBe('recording')
    act(() => {
      pointerState.emit?.({ type: 'noteon', pitch: 60, velocity: 100, timestampMs: performance.now() })
      vi.advanceTimersByTime(100)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => {
      vi.advanceTimersByTime(1000)
      controllerState.emit?.({ type: 'noteon', pitch: 90, velocity: 100, channel: 0, timestampMs: performance.now() })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    act(() => {
      pointerState.emit?.({ type: 'noteon', pitch: 64, velocity: 100, timestampMs: performance.now() })
      vi.advanceTimersByTime(100)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(useAppStore.getState().transcriptionNotes).toMatchObject([{ pitch: 60, startMs: 0, endMs: 100 }, { pitch: 64, startMs: 100, endMs: 200 }])
  })
  it('finishes held notes and saves a recoverable session when the mode unmounts', async () => {
    vi.useFakeTimers()
    const { unmount } = render(<TranscriptorMode />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    act(() => {
      pointerState.emit?.({ type: 'noteon', pitch: 60, velocity: 100, timestampMs: performance.now() })
      vi.advanceTimersByTime(300)
    })
    unmount()
    expect(useAppStore.getState().transcriptionPhase).toBe('stopped')
    const saved = JSON.parse(localStorage.getItem('lumina.transcription.session.v1')!)
    expect(saved.originalNotes).toMatchObject([{ pitch: 60, startMs: 0, endMs: 300 }])
    expect(saved.durationMs).toBe(300)
  })
  beforeEach(() => {
    localStorage.clear()
    resetStore()
    controllerState.emit = null
    controllerState.deviceListener = null
    controllerState.initialize.mockReset()
    controllerState.initialize.mockResolvedValue([{ id: 'studio', name: 'Studio Keyboard' }])
    controllerState.selectDevice.mockReset()
    controllerState.selectDevice.mockReturnValue(true)
    rendererState.setLiveNoteSource.mockReset()
    mockExportTranscription.mockClear()
    mockParseMidi.mockReset()
    mockWarmUp.mockReset()
    mockWarmUp.mockResolvedValue(undefined)
    mockPlayLiveNote.mockReset()
    mockPlayLiveNote.mockResolvedValue(undefined)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    resetStore()
  })

  it('uses the full keyboard canvas, records notes, stops, and starts a new take', async () => {
    useAppStore.getState().setTranscriptionSettings({ keyLabelsEnabled: true })
    render(<TranscriptorMode />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.getByTestId('transcriptor-keyboard-canvas').getAttribute('data-keyboard-only')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    controllerState.emit?.({ type: 'noteon', channel: 0, pitch: 60, timestampMs: 1_000, velocity: 100 })
    await waitFor(() => expect(screen.getByText('C4')).toBeTruthy())
    controllerState.emit?.({ type: 'noteoff', channel: 0, pitch: 60, timestampMs: 1_250, velocity: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(useAppStore.getState().transcriptionPhase).toBe('stopped')
    expect(useAppStore.getState().transcriptionNotes).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Record more' }))
    fireEvent.click(screen.getByRole('button', { name: 'New take' }))
    expect(useAppStore.getState().transcriptionNotes).toEqual([])
    expect(useAppStore.getState().transcriptionPhase).toBe('idle')
  })

  it('resizes the score and keyboard with pointer or keyboard controls and resets the split', () => {
    render(<TranscriptorMode />)
    const root = screen.getByTestId('transcriptor-mode')
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      bottom: 720,
      height: 720,
      left: 0,
      right: 1280,
      top: 0,
      width: 1280,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const divider = screen.getByRole('separator', { name: 'Resize score and keyboard' })
    Object.assign(divider, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    })

    fireEvent.pointerDown(divider, { clientY: 360, pointerId: 7 })
    expect(divider.getAttribute('aria-valuenow')).toBe('360')
    expect(screen.getByTestId('transcriptor-keyboard-canvas').getAttribute('data-keyboard-height-ratio')).toBe('0.5')

    fireEvent.keyDown(divider, { key: 'ArrowDown' })
    expect(divider.getAttribute('aria-valuenow')).toBe('340')

    fireEvent.doubleClick(divider)
    expect(divider.getAttribute('aria-valuenow')).toBe('270')
  })

  it('mounts take, notation, and input controls into the shared Create sidebar', async () => {
    const sidebar = document.createElement('div')
    sidebar.id = 'transcription-sidebar-root'
    document.body.append(sidebar)
    render(<TranscriptorMode />)

    expect(await screen.findByRole('heading', { name: 'Transcription' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Inputs' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('combobox', { name: 'Transcription MIDI input' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add piano setup' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add piano setup' }))
    expect(useAppStore.getState().transcriptionSettings.mediaSources?.map((source) => source.role)).toEqual(['piano', 'piano'])
    expect(useAppStore.getState().transcriptionSettings.mediaSources?.[0].overlay).toEqual(expect.objectContaining({ x: 0, y: .7, width: 1, height: .3, mirror: false }))
    expect(screen.getByText('Frame').closest('details')?.open).toBe(false)
    expect(screen.getByText('Level & sync').closest('details')?.open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Add video' }))
    expect(useAppStore.getState().transcriptionSettings.mediaSources?.[2]).toEqual(expect.objectContaining({ role: 'face', overlay: expect.objectContaining({ x: expect.any(Number), y: .065, width: .24, height: .36, mirror: true }) }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use Piano camera' }))
    expect(useAppStore.getState().transcriptionSettings.mediaSources?.[0].enabled).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: 'Notation' }))
    expect(screen.getByRole('combobox', { name: 'Transcription quantization' })).toBeTruthy()
    expect(screen.getByText('Fine tuning').closest('details')?.open).toBe(false)
    sidebar.remove()
  })

  it('switches between the score and falling-key live views without leaving transcription', async () => {
    render(<TranscriptorMode />)
    const canvas = screen.getByTestId('transcriptor-keyboard-canvas')
    expect(canvas.getAttribute('data-keyboard-only')).toBe('true')
    fireEvent.change(screen.getByRole('combobox', { name: 'Live visualization' }), { target: { value: 'fallingKeys' } })
    expect(canvas.getAttribute('data-keyboard-only')).toBe('false')
    expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy()
  })

  it('keeps the status strip focused on live recording conditions', async () => {
    render(<TranscriptorMode />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false))

    const status = screen.getByLabelText('Transcription status')
    expect(status.textContent).toContain('Ready 0:00')
    expect(status.textContent).toContain('MIDI on')
    expect(status.textContent).toContain('Inputs off')
    expect(status.textContent).not.toContain('Mouse ready')
    expect(status.textContent).not.toContain('Pedal up')
    expect(status.textContent).not.toContain('0 active keys')

    act(() => controllerState.deviceListener?.([]))
    await waitFor(() => expect(status.textContent).toContain('MIDI off'))

    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    act(() => pointerState.emit?.({ type: 'noteon', pitch: 60, velocity: 100, timestampMs: performance.now() }))
    expect(status.textContent).toContain('Recording')
    expect(screen.getByLabelText('1 active key')).toBeTruthy()
  })

  it('captures a fast burst without publishing the score for every MIDI event', async () => {
    render(<TranscriptorMode />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    const published = useAppStore.getState().transcriptionNotes
    act(() => {
      for (let index = 0; index < 200; index += 1) {
        controllerState.emit?.({ type: 'noteon', channel: 0, pitch: 60, timestampMs: 1000 + index * 10, velocity: 100 })
        controllerState.emit?.({ type: 'noteoff', channel: 0, pitch: 60, timestampMs: 1005 + index * 10, velocity: 0 })
      }
    })
    expect(useAppStore.getState().transcriptionNotes).toBe(published)
    expect(screen.queryByRole('button', { name: 'Export file' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(useAppStore.getState().transcriptionNotes).toHaveLength(200)
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('exports the stopped performance in the selected format and shows its saved path', async () => {
    useAppStore.getState().setTranscriptionNotes([{ id: 'note', pitch: 60, velocity: 100, channel: 0, startMs: 0, endMs: 100 }])
    useAppStore.getState().setTranscriptionPhase('stopped')
    render(<TranscriptorMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Transcription export format' }), { target: { value: 'mid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Export file' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved to performance.mid'))
    expect(mockExportTranscription).toHaveBeenCalledWith(useAppStore.getState().transcriptionNotes, expect.objectContaining({ bpm: 120 }), 'mid', expect.objectContaining({ originalNotes: useAppStore.getState().transcriptionNotes }))
  })

  it('keeps review focused and opens replacement controls only from Record more', async () => {
    useAppStore.getState().setTranscriptionNotes([{ id: 'note', pitch: 60, velocity: 100, channel: 0, startMs: 0, endMs: 1000 }])
    useAppStore.getState().setTranscriptionPhase('stopped')
    render(<TranscriptorMode />)
    const more = await screen.findByRole('button', { name: 'Record more' })
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record sample' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue take' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Correct notes' }))
    expect(screen.queryByRole('spinbutton', { name: 'Replacement start' })).toBeNull()
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    fireEvent.change(screen.getByRole('combobox', { name: 'Lead-in bars' }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace passage' }))
    expect(screen.queryByRole('region', { name: 'Record more options' })).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Replacement start bar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record replacement' })).toBeTruthy()
    fireEvent.click(more)
    expect((screen.getByRole('combobox', { name: 'Lead-in bars' }) as HTMLSelectElement).value).toBe('4')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Record more options' })).toBeNull()
    expect(document.activeElement).toBe(more)
    fireEvent.click(more)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Play review' }))
    expect(screen.queryByRole('region', { name: 'Record more options' })).toBeNull()
  })

  it('groups format-specific settings in Export and uses them for the selected take', async () => {
    useAppStore.getState().setTranscriptionNotes([{ id: 'note', pitch: 60, velocity: 100, channel: 0, startMs: 0, endMs: 1000 }])
    useAppStore.getState().setTranscriptionPhase('stopped')
    render(<TranscriptorMode />)
    expect(screen.queryByRole('combobox', { name: 'Transcription export format' })).toBeNull()
    const exportButton = screen.getByRole('button', { name: 'Export' })
    fireEvent.click(exportButton)
    const format = screen.getByRole('combobox', { name: 'Transcription export format' })
    expect(screen.queryByRole('combobox', { name: 'Export timing' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Export audio mix' })).toBeNull()
    fireEvent.change(format, { target: { value: 'mid' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Export timing' }), { target: { value: 'original' } })
    expect(screen.queryByRole('combobox', { name: 'Export audio mix' })).toBeNull()
    fireEvent.change(format, { target: { value: 'mp4' } })
    expect(screen.getByText('1280 × 720 · 30 fps')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Export audio mix' }), { target: { value: 'synth' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Piano volume' }), { target: { value: '0.75' } })
    fireEvent.keyDown(format, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Transcription export options' })).toBeNull()
    expect(document.activeElement).toBe(exportButton)
    fireEvent.click(exportButton)
    expect((screen.getByRole('combobox', { name: 'Export timing' }) as HTMLSelectElement).value).toBe('original')
    fireEvent.click(screen.getByRole('button', { name: 'Export file' }))
    await waitFor(() => expect(mockExportTranscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ exportTiming: 'original', exportAudioMix: 'synth', pianoVolume: .75, title: expect.stringContaining('Take 1') }), 'mp4', expect.anything()))
  })

  it('explains why recorded-only audio cannot export when the take has no recorded audio', async () => {
    useAppStore.getState().setTranscriptionNotes([{ id: 'note', pitch: 60, velocity: 100, channel: 0, startMs: 0, endMs: 100 }])
    useAppStore.getState().setTranscriptionPhase('stopped')
    useAppStore.getState().setTranscriptionSettings({ exportAudioMix: 'recorded' })
    render(<TranscriptorMode />)

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Transcription export format' }), { target: { value: 'mp3' } })

    expect((await screen.findByRole('status')).textContent).toContain('This take has no recorded audio')
    expect((screen.getByRole('button', { name: 'Export file' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mockExportTranscription).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Export audio mix' }), { target: { value: 'synth' } })
    expect(screen.queryByText(/This take has no recorded audio/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export file' }))
    await waitFor(() => expect(mockExportTranscription).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ exportAudioMix: 'synth' }), 'mp3', expect.anything()))
  })

  it('keeps mouse recording available when Web MIDI is unavailable and exposes both notation toggles', async () => {
    const sidebar = document.createElement('div')
    sidebar.id = 'transcription-sidebar-root'
    document.body.append(sidebar)
    controllerState.initialize.mockRejectedValueOnce(new Error('Web MIDI is not available in this browser.'))
    render(<TranscriptorMode />)

    const warning = await screen.findByText('MIDI is unavailable here. You can still record with the on-screen piano.')
    expect(warning.closest('fieldset')?.textContent).toContain('Playing input')
    expect(screen.getByLabelText('Transcription status').parentElement?.textContent).not.toContain('MIDI is unavailable here')
    expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: 'Notation' }))
    const chords = screen.getByRole('checkbox', { name: 'Chord names' }) as HTMLInputElement
    const keyLabels = screen.getByRole('checkbox', { name: 'Piano key labels' }) as HTMLInputElement
    expect(chords.checked).toBe(true)
    expect(keyLabels.checked).toBe(false)
    fireEvent.click(chords)
    fireEvent.click(keyLabels)
    expect(useAppStore.getState().transcriptionSettings.chordNamesEnabled).toBe(false)
    expect(useAppStore.getState().transcriptionSettings.keyLabelsEnabled).toBe(true)
    sidebar.remove()
  })

  it('records mouse note transitions without a MIDI device and exports the completed capture', async () => {
    controllerState.initialize.mockResolvedValueOnce([])
    render(<TranscriptorMode />)
    expect(screen.getByTestId('transcriptor-keyboard-canvas').getAttribute('data-pointer-enabled')).toBe('true')
    act(() => pointerState.emit?.({ type: 'noteon', pitch: 60, velocity: 100, timestampMs: 0 }))
    expect(useAppStore.getState().transcriptionNotes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    const start = performance.now()
    act(() => {
      pointerState.emit?.({ type: 'noteon', pitch: 60, velocity: 100, timestampMs: start })
      pointerState.emit?.({ type: 'noteoff', pitch: 60, velocity: 0, timestampMs: start + 80 })
      pointerState.emit?.({ type: 'noteon', pitch: 64, velocity: 100, timestampMs: start + 80 })
      pointerState.emit?.({ type: 'noteoff', pitch: 64, velocity: 0, timestampMs: start + 160 })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    const notes = useAppStore.getState().transcriptionNotes
    expect(notes.map((note) => note.pitch)).toEqual([60, 64])
    notes.forEach((note) => expect(note.endMs - note.startMs).toBeCloseTo(80, 8))
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps a repeated physical pitch visually active until its matching final note-off', async () => {
    render(<TranscriptorMode />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))

    controllerState.emit?.({ type: 'noteon', channel: 0, pitch: 60, timestampMs: 1_000, velocity: 80 })
    controllerState.emit?.({ type: 'noteon', channel: 0, pitch: 60, timestampMs: 1_010, velocity: 100 })
    controllerState.emit?.({ type: 'noteoff', channel: 0, pitch: 60, timestampMs: 1_020, velocity: 0 })

    expect(rendererState.setLiveNoteSource.mock.calls.filter(([source]) => source === 'transcriptor-midi').at(-1)).toEqual(['transcriptor-midi', [
      expect.objectContaining({ pitch: 60, startedAtMs: 1_010, velocity: 100 }),
    ]])
    controllerState.emit?.({ type: 'noteoff', channel: 0, pitch: 60, timestampMs: 1_030, velocity: 0 })
    expect(rendererState.setLiveNoteSource.mock.calls.filter(([source]) => source === 'transcriptor-midi').at(-1)).toEqual(['transcriptor-midi', []])
  })

  it('clears a disconnected selected device and keeps mouse recording available', async () => {
    render(<TranscriptorMode />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false))

    await waitFor(() => expect(useAppStore.getState().transcriptionSettings.midiDeviceId).toBe('studio'))
    controllerState.deviceListener?.([])

    await waitFor(() => expect(useAppStore.getState().transcriptionSettings.midiDeviceId).toBeNull())
    expect((screen.getByRole('button', { name: 'Record' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('plays a bundled sample through the same live-capture path without requiring Web MIDI', async () => {
    controllerState.initialize.mockRejectedValueOnce(new Error('Web MIDI is not available in this browser.'))
    mockParseMidi.mockReturnValue({
      tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
      ticksPerQuarter: 480,
      timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
      totalTicks: 480,
      tracks: [{
        channel: 0,
        id: 'piano',
        name: 'Piano',
        notes: [{ endTick: 480, id: 'c4', pitch: 60, startTick: 0, velocity: 100, visualEndTick: 480 }],
      }],
    })
    vi.stubGlobal('electronAPI', {
      samplePieces: {
        list: vi.fn(async () => ['Pirates of the Caribbean.mid']),
        read: vi.fn(async () => new Uint8Array([1, 2, 3])),
      },
    })
    vi.useFakeTimers()
    render(<TranscriptorMode />)

    fireEvent.click(screen.getByRole('button', { name: 'Record sample' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockParseMidi).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    await act(async () => {
      vi.advanceTimersByTime(550)
    })

    expect(mockPlayLiveNote).toHaveBeenCalledWith(60, 100, 500)
    expect(rendererState.setLiveNoteSource).toHaveBeenCalledWith('transcriptor-sample-midi', [expect.objectContaining({ pitch: 60 })])
    expect(useAppStore.getState().transcriptionNotes).toHaveLength(1)
    expect(useAppStore.getState().transcriptionPhase).toBe('stopped')
  })
})
