import type { PianoFinger, PianoHand, ProjectData } from '../midi/types'
import { getBlackKeyWidth, getWhiteKeyWidth, isBlackKey, pitchToKeyX } from '../renderer/pianoMath'
import { buildTempoMap, secondsToTick, tickToSeconds, type PrecomputedTempoMap } from '../tempo/tempoMap'
import { planPianoFingerings, type FingeringPlan } from './fingeringPlanner'

const FINGERS: readonly PianoFinger[] = [1, 2, 3, 4, 5]
const KEYBOARD_COORDINATE_WIDTH = 5200
const CHORD_GROUP_DIVISOR = 24
const RELEASE_SECONDS = 0.11
const HAND_COLLISION_DISTANCE = 0.1
const MOTION_PLANNER_BEAM_WIDTH = 16

export interface HandSpacePoint {
  depth: number
  height: number
  x: number
}

export interface FingerMotionEvent {
  contact: HandSpacePoint
  endTick: number
  finger: PianoFinger
  hand: PianoHand
  noteIds: string[]
  pitch: number
  prepareTick: number
  releaseTick: number
  startTick: number
}

export interface WristMotionTarget {
  position: HandSpacePoint
  prepareTick: number
  startTick: number
  yaw: number
}

export interface HandMotionTrack {
  fingerEvents: Record<PianoFinger, FingerMotionEvent[]>
  hand: PianoHand
  wristTargets: WristMotionTarget[]
}

export interface HandMotionTimeline {
  endTick: number
  hands: Record<PianoHand, HandMotionTrack>
}

export interface FingerPose {
  contactAmount: number
  finger: PianoFinger
  joints: [HandSpacePoint, HandSpacePoint, HandSpacePoint, HandSpacePoint]
  pressed: boolean
  targetPitch: number | null
  tip: HandSpacePoint
}

export interface GhostHandPose {
  fingers: Record<PianoFinger, FingerPose>
  hand: PianoHand
  visible: boolean
  wrist: HandSpacePoint
  yaw: number
}

export interface GhostHandsPose {
  left: GhostHandPose
  right: GhostHandPose
  tick: number
}

interface AssignedNote {
  endTick: number
  finger: PianoFinger
  hand: PianoHand
  noteIds: string[]
  pitch: number
  startTick: number
}

interface SampledFingerTarget {
  contactAmount: number
  pressed: boolean
  targetPitch: number | null
  tip: HandSpacePoint
}

export function buildHandMotionTimeline(
  project: ProjectData,
  fingeringPlan?: FingeringPlan,
): HandMotionTimeline {
  const tempoMap = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
  const resolvedFingeringPlan = fingeringPlan ?? planPianoFingerings(project, {
    beamWidth: MOTION_PLANNER_BEAM_WIDTH,
  })
  const assignedNotes = collectAssignedNotes(project, resolvedFingeringPlan)
  const hands = {
    left: buildHandTrack('left', assignedNotes, tempoMap, project.ticksPerQuarter),
    right: buildHandTrack('right', assignedNotes, tempoMap, project.ticksPerQuarter),
  }
  return { endTick: project.totalTicks, hands }
}

export function sampleHandMotionTimeline(timeline: HandMotionTimeline, tick: number): GhostHandsPose {
  const safeTick = Number.isFinite(tick) ? tick : 0
  let leftWrist = sampleWrist(timeline.hands.left, safeTick)
  let rightWrist = sampleWrist(timeline.hands.right, safeTick)

  if (
    timeline.hands.left.wristTargets.length > 0
    && timeline.hands.right.wristTargets.length > 0
    && Math.abs(leftWrist.position.x - rightWrist.position.x) < HAND_COLLISION_DISTANCE
  ) {
    leftWrist = { ...leftWrist, position: { ...leftWrist.position, height: leftWrist.position.height + 0.012 } }
    rightWrist = { ...rightWrist, position: { ...rightWrist.position, height: rightWrist.position.height + 0.05 } }
  }

  return {
    left: sampleHand(timeline.hands.left, leftWrist, safeTick),
    right: sampleHand(timeline.hands.right, rightWrist, safeTick),
    tick: safeTick,
  }
}

