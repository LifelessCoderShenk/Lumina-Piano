import { describe, expect, it } from 'vitest'

import type { Note, ProjectData } from '../midi/types'
import { applyFingeringPlan, planPianoFingerings } from './fingeringPlanner'

describe('piano fingering planner', () => {
  it('uses all five right-hand fingers for an ascending five-note scale', () => {
    const project = createProject([60, 62, 64, 65, 67].map((pitch, index) => note(`n${index}`, pitch, index * 120)))
    const plan = planPianoFingerings(project)

    expect(Object.values(plan.assignments).map(({ hand }) => hand)).toEqual(Array(5).fill('right'))
    expect(Object.values(plan.assignments).map(({ finger }) => finger)).toEqual([1, 2, 3, 4, 5])
  })

  it('mirrors finger order for an ascending low-register left-hand scale', () => {
    const project = createProject([48, 50, 52, 53, 55].map((pitch, index) => note(`left-${index}`, pitch, index * 120)))
    const plan = planPianoFingerings(project)

    expect(Object.values(plan.assignments).map(({ hand }) => hand)).toEqual(Array(5).fill('left'))
    expect(Object.values(plan.assignments).map(({ finger }) => finger)).toEqual([5, 4, 3, 2, 1])
  })

  it('uses distinct fingers for simultaneous chord notes and splits chords larger than one hand', () => {
    const pitches = [40, 43, 47, 60, 64, 67]
    const project = createProject(pitches.map((pitch, index) => note(`chord-${index}`, pitch, 0)))
    const plan = planPianoFingerings(project)
    const assignments = Object.values(plan.assignments)

    expect(new Set(assignments.map(({ hand }) => hand))).toEqual(new Set(['left', 'right']))
    for (const hand of ['left', 'right'] as const) {
      const fingers = assignments.filter((assignment) => assignment.hand === hand).map(({ finger }) => finger)
      expect(new Set(fingers).size).toBe(fingers.length)
    }
  })

  it('keeps the same finger for quick repeated notes', () => {
    const project = createProject([0, 120, 240, 360].map((tick, index) => note(`repeat-${index}`, 64, tick, 60)))
    const plan = planPianoFingerings(project)

    expect(new Set(Object.values(plan.assignments).map(({ hand, finger }) => `${hand}:${finger}`)).size).toBe(1)
  })

  it('preserves manual assignments and persists generated results into a copied project', () => {
    const manual = note('manual', 72, 0)
    manual.fingering = { hand: 'left', finger: 2, source: 'manual' }
    const project = createProject([manual, note('generated', 76, 240)])
    const plan = planPianoFingerings(project)
    const applied = applyFingeringPlan(project, plan)

    expect(plan.assignments.manual).toEqual({ hand: 'left', finger: 2, source: 'manual' })
    expect(applied.tracks[0].notes[0].fingering).toEqual(plan.assignments.manual)
    expect(applied.tracks[0].notes[1].fingering?.source).toBe('generated')
    expect(applied).not.toBe(project)
  })

  it('assigns every note and reports a dense chord requiring more than ten fingers', () => {
    const project = createProject(Array.from({ length: 11 }, (_, index) => note(`dense-${index}`, 48 + index, 0)))
    const plan = planPianoFingerings(project)

    expect(Object.keys(plan.assignments)).toHaveLength(11)
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'too-many-notes', startTick: 0 }))
  })

  it('produces identical plans across repeated analysis', () => {
    const project = createProject([
      note('a', 48, 0), note('b', 55, 0), note('c', 60, 120),
      note('d', 64, 240), note('e', 67, 240), note('f', 72, 480),
    ])

    expect(planPianoFingerings(project)).toEqual(planPianoFingerings(project))
  })

  it('keeps duplicate-pitch notes on the same generated finger', () => {
    const project = createProject([note('track-a', 60, 0), note('track-b', 60, 0)], true)
    const plan = planPianoFingerings(project)

    expect(plan.assignments['track-a']).toEqual(plan.assignments['track-b'])
  })

  it('reports conflicting manual choices on duplicate pitches without replacing either choice', () => {
    const first = note('first', 60, 0)
    const second = note('second', 60, 0)
    first.fingering = { hand: 'left', finger: 1, source: 'manual' }
    second.fingering = { hand: 'right', finger: 2, source: 'manual' }

    const plan = planPianoFingerings(createProject([first, second], true))

    expect(plan.assignments.first).toEqual(first.fingering)
    expect(plan.assignments.second).toEqual(second.fingering)
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'manual-conflict' }))
  })

  it('treats slightly rolled chord onsets as one playable finger group', () => {
    const project = createProject([
      note('rolled-1', 60, 0),
      note('rolled-2', 64, 8),
      note('rolled-3', 67, 16),
    ])
    const plan = planPianoFingerings(project, { chordToleranceTicks: 20 })
    const assignments = Object.values(plan.assignments)

    expect(new Set(assignments.map(({ hand }) => hand)).size).toBe(1)
    expect(new Set(assignments.map(({ finger }) => finger)).size).toBe(3)
  })
})

function note(id: string, pitch: number, startTick: number, duration = 100): Note {
  return {
    endTick: startTick + duration,
    id,
    pitch,
    startTick,
    velocity: 90,
    visualEndTick: startTick + duration,
  }
}

function createProject(notes: Note[], splitTracks = false): ProjectData {
  const tracks = splitTracks
    ? notes.map((value, index) => ({ channel: index, id: `track-${index}`, name: `Track ${index}`, notes: [value] }))
    : [{ channel: 0, id: 'piano', name: 'Piano', notes }]
  return {
    tempoMap: [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }],
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: Math.max(0, ...notes.map(({ visualEndTick }) => visualEndTick)),
    tracks,
  }
}
