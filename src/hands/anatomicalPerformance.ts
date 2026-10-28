import type { ProjectData } from '../midi/types'
import { parseMidi } from '../midi/parser'
import { planPianoFingerings } from './fingeringPlanner'
import { buildTempoMap, tickToSeconds } from '../tempo/tempoMap'

/** Six seconds of the existing original Lumina miniature, with a one-second lead-in. */
export function planStudyPerformance(bytes: Uint8Array, transpose = 0) {
  return planMidiPerformance(bytes, {
    transpose,
    excerptSeconds: 6,
    splitPitch: 67 + transpose,
    handMode: 'split',
  })
}

export interface MidiStudyOptions {
  transpose?: number
  excerptSeconds?: number
  splitPitch?: number
  handMode?: 'auto' | 'split'
  leadIn?: number
  previewLimits?: boolean
}

export function planMidiPerformance(
  bytes: Uint8Array,
  options: MidiStudyOptions = {},
) {
  if (bytes.byteLength > 10 * 1024 * 1024)
    throw new Error('Choose a MIDI file smaller than 10 MB.')
  return planProjectHandPerformance(parseMidi(bytes), options)
}

export function planProjectHandPerformance(
  source: ProjectData,
  options: MidiStudyOptions = {},
) {
  const transpose = options.transpose ?? 0
  const splitPitch = options.splitPitch ?? 60
  const project = {
    ...source,
    tracks: source.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => ({ ...note })),
    })),
  }
  const tempo = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
  for (const track of project.tracks) {
    track.notes = track.notes.filter(
      (note) =>
        tickToSeconds(note.startTick, tempo) <
        (options.excerptSeconds ?? Infinity),
    )
    for (const note of track.notes) note.pitch += transpose
  }
  const notes = project.tracks.flatMap((track) => track.notes)
  if (!notes.length) throw new Error('This MIDI contains no playable notes.')
  if (options.previewLimits !== false && notes.length > 4000)
    throw new Error(
      'This hand-study preview currently supports up to 4,000 notes. Choose a shorter MIDI.',
    )
  if (notes.some((note) => note.pitch < 21 || note.pitch > 108))
    throw new Error(
      'This MIDI contains notes outside the 88-key piano range (A0–C8).',
    )
  if (
    options.previewLimits !== false &&
    notes.some((note) => tickToSeconds(note.endTick, tempo) > 1800)
  )
    throw new Error(
      'This hand-study preview supports MIDI performances up to 30 minutes.',
    )
  const plan = planPianoFingerings(project, { splitPitch })
  if (plan.issues.length)
    throw new Error(
      `The fingering planner found ${plan.issues.length} unplayable or conflicting note groups. Try a piano arrangement with fewer simultaneous notes.`,
    )
  const events = project.tracks
    .flatMap((track) =>
      track.notes.map((note) => {
        const assignment = plan.assignments[note.id]
        if (!assignment) throw new Error(`Missing fingering for ${note.id}`)
        return {
          id: note.id,
          pitch: note.pitch,
          finger: assignment.finger - 1,
          hand:
            options.handMode === 'split'
              ? note.pitch < splitPitch
                ? 'left'
                : 'right'
              : assignment.hand,
          start: (options.leadIn ?? 1) + tickToSeconds(note.startTick, tempo),
          end: (options.leadIn ?? 1) + tickToSeconds(note.endTick, tempo),
          velocity: note.velocity,
          manual: note.fingering?.source === 'manual',
        }
      }),
    )
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
  // Preserve the source MIDI's two parts. Refine the app's seed fingerings for
  // this mesh's reach, penalizing wrist travel and reserving held fingers.
  for (const hand of ['left', 'right']) {
    const notes = events.filter((e) => e.hand === hand)
    const sign = hand === 'left' ? -1 : 1
    const xFor = (pitch: number) => {
      const semitone = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6][
        pitch % 12
      ]
      return sign * (Math.floor(pitch / 12) * 7 + semitone) * 0.0235
    }
    type Path = { finger: number; previous: Path | null }
    type State = {
      cost: number
      wrist: number
      path: Path | null
      active: { finger: number; end: number; anchor: number; pitch: number }[]
    }
    let beam: State[] = [{ cost: 0, wrist: 0, path: null, active: [] }]
    for (const note of notes) {
      const next: State[] = []
      for (const state of beam)
        for (let finger = 0; finger < 5; finger++) {
          if (note.manual && finger !== note.finger) continue
          const active = state.active.filter((a) => a.end > note.start + 0.001)
          if (
            active.some(
              (a) =>
                a.finger === finger ||
                (finger !== 0 &&
                  a.finger !== 0 &&
                  sign * (note.pitch - a.pitch) * (finger - a.finger) < 0),
            )
          )
            continue
          const anchor =
            xFor(note.pitch) - [-0.055, -0.024, 0, 0.028, 0.05][finger]
          const anchors = [anchor, ...active.map((a) => a.anchor)]
          const wrist = anchors.reduce((a, b) => a + b, 0) / anchors.length
          const spread = anchors.reduce((sum, a) => sum + (a - wrist) ** 2, 0)
          const travel = state.path ? (wrist - state.wrist) ** 2 : 0
          const cost =
            state.cost +
            travel * 2000 +
            spread * 8000 +
            (finger === note.finger ? 0 : 0.002)
          next.push({
            cost,
            wrist,
            path: { finger, previous: state.path },
            active: [
              ...active,
              { finger, end: note.end, anchor, pitch: note.pitch },
            ],
          })
        }
      beam = next.sort((a, b) => a.cost - b.cost).slice(0, 48)
      if (!beam.length)
        throw new Error(
          `Cannot assign non-conflicting fingers to the ${hand} hand at ${(note.start - (options.leadIn ?? 1)).toFixed(2)} s. Try another hand split or a simpler piano arrangement.`,
        )
    }
    const chosen: number[] = []
    for (let path = beam[0].path; path; path = path.previous)
      chosen.push(path.finger)
    chosen.reverse()
    notes.forEach((note, index) => {
      note.finger = chosen[index]
    })
  }
  return {
    events,
    issues: plan.issues,
    duration: Math.max(...events.map((e) => e.end)) + 0.75,
  }
}