function collectAssignedNotes(project: ProjectData, plan: FingeringPlan): AssignedNote[] {
  const merged = new Map<string, AssignedNote>()
  const notes = project.tracks.flatMap((track) => track.notes)
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id))

  for (const note of notes) {
    const fingering = note.fingering?.source === 'manual' ? note.fingering : plan.assignments[note.id]
    if (fingering == null) continue
    const key = `${fingering.hand}:${fingering.finger}:${note.pitch}:${note.startTick}`
    const existing = merged.get(key)
    if (existing == null) {
      merged.set(key, {
        endTick: Math.max(note.startTick + 1, note.endTick),
        finger: fingering.finger,
        hand: fingering.hand,
        noteIds: [note.id],
        pitch: note.pitch,
        startTick: note.startTick,
      })
    } else {
      existing.endTick = Math.max(existing.endTick, note.endTick)
      existing.noteIds.push(note.id)
    }
  }
  return [...merged.values()]
}

function buildHandTrack(
  hand: PianoHand,
  assignedNotes: AssignedNote[],
  tempoMap: PrecomputedTempoMap,
  ticksPerQuarter: number,
): HandMotionTrack {
  const fingerEvents = createFingerEventRecord()
  for (const finger of FINGERS) {
    const fingerNotes = assignedNotes
      .filter((note) => note.hand === hand && note.finger === finger)
      .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch)
    let previousPitch: number | null = null
    for (const note of fingerNotes) {
      const travel = previousPitch == null ? 0 : Math.abs(note.pitch - previousPitch)
      const approachSeconds = Math.min(0.35, Math.max(0.12, 0.16 + travel * 0.012))
      fingerEvents[finger].push({
        contact: getKeyContact(note.pitch),
        endTick: note.endTick,
        finger,
        hand,
        noteIds: [...note.noteIds].sort(),
        pitch: note.pitch,
        prepareTick: offsetTickBySeconds(note.startTick, -approachSeconds, tempoMap),
        releaseTick: offsetTickBySeconds(note.endTick, RELEASE_SECONDS, tempoMap),
        startTick: note.startTick,
      })
      previousPitch = note.pitch
    }
  }

  return {
    fingerEvents,
    hand,
    wristTargets: buildWristTargets(hand, fingerEvents, Math.max(1, Math.round(ticksPerQuarter / CHORD_GROUP_DIVISOR))),
  }
}

function createFingerEventRecord(): Record<PianoFinger, FingerMotionEvent[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [] }
}

function buildWristTargets(
  hand: PianoHand,
  fingerEvents: Record<PianoFinger, FingerMotionEvent[]>,
  chordToleranceTicks: number,
): WristMotionTarget[] {
  const events = FINGERS.flatMap((finger) => fingerEvents[finger])
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.finger - right.finger)
  const groups: FingerMotionEvent[][] = []
  for (const event of events) {
    const group = groups[groups.length - 1]
    if (group == null || event.startTick - group[0].startTick > chordToleranceTicks) groups.push([event])
    else group.push(event)
  }

  return groups.map((group) => {
    const unique = [...new Map(group.map((event) => [event.pitch, event])).values()]
    const desiredWristX = unique.reduce((sum, event) => (
      sum + event.contact.x - fingerRestOffsetX(hand, event.finger)
    ), 0) / unique.length
    const pitches = unique.map(({ pitch }) => pitch)
    const span = Math.max(...pitches) - Math.min(...pitches)
    return {
      position: {
        depth: 0.9,
        height: 0.2 + Math.min(0.045, span * 0.003),
        x: clamp(desiredWristX, 0.025, 0.975),
      },
      prepareTick: Math.min(...group.map(({ prepareTick }) => prepareTick)),
      startTick: Math.min(...group.map(({ startTick }) => startTick)),
      yaw: (hand === 'left' ? -0.08 : 0.08) + clamp(span * (hand === 'left' ? -0.006 : 0.006), -0.08, 0.08),
    }
  })
}

