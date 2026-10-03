/*
INPUT: Parsed MIDI project data with its tempo and time-signature maps.
OUTPUT: A time-ordered stream of synthetic live-MIDI events for Transcriptor preview playback.
PURPOSE: Lets a bundled MIDI exercise the same capture and notation path as a physical keyboard without depending on Web MIDI permissions.
*/

import type { ProjectData } from '../midi/types'
import { buildTempoMap, tickToSeconds } from '../tempo/tempoMap'
import type { LiveMidiEvent } from '../midi/LiveMidiInputController'
import type { TranscriptionMeter } from './types'

/** Separate channels keep preview notes independent from an attached physical device. */
const SAMPLE_CHANNEL_OFFSET = 16

export interface SamplePlaybackEvent extends LiveMidiEvent {
  readonly atMs: number
  readonly durationMs?: number
}

export interface SamplePlaybackPlan {
  readonly bpm: number
  readonly durationMs: number
  readonly events: readonly SamplePlaybackEvent[]
  readonly meter: TranscriptionMeter
}

export function createSamplePlaybackPlan(project: ProjectData): SamplePlaybackPlan {
  const tempoMap = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
  const events: SamplePlaybackEvent[] = project.tracks.flatMap((track) => track.notes.flatMap((note) => {
    const startMs = Math.max(0, Math.round(tickToSeconds(note.startTick, tempoMap) * 1_000))
    const endMs = Math.max(startMs + 1, Math.round(tickToSeconds(note.endTick, tempoMap) * 1_000))
    const channel = track.channel + SAMPLE_CHANNEL_OFFSET
    return [
      {
        atMs: startMs,
        channel,
        durationMs: endMs - startMs,
        pitch: note.pitch,
        timestampMs: startMs,
        type: 'noteon' as const,
        velocity: note.velocity,
      },
      {
        atMs: endMs,
        channel,
        pitch: note.pitch,
        timestampMs: endMs,
        type: 'noteoff' as const,
        velocity: 0,
      },
    ]
  }))
    .sort((left, right) => left.atMs - right.atMs || eventOrder(left) - eventOrder(right) || left.pitch - right.pitch)

  return {
    bpm: Math.min(300, Math.max(20, Math.round(project.tempoMap[0]?.bpm ?? 120))),
    durationMs: events.reduce((duration, event) => Math.max(duration, event.atMs), 0),
    events,
    meter: meterFromProject(project),
  }
}

function eventOrder(event: SamplePlaybackEvent): number {
  return event.type === 'noteoff' ? 0 : 1
}

function meterFromProject(project: ProjectData): TranscriptionMeter {
  const signature = project.timeSignatures[0]
  const meter = signature == null ? '4/4' : `${signature.numerator}/${signature.denominator}`
  return meter === '3/4' || meter === '6/8' || meter === '4/4' ? meter : '4/4'
}
