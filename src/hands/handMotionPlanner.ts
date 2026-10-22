import type { PianoFinger, PianoHand, ProjectData } from '../midi/types'
import { getBlackKeyWidth, getWhiteKeyWidth, isBlackKey, pitchToKeyX } from '../renderer/pianoMath'
import { buildTempoMap, secondsToTick, tickToSeconds, type PrecomputedTempoMap } from '../tempo/tempoMap'
import { planPianoFingerings, type FingeringPlan } from './fingeringPlanner'

const FINGERS: readonly PianoFinger[] = [1, 2, 3, 4, 5]
const KEYBOARD_COORDINATE_WIDTH = 5200
const CHORD_GROUP_DIVISOR = 24
const RELEASE_SECONDS = 0.18
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
    const separation = Math.abs(leftWrist.position.x - rightWrist.position.x)
    const overlap = easeInOut(normalize(HAND_COLLISION_DISTANCE - separation, 0, HAND_COLLISION_DISTANCE * 0.4))
    leftWrist = { ...leftWrist, position: { ...leftWrist.position, height: leftWrist.position.height + 0.012 * overlap } }
    rightWrist = { ...rightWrist, position: { ...rightWrist.position, height: rightWrist.position.height + 0.05 * overlap } }
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

  let settledX: number | undefined
  let held: FingerMotionEvent[] = []
  return groups.map((group) => {
    const onset = group[0].startTick
    // Keep sustained fingers in the hand's support span when a new note arrives.
    // Otherwise the wrist follows the new note and stretches the held fingers.
    held = held.filter(event => event.endTick > onset)
    const unique = [...new Map([...held, ...group].map((event) => [event.pitch, event])).values()]
    held.push(...group)
    const desiredWristX = unique.reduce((sum, event) => (
      sum + event.contact.x - fingerRestOffsetX(hand, event.finger)
    ), 0) / unique.length
    // Let fingers reach neighboring keys instead of dragging the whole wrist
    // after every arpeggio note. Move only when the comfortable span is exceeded.
    const reach = 0.014
    settledX = settledX == null ? desiredWristX : clamp(settledX, desiredWristX - reach, desiredWristX + reach)
    const pitches = unique.map(({ pitch }) => pitch)
    const span = Math.max(...pitches) - Math.min(...pitches)
    return {
      position: {
        depth: 1.06 + (unique.reduce((sum, event) => sum + event.contact.depth, 0) / unique.length - 0.54) * 0.2,
        height: 0.2 + Math.min(0.045, span * 0.003),
        x: clamp(settledX, 0.025, 0.975),
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
  const targets = {} as Record<PianoFinger, SampledFingerTarget>
  for (const finger of FINGERS) {
    targets[finger] = sampleFingerTarget(track, finger, wristSample.position, tick)
  }
  const fingers = {} as Record<PianoFinger, FingerPose>
  for (const finger of FINGERS) {
    const target = targets[finger]
    const restingTip = followNeighboringFingers(track.hand, finger, wristSample.position, targets)
    const tip = rotateAroundWrist(restingTip, wristSample.position, wristSample.yaw * (1 - target.contactAmount))
    const curl = 0.52 - target.contactAmount * 0.24
    fingers[finger] = {
      contactAmount: target.contactAmount,
      finger,
      joints: buildFingerJoints(track.hand, finger, wristSample.position, tip, curl, wristSample.yaw),
      pressed: target.pressed,
      targetPitch: target.targetPitch,
      tip,
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

/** Relaxed fingers move slightly with their neighbors, rather than staying splayed
 * in a fixed fan. Contacted fingertips remain pinned to the keyboard. */
function followNeighboringFingers(
  hand: PianoHand,
  finger: PianoFinger,
  wrist: HandSpacePoint,
  targets: Record<PianoFinger, SampledFingerTarget>,
): HandSpacePoint {
  const target = targets[finger]
  if (finger === 1 || target.contactAmount >= 1) return target.tip
  let depth = 0
  let height = 0
  for (const neighbor of FINGERS) {
    if (neighbor === 1 || Math.abs(neighbor - finger) !== 1) continue
    const other = targets[neighbor]
    const rest = getRestTip(hand, neighbor, wrist)
    // Ring and middle fingers share more motion than the independent index.
    const coupling = finger === 4 || neighbor === 4 ? 0.24 : 0.12
    const influence = other.contactAmount * coupling
    depth += clamp(other.tip.depth - rest.depth, -0.12, 0.12) * influence
    height += clamp(other.tip.height - rest.height, -0.1, 0.1) * influence
  }
  const freedom = 1 - target.contactAmount
  return {
    ...target.tip,
    depth: target.tip.depth + depth * freedom,
    height: target.tip.height + height * freedom,
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
    const progress = easeInOut(normalize(tick, Math.max(next.prepareTick, previous?.startTick ?? next.prepareTick), next.startTick))
    const travel = clamp(Math.abs(next.position.x - from.position.x) / 0.08, 0, 1)
    const lift = Math.sin(Math.PI * progress) * travel
    const position = interpolatePoint(from.position, next.position, progress)
    return {
      position: { ...position, height: position.height + lift * 0.045, depth: position.depth - lift * 0.025 },
      yaw: lerp(from.yaw, next.yaw, progress) + Math.sign(next.position.x - from.position.x) * lift * 0.12,
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
    const progress = easeInOut(normalize(tick, Math.max(next.prepareTick, previous?.endTick ?? next.prepareTick), next.startTick))
    return {
      // Preserve the departing pose, curl during the lift, then extend into
      // the next key. Resetting this to zero made the knuckles snap.
      contactAmount: lerp(source.contactAmount, 1, progress) - source.contactAmount * Math.sin(Math.PI * progress),
      pressed: false,
      targetPitch: next.pitch,
      tip: {
        ...interpolatePoint(source.tip, next.contact, progress),
        height: lerp(source.tip.height, next.contact.height, progress) + Math.sin(Math.PI * progress) * Math.min(0.06, 0.015 + Math.abs(source.tip.x - next.contact.x) * 1.5),
      },
    }
  }
  if (previous != null && tick < previous.releaseTick) {
    const progress = easeInOut(normalize(tick, previous.endTick, previous.releaseTick))
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
): Pick<SampledFingerTarget, 'tip' | 'contactAmount'> {
  const rest = getRestTip(hand, finger, wrist)
  if (previous == null || prepareTick >= previous.releaseTick) return { tip: rest, contactAmount: 0 }
  const releaseProgress = easeInOut(normalize(prepareTick, previous.endTick, previous.releaseTick))
  return { tip: interpolatePoint(previous.contact, rest, releaseProgress), contactAmount: 1 - releaseProgress }
}

function buildFingerJoints(
  hand: PianoHand,
  finger: PianoFinger,
  wrist: HandSpacePoint,
  tip: HandSpacePoint,
  curl: number,
  yaw: number,
): [HandSpacePoint, HandSpacePoint, HandSpacePoint, HandSpacePoint] {
  const root = rotateAroundWrist({
    depth: wrist.depth - ({ 1: 0.12, 2: 0.24, 3: 0.27, 4: 0.25, 5: 0.19 }[finger]),
    height: wrist.height - (finger === 1 ? 0.035 : 0.02),
    x: wrist.x + fingerRestOffsetX(hand, finger) * (finger === 1 ? 0.92 : 0.9),
  }, wrist, yaw)
  return articulateFinger(root, tip, finger, hand, curl)
}

function rotateAroundWrist(point: HandSpacePoint, wrist: HandSpacePoint, angle: number): HandSpacePoint {
  const x = (point.x - wrist.x) * 8
  const depth = point.depth - wrist.depth
  const c = Math.cos(angle), s = Math.sin(angle)
  return { ...point, x: wrist.x + (x * c - depth * s) / 8, depth: wrist.depth + x * s + depth * c }
}

/** Solve three phalanges in a bending plane with fixed length ratios. Convert
 * keyboard-width coordinates into the same approximate scale as key depth first.
 * Unreachable MIDI assignments extend proportionally rather than losing contact. */
function articulateFinger(
  root: HandSpacePoint, tip: HandSpacePoint, finger: PianoFinger, hand: PianoHand, curl: number,
): [HandSpacePoint, HandSpacePoint, HandSpacePoint, HandSpacePoint] {
  const dx = (tip.x - root.x) * 8
  const dy = tip.depth - root.depth
  const dz = tip.height - root.height
  const distance = Math.max(0.000001, Math.hypot(dx, dy, dz))
  const direction = [dx / distance, dy / distance, dz / distance]
  const preferred = [finger === 1 ? (hand === 'right' ? -1 : 1) * (0.4 + curl) : 0, 0, 1]
  const projection = preferred.reduce((sum, value, i) => sum + value * direction[i], 0)
  let normal = preferred.map((value, i) => value - projection * direction[i])
  let normalLength = Math.hypot(...normal)
  if (normalLength < 0.00001) {
    normal = [-direction[1], direction[0], 0]
    normalLength = Math.hypot(...normal)
    if (normalLength < 0.00001) { normal = [1, 0, 0]; normalLength = 1 }
  }
  normal = normal.map(value => value / normalLength)
  const length = { 1: 0.44, 2: 0.46, 3: 0.48, 4: 0.46, 5: 0.39 }[finger]
  const lengths = [length * 0.45, length * 0.32, length * 0.23]
  const resultant = (bend: number) => ({
    along: (lengths[0] + lengths[2]) * Math.cos(bend) + lengths[1],
    across: (lengths[0] - lengths[2]) * Math.sin(bend),
  })
  let low = 0, high = 1.65
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2
    const vector = resultant(middle)
    if (Math.hypot(vector.along, vector.across) > distance) low = middle
    else high = middle
  }
  const bend = (low + high) / 2
  const vector = resultant(bend)
  const rotation = Math.atan2(vector.across, vector.along)
  const scale = distance / Math.hypot(vector.along, vector.across)
  const joints: HandSpacePoint[] = [{ ...root }]
  let point = [root.x * 8, root.depth, root.height]
  for (let i = 0; i < 2; i++) {
    const angle = (1 - i) * bend - rotation
    point = point.map((value, axis) => value + lengths[i] * scale * (
      direction[axis] * Math.cos(angle) + normal[axis] * Math.sin(angle)
    ))
    joints.push({ x: point[0] / 8, depth: point[1], height: point[2] })
  }
  return [joints[0], joints[1], joints[2], { ...tip }]
}

function getRestTip(hand: PianoHand, finger: PianoFinger, wrist: HandSpacePoint): HandSpacePoint {
  return {
    // A relaxed arch: long fingers flex toward the palm, the little finger
    // stays shorter, and the thumb rests beside the index instead of flaring.
    depth: wrist.depth - ({ 1: 0.31, 2: 0.43, 3: 0.46, 4: 0.43, 5: 0.35 }[finger]),
    height: wrist.height - ({ 1: 0.085, 2: 0.11, 3: 0.12, 4: 0.115, 5: 0.10 }[finger]),
    x: wrist.x + fingerRestOffsetX(hand, finger) * (finger === 1 ? 0.80 : 0.86),
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
    depth: black ? 0.32 : 0.54,
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
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
