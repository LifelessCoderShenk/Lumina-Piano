import { describe, expect, it } from 'vitest'

import type { Note, ProjectData } from '../midi/types'
import { buildTempoMap, tickToSeconds } from '../tempo/tempoMap'
import { buildHandMotionTimeline, sampleHandMotionTimeline } from './handMotionPlanner'

describe('ghost hand motion planner', () => {
  it('rotates knuckles with the wrist while held fingertips stay on their keys', () => {
    const timeline = buildHandMotionTimeline(createProject([assignedNote('held', 64, 480, 720, 'right', 3)]))
    timeline.hands.right.wristTargets[0].yaw = 0
    const straight = sampleHandMotionTimeline(timeline, 600).right
    timeline.hands.right.wristTargets[0].yaw = 0.2
    const turned = sampleHandMotionTimeline(timeline, 600).right
    expect(turned.fingers[3].tip).toEqual(straight.fingers[3].tip)
    expect(distance(turned.fingers[3].joints[0], straight.fingers[3].joints[0])).toBeGreaterThan(0.005)
    expect(distance(turned.fingers[2].tip, straight.fingers[2].tip)).toBeGreaterThan(0.005)
  })

  it('lifts and turns the wrist during a lateral move, then settles at arrival', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('low', 60, 240, 360, 'right', 3),
      assignedNote('high', 84, 960, 1080, 'right', 3),
    ]))
    const [from, to] = timeline.hands.right.wristTargets
    const middle = sampleHandMotionTimeline(timeline, (to.prepareTick + to.startTick) / 2).right
    expect(middle.wrist.height).toBeGreaterThan(Math.max(from.position.height, to.position.height))
    expect(middle.yaw).toBeGreaterThan(Math.max(from.yaw, to.yaw))
    expect(sampleHandMotionTimeline(timeline, to.startTick).right.wrist).toEqual(to.position)
  })

  it.each([1, 2, 3, 4, 5] as const)('preserves finger %i bone lengths through a reachable press and release', (finger) => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('motion', 64, 480, 720, 'right', finger),
    ]))
    const measure = (tick: number) => {
      const joints = sampleHandMotionTimeline(timeline, tick).right.fingers[finger].joints
      return joints.slice(1).map((point, i) => Math.hypot(
        (point.x - joints[i].x) * 8, point.depth - joints[i].depth, point.height - joints[i].height,
      ))
    }
    const baseline = measure(480)
    for (const tick of [0, 360, 420, 479, 600, 721, 780, 950]) {
      measure(tick).forEach((length, i) => expect(length).toBeCloseTo(baseline[i], 5))
    }
    expect(baseline[0]).toBeGreaterThan(baseline[1])
    expect(baseline[1]).toBeGreaterThan(baseline[2])
  })

  it('eases out of a held note instead of recoiling immediately toward rest', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('release', 64, 480, 720, 'right', 3),
    ]))
    const event = timeline.hands.right.fingerEvents[3][0]
    const delta = (event.releaseTick - event.endTick) * 0.01
    const held = sampleHandMotionTimeline(timeline, event.endTick).right.fingers[3]
    const justReleased = sampleHandMotionTimeline(timeline, event.endTick + delta).right.fingers[3]
    const rest = sampleHandMotionTimeline(timeline, event.releaseTick).right.fingers[3]
    expect(distance(held.tip, justReleased.tip) / distance(held.tip, rest.tip)).toBeLessThan(0.001)
    expect(justReleased.pressed).toBe(false)
  })

  it('curves each thumb from the side of its palm without shifting key contact', () => {
    for (const hand of ['left', 'right'] as const) {
      const timeline = buildHandMotionTimeline(createProject([
        assignedNote('thumb', 60, 480, 720, hand, 1),
      ]))
      const thumb = sampleHandMotionTimeline(timeline, 480)[hand].fingers[1]
      const linearX = thumb.joints[0].x + (thumb.tip.x - thumb.joints[0].x) * 0.38
      expect((thumb.joints[1].x - linearX) * (hand === 'right' ? -1 : 1)).toBeGreaterThan(0)
      expect(thumb.tip).toEqual(timeline.hands[hand].fingerEvents[1][0].contact)
    }
  })

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
  it('keeps a sustained thumb in the wrist support span when the little finger reaches', () => {
    const held = buildHandMotionTimeline(createProject([
      assignedNote('thumb', 60, 240, 900, 'right', 1),
      assignedNote('reach', 76, 480, 720, 'right', 5),
    ]))
    const released = buildHandMotionTimeline(createProject([
      assignedNote('thumb', 60, 240, 350, 'right', 1),
      assignedNote('reach', 76, 480, 720, 'right', 5),
    ]))
    expect(held.hands.right.wristTargets[1].position.x)
      .toBeLessThan(released.hands.right.wristTargets[1].position.x)
    expect(sampleHandMotionTimeline(held, 600).right.fingers[1].tip)
      .toEqual(held.hands.right.fingerEvents[1][0].contact)
  })

  it('lets a resting ring finger follow a middle-finger press without moving held fingertips', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('middle', 64, 480, 720, 'right', 3),
    ]))
    const event = timeline.hands.right.fingerEvents[3][0]
    const resting = sampleHandMotionTimeline(timeline, event.prepareTick).right
    const pressing = sampleHandMotionTimeline(timeline, event.startTick).right
    expect(pressing.fingers[4].tip.height).toBeLessThan(resting.fingers[4].tip.height)
    expect(pressing.fingers[4].pressed).toBe(false)
    expect(pressing.fingers[3].tip).toEqual(event.contact)
    expect(pressing.fingers[1].tip).toEqual(resting.fingers[1].tip)
    const before = sampleHandMotionTimeline(timeline, event.startTick - 0.001).right
    expect(distance(before.fingers[4].tip, pressing.fingers[4].tip)).toBeLessThan(0.00001)
  })

  it('keeps relaxed fingertips tucked inside their knuckle spread', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('middle', 64, 480, 720, 'right', 3),
    ]))
    // Measure spread in the neutral hand frame, not after a wrist rotation.
    timeline.hands.right.wristTargets[0].yaw = 0
    const pose = sampleHandMotionTimeline(timeline, 0).right
    for (const finger of [1, 2, 4, 5] as const) {
      expect(Math.abs(pose.fingers[finger].tip.x - pose.wrist.x))
        .toBeLessThan(Math.abs(pose.fingers[finger].joints[0].x - pose.wrist.x))
    }
  })

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

  it('does not jump the finger when a short held note ends during preparation', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('first', 60, 240, 430, 'right', 2),
      assignedNote('next', 62, 480, 600, 'right', 2),
    ]))
    const atRelease = sampleHandMotionTimeline(timeline, 430).right.fingers[2]
    const afterRelease = sampleHandMotionTimeline(timeline, 430.001).right.fingers[2]
    expect(distance(atRelease.tip, afterRelease.tip)).toBeLessThan(0.00001)
    atRelease.joints.forEach((joint, index) => {
      expect(distance(joint, afterRelease.joints[index])).toBeLessThan(0.00001)
    })
  })

  it('keeps finger curl continuous when preparation interrupts a release', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('first', 60, 240, 300, 'right', 2),
      assignedNote('next', 62, 520, 650, 'right', 2),
    ]))
    const boundary = timeline.hands.right.fingerEvents[2][1].prepareTick
    const before = sampleHandMotionTimeline(timeline, boundary - 0.001).right.fingers[2]
    const after = sampleHandMotionTimeline(timeline, boundary).right.fingers[2]
    before.joints.forEach((joint, index) => {
      expect(distance(joint, after.joints[index])).toBeLessThan(0.00001)
    })
  })

  it('raises crossing hands continuously instead of popping at the collision boundary', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('left', 48, 240, 1200, 'left', 3),
      assignedNote('right', 72, 240, 1200, 'right', 3),
    ]))
    const left = timeline.hands.left.wristTargets[0]
    const right = timeline.hands.right.wristTargets[0]
    right.position.x = left.position.x + 0.100001
    const outside = sampleHandMotionTimeline(timeline, 300)
    right.position.x = left.position.x + 0.099999
    const inside = sampleHandMotionTimeline(timeline, 300)
    expect(distance(outside.right.wrist, inside.right.wrist)).toBeLessThan(0.00001)
    expect(inside.right.fingers[3].tip).toEqual(outside.right.fingers[3].tip)
  })

  it('keeps all finger joints continuous as a prepared note makes contact', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('contact', 64, 480, 720, 'right', 3),
    ]))
    const before = sampleHandMotionTimeline(timeline, 479.999).right.fingers[3]
    const atContact = sampleHandMotionTimeline(timeline, 480).right.fingers[3]
    before.joints.forEach((joint, index) => {
      expect(distance(joint, atContact.joints[index])).toBeLessThan(0.00001)
    })
  })

  it('keeps the wrist stable when adjacent fingers cover neighboring notes', () => {
    const timeline = buildHandMotionTimeline(createProject([
      assignedNote('index', 60, 240, 350, 'right', 2),
      assignedNote('middle', 62, 480, 590, 'right', 3),
    ]))
    const targets = timeline.hands.right.wristTargets
    expect(targets[1].position.x).toBe(targets[0].position.x)
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
