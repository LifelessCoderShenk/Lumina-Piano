import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { useRecordingTimeline } from '../shared/useRecordingTimeline'
import { RecordingTimelineEditor } from './RecordingTimelineEditor'

function TimelineHarness({ hasCameraAudio = false }: { hasCameraAudio?: boolean }) {
  const recordingTimeline = useRecordingTimeline()
  const [cameraAudioEnabled, setCameraAudioEnabled] = React.useState(true)
  const [midiAudioEnabled, setMidiAudioEnabled] = React.useState(true)
  return (
    <RecordingTimelineEditor
      cameraAudioLinked
      hasCameraAudio={hasCameraAudio}
      isCameraAudioEnabled={cameraAudioEnabled}
      isMidiAudioEnabled={midiAudioEnabled}
      onCameraAudioEnabledChange={setCameraAudioEnabled}
      onMidiAudioEnabledChange={setMidiAudioEnabled}
      timeline={recordingTimeline.timeline}
      onReset={recordingTimeline.resetTimeline}
      onTrackOffsetChange={recordingTimeline.setTrackStartOffsetMs}
    />
  )
}

describe('RecordingTimelineEditor', () => {
  afterEach(cleanup)

  it('renders all four tracks and disables linked camera audio when no mic was captured', () => {
    render(<TimelineHarness />)

    expect(screen.getByTestId('recording-timeline-row-midiAudio')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-midiVideo')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-cameraAudio')).toBeTruthy()
    expect(screen.getByTestId('recording-timeline-row-cameraVideo')).toBeTruthy()
    expect((screen.getByLabelText('Camera Audio offset') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('No camera audio captured')).toBeTruthy()
  })

  it('updates, clamps, drags, and resets offsets', () => {
    render(<TimelineHarness hasCameraAudio />)

    const midiAudio = screen.getByLabelText('MIDI Audio offset') as HTMLInputElement
    fireEvent.change(midiAudio, { target: { value: '12345' } })
    expect(midiAudio.value).toBe('10000')

    const midiVideoHandle = screen.getByRole('button', { name: 'Drag MIDI Visuals offset' })
    fireEvent.pointerDown(midiVideoHandle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(midiVideoHandle, { clientX: 148, pointerId: 1 })
    fireEvent.pointerUp(midiVideoHandle, { pointerId: 1 })
    expect((screen.getByLabelText('MIDI Visuals offset') as HTMLInputElement).value).toBe('2000')

    const cameraVideo = screen.getByLabelText('Camera Video offset') as HTMLInputElement
    fireEvent.change(cameraVideo, { target: { value: '750' } })
    expect(cameraVideo.value).toBe('750')
    expect((screen.getByLabelText('Camera Audio offset') as HTMLInputElement).value).toBe('750')

    fireEvent.click(screen.getByRole('button', { name: 'Reset All' }))
    expect(midiAudio.value).toBe('0')
    expect((screen.getByLabelText('MIDI Visuals offset') as HTMLInputElement).value).toBe('0')
    expect(cameraVideo.value).toBe('0')
  })

  it('lets review switch MIDI and camera audio independently', () => {
    render(<TimelineHarness hasCameraAudio />)

    const midiAudio = screen.getByRole('button', { name: 'MIDI Audio' })
    const cameraAudio = screen.getByRole('button', { name: 'Camera Audio' })
    expect(midiAudio.getAttribute('aria-pressed')).toBe('true')
    expect(cameraAudio.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(midiAudio)
    expect(midiAudio.getAttribute('aria-pressed')).toBe('false')
    expect(cameraAudio.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(cameraAudio)
    expect(cameraAudio.getAttribute('aria-pressed')).toBe('false')
  })
})