function sampleHand(
  track: HandMotionTrack,
  wristSample: { position: HandSpacePoint; yaw: number },
  tick: number,
): GhostHandPose {
  const fingers = {} as Record<PianoFinger, FingerPose>
  for (const finger of FINGERS) {
    const target = sampleFingerTarget(track, finger, wristSample.position, tick)
    const curl = target.pressed ? 0.28 : 0.52 - target.contactAmount * 0.18
    fingers[finger] = {
      contactAmount: target.contactAmount,
      finger,
      joints: buildFingerJoints(track.hand, finger, wristSample.position, target.tip, curl),
      pressed: target.pressed,
      targetPitch: target.targetPitch,
      tip: target.tip,
    }
  }
  return {
    fingers,
    hand: track.hand,
    visible: track.wristTargets.length > 0,
    wrist: wristSample.position,
    yaw: wristSample.yaw,
  }
}

function sampleWrist(track: HandMotionTrack, tick: number): { position: HandSpacePoint; yaw: number } {
  const targets = track.wristTargets
  if (targets.length === 0) return { position: defaultWrist(track.hand), yaw: track.hand === 'left' ? -0.08 : 0.08 }
  const nextIndex = firstIndexAfter(targets, tick, (target) => target.startTick)
  const previous = targets[nextIndex - 1]
  const next = targets[nextIndex]
  if (next != null && tick >= next.prepareTick) {
    const from = previous ?? next
    const progress = easeInOut(normalize(tick, next.prepareTick, next.startTick))
    return {
      position: interpolatePoint(from.position, next.position, progress),
      yaw: lerp(from.yaw, next.yaw, progress),
    }
  }
  const selected = previous ?? next ?? targets[0]
  return { position: { ...selected.position }, yaw: selected.yaw }
}

function sampleFingerTarget(
  track: HandMotionTrack,
  finger: PianoFinger,
  wrist: HandSpacePoint,
  tick: number,
): SampledFingerTarget {
  const events = track.fingerEvents[finger]
  const rest = getRestTip(track.hand, finger, wrist)
  if (events.length === 0) return { contactAmount: 0, pressed: false, targetPitch: null, tip: rest }
  const nextIndex = firstIndexAfter(events, tick, (event) => event.startTick)
  const previous = events[nextIndex - 1]
  const next = events[nextIndex]

  if (previous != null && tick <= previous.endTick) {
    return { contactAmount: 1, pressed: true, targetPitch: previous.pitch, tip: { ...previous.contact } }
  }
  if (next != null && tick >= next.prepareTick) {
    const source = getApproachSource(track.hand, finger, wrist, previous, next.prepareTick)
    const progress = easeInOut(normalize(tick, next.prepareTick, next.startTick))
    return {
      contactAmount: progress,
      pressed: false,
      targetPitch: next.pitch,
      tip: interpolatePoint(source, next.contact, progress),
    }
  }
  if (previous != null && tick < previous.releaseTick) {
    const progress = easeOut(normalize(tick, previous.endTick, previous.releaseTick))
    return {
      contactAmount: 1 - progress,
      pressed: false,
      targetPitch: previous.pitch,
      tip: interpolatePoint(previous.contact, rest, progress),
    }
  }
  return { contactAmount: 0, pressed: false, targetPitch: null, tip: rest }
}

function getApproachSource(
  hand: PianoHand,
  finger: PianoFinger,
  wrist: HandSpacePoint,
  previous: FingerMotionEvent | undefined,
  prepareTick: number,
): HandSpacePoint {
  const rest = getRestTip(hand, finger, wrist)
  if (previous == null || prepareTick >= previous.releaseTick) return rest
  const releaseProgress = easeOut(normalize(prepareTick, previous.endTick, previous.releaseTick))
  return interpolatePoint(previous.contact, rest, releaseProgress)
}

