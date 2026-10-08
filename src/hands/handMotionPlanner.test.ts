import { describe, expect, it } from 'vitest'

import type { Note, ProjectData } from '../midi/types'
import { buildTempoMap, tickToSeconds } from '../tempo/tempoMap'
import { buildHandMotionTimeline, sampleHandMotionTimeline } from './handMotionPlanner'

describe('ghost hand motion planner', () => {
  it('places the assigned fingertip exactly on its key throughout a held note', () => {
    const project = createProject([
      assignedNote('held', 60, 480, 960, 'right', 1),
    ])
    const timeline = buildHandMotionTimeline(project)
    const onset = sampleHandMotionTimeline(timeline, 480).right.fingers[1]
    const held = sampleHandMotionTimeline(timeline, 720).right.fingers[1]

    expect(onset.pressed).toBe(true)
    expect(onset.targetPitch).toBe(60)
    expect(held.tip).toEqual(onset.tip)
    expect(held.joints[3]).toEqual(held.tip)
  })

  it('approaches the next key smoothly before onset and releases upward afterward', () => {
    const project = createProject([assignedNote('motion', 67, 480, 720, 'right', 3)])
    const timeline = buildHandMotionTimeline(project)
    const event = timeline.hands.right.fingerEvents[3][0]
    const before = sampleHandMotionTimeline(timeline, event.prepareTick).right.fingers[3]
    const midway = sampleHandMotionTimeline(timeline, Math.round((event.prepareTick + event.startTick) / 2)).right.fingers[3]
    const contact = sampleHandMotionTimeline(timeline, event.startTick).right.fingers[3]
    const released = sampleHandMotionTimeline(timeline, Math.round((event.endTick + event.releaseTick) / 2)).right.fingers[3]

    expect(distance(midway.tip, contact.tip)).toBeLessThan(distance(before.tip, contact.tip))
    expect(contact.pressed).toBe(true)
    expect(released.pressed).toBe(false)
    expect(released.tip.height).toBeGreaterThan(contact.tip.height)
  })

  it('moves the wrist between distant phrases instead of teleporting', () => {
    const project = createProject([
      assignedNote('low', 60, 240, 360, 'right', 1),
      assignedNote('high', 84, 960, 1080, 'right', 5),
    ])
    const timeline = buildHandMotionTimeline(project)
    const targets = timeline.hands.right.wristTargets
    const middleTick = Math.round((targets[1].prepareTick + targets[1].startTick) / 2)
    const middle = sampleHandMotionTimeline(timeline, middleTick).right.wrist.x

    expect(middle).toBeGreaterThan(Math.min(targets[0].position.x, targets[1].position.x))
    expect(middle).toBeLessThan(Math.max(targets[0].position.x, targets[1].position.x))
  })

  it('uses deeper and higher contact positions for black keys', () => {
    const project = createProject([
      assignedNote('white', 60, 240, 360, 'left', 1),
      assignedNote('black', 61, 240, 360, 'right', 1),
    ])
    const pose = sampleHandMotionTimeline(buildHandMotionTimeline(project), 240)

    expect(pose.right.fingers[1].tip.depth).toBeLessThan(pose.left.fingers[1].tip.depth)
    expect(pose.right.fingers[1].tip.height).toBeGreaterThan(pose.left.fingers[1].tip.height)
  })
})

describe('ghost hand pose sampling', () => {
  it('keeps close wrists vertically separated while both fingertips stay in contact', () => {
    const project = createProject([
      assignedNote('left', 59, 240, 480, 'left', 1),
      assignedNote('right', 60, 240, 480, 'right', 1),
    ])
    const pose = sampleHandMotionTimeline(buildHandMotionTimeline(project), 240)

    expect(pose.right.wrist.height - pose.left.wrist.height).toBeGreaterThan(0.02)
    expect(pose.left.fingers[1].pressed).toBe(true)
    expect(pose.right.fingers[1].pressed).toBe(true)
  })

  it('creates five finite four-joint finger chains for every visible hand', () => {
    const pose = sampleHandMotionTimeline(buildHandMotionTimeline(createProject([
      assignedNote('note', 64, 240, 480, 'right', 3),
    ])), 300)

    expect(Object.keys(pose.right.fingers)).toHaveLength(5)
    for (const finger of Object.values(pose.right.fingers)) {
      expect(finger.joints).toHaveLength(4)
      expect(finger.joints.flatMap((point) => [point.x, point.depth, point.height]).every(Number.isFinite)).toBe(true)
    }
  })

  it('uses tempo-aware preparation time and samples deterministically', () => {
    const project = createProject([assignedNote('tempo', 72, 960, 1200, 'right', 4)], [
      { bpm: 120, microsecondsPerBeat: 500_000, tick: 0 },
      { bpm: 60, microsecondsPerBeat: 1_000_000, tick: 480 },
    ])
    const timeline = buildHandMotionTimeline(project)
    const event = timeline.hands.right.fingerEvents[4][0]
    const tempoMap = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
    const preparationSeconds = tickToSeconds(event.startTick, tempoMap) - tickToSeconds(event.prepareTick, tempoMap)
    const first = sampleHandMotionTimeline(timeline, 900)
    const second = sampleHandMotionTimeline(timeline, 900)

    expect(preparationSeconds).toBeGreaterThanOrEqual(0.12)
    expect(preparationSeconds).toBeLessThanOrEqual(0.18)
    expect(first).toEqual(second)
  })

  it('automatically creates assignments when notes do not contain fingering metadata', () => {
    const project = createProject([
      plainNote('auto-1', 48, 0, 120),
      plainNote('auto-2', 72, 240, 360),
    ])
    const timeline = buildHandMotionTimeline(project)

    const eventCount = [...Object.values(timeline.hands.left.fingerEvents), ...Object.values(timeline.hands.right.fingerEvents)]
      .reduce((sum, events) => sum + events.length, 0)
    expect(eventCount).toBe(2)
  })
})

function assignedNote(
  id: string,
  pitch: number,
  startTick: number,
  endTick: number,
  hand: 'left' | 'right',
  finger: 1 | 2 | 3 | 4 | 5,
): Note {
  return {
    ...plainNote(id, pitch, startTick, endTick),
    fingering: { finger, hand, source: 'manual' },
  }
}

function plainNote(id: string, pitch: number, startTick: number, endTick: number): Note {
  return { endTick, id, pitch, startTick, velocity: 90, visualEndTick: endTick }
}

function createProject(notes: Note[], tempoMap = [{ bpm: 120, microsecondsPerBeat: 500_000, tick: 0 }]): ProjectData {
  return {
    tempoMap,
    ticksPerQuarter: 480,
    timeSignatures: [{ denominator: 4, numerator: 4, tick: 0 }],
    totalTicks: Math.max(0, ...notes.map(({ visualEndTick }) => visualEndTick)),
    tracks: [{ channel: 0, id: 'piano', name: 'Piano', notes }],
  }
}

function distance(left: { x: number; depth: number; height: number }, right: { x: number; depth: number; height: number }): number {
  return Math.hypot(left.x - right.x, left.depth - right.depth, left.height - right.height)
}