function buildFingerJoints(
  hand: PianoHand,
  finger: PianoFinger,
  wrist: HandSpacePoint,
  tip: HandSpacePoint,
  curl: number,
): [HandSpacePoint, HandSpacePoint, HandSpacePoint, HandSpacePoint] {
  const root: HandSpacePoint = {
    depth: wrist.depth - (finger === 1 ? 0.09 : 0.075),
    height: wrist.height - (finger === 1 ? 0.035 : 0.02),
    x: wrist.x + fingerRestOffsetX(hand, finger) * 0.62,
  }
  const control: HandSpacePoint = {
    depth: lerp(root.depth, tip.depth, 0.48) - 0.025 * curl,
    height: Math.max(root.height, tip.height) + 0.045 + 0.055 * curl,
    x: lerp(root.x, tip.x, 0.48),
  }
  return [root, quadraticPoint(root, control, tip, 0.38), quadraticPoint(root, control, tip, 0.72), { ...tip }]
}

function getRestTip(hand: PianoHand, finger: PianoFinger, wrist: HandSpacePoint): HandSpacePoint {
  return {
    depth: wrist.depth - (finger === 1 ? 0.2 : 0.27),
    height: wrist.height - 0.075 + (finger === 1 || finger === 5 ? 0.018 : 0),
    x: wrist.x + fingerRestOffsetX(hand, finger),
  }
}

function fingerRestOffsetX(hand: PianoHand, finger: PianoFinger): number {
  const rightOffsets: Record<PianoFinger, number> = { 1: -0.028, 2: -0.013, 3: 0, 4: 0.013, 5: 0.027 }
  return hand === 'right' ? rightOffsets[finger] : -rightOffsets[finger]
}

function getKeyContact(pitch: number): HandSpacePoint {
  const black = isBlackKey(pitch)
  const keyWidth = black ? getBlackKeyWidth(KEYBOARD_COORDINATE_WIDTH) : getWhiteKeyWidth(KEYBOARD_COORDINATE_WIDTH)
  return {
    depth: black ? 0.43 : 0.64,
    height: black ? 0.055 : 0.008,
    x: (pitchToKeyX(pitch, KEYBOARD_COORDINATE_WIDTH) + keyWidth / 2) / KEYBOARD_COORDINATE_WIDTH,
  }
}

function defaultWrist(hand: PianoHand): HandSpacePoint {
  return { depth: 0.9, height: 0.2, x: hand === 'left' ? 0.38 : 0.62 }
}

function offsetTickBySeconds(tick: number, seconds: number, tempoMap: PrecomputedTempoMap): number {
  const targetSeconds = Math.max(0, tickToSeconds(tick, tempoMap) + seconds)
  return Math.max(0, secondsToTick(targetSeconds, tempoMap))
}

function firstIndexAfter<T>(values: T[], tick: number, getTick: (value: T) => number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (getTick(values[middle]) <= tick) low = middle + 1
    else high = middle
  }
  return low
}

function quadraticPoint(start: HandSpacePoint, control: HandSpacePoint, end: HandSpacePoint, t: number): HandSpacePoint {
  const inverse = 1 - t
  return {
    depth: inverse * inverse * start.depth + 2 * inverse * t * control.depth + t * t * end.depth,
    height: inverse * inverse * start.height + 2 * inverse * t * control.height + t * t * end.height,
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
  }
}

function interpolatePoint(from: HandSpacePoint, to: HandSpacePoint, progress: number): HandSpacePoint {
  return {
    depth: lerp(from.depth, to.depth, progress),
    height: lerp(from.height, to.height, progress),
    x: lerp(from.x, to.x, progress),
  }
}

function normalize(value: number, start: number, end: number): number {
  if (end <= start) return value >= end ? 1 : 0
  return clamp((value - start) / (end - start), 0, 1)
}

function easeInOut(value: number): number {
  return value * value * (3 - 2 * value)
}

function easeOut(value: number): number {
  return 1 - (1 - value) * (1 - value)
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
