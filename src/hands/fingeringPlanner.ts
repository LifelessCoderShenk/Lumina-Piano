import type { Note, NoteFingering, PianoFinger, PianoHand, ProjectData } from '../midi/types'

const DEFAULT_BEAM_WIDTH = 48
const DEFAULT_SPLIT_PITCH = 60

export type FingeringIssueCode = 'manual-conflict' | 'too-many-notes' | 'unplayable-group'

export interface FingeringIssue {
  code: FingeringIssueCode
  noteIds: string[]
  startTick: number
}

export interface FingeringPlan {
  assignments: Record<string, NoteFingering>
  issues: FingeringIssue[]
}

export interface FingeringPlannerOptions {
  beamWidth?: number
  chordToleranceTicks?: number
  splitPitch?: number
}

interface PitchEvent {
  notes: Note[]
  pitch: number
}

interface EventConstraint {
  finger?: PianoFinger
  hand?: PianoHand
}

interface DescribedEvent extends PitchEvent {
  constraint: EventConstraint
  eventIndex: number
}

interface OnsetGroup {
  events: PitchEvent[]
  startTick: number
}

interface EventAssignment {
  eventIndex: number
  finger: PianoFinger
  hand: PianoHand
}

interface Candidate {
  assignments: EventAssignment[]
  group: OnsetGroup
  localCost: number
  signature: string
}

interface OccupiedFinger {
  endTick: number
  pitch: number
}

interface BeamNode {
  candidate: Candidate
  cost: number
  occupied: Record<string, OccupiedFinger>
  order: number
  previous: BeamNode | null
}

interface NormalizedPlannerOptions {
  beamWidth: number
  chordToleranceTicks: number
  splitPitch: number
  ticksPerQuarter: number
}

export function planPianoFingerings(
  project: ProjectData,
  options: FingeringPlannerOptions = {},
): FingeringPlan {
  const normalizedOptions = normalizeOptions(project, options)
  const groups = groupNotesByOnset(project, normalizedOptions.chordToleranceTicks)
  const issues: FingeringIssue[] = []
  let beam: BeamNode[] = []
  let order = 0

  for (const group of groups) {
    const candidates = buildCandidates(group, normalizedOptions, issues)
    const nextBeam: BeamNode[] = []
    const previousNodes: Array<BeamNode | null> = beam.length === 0 ? [null] : beam

    for (const previous of previousNodes) {
      for (const candidate of candidates) {
        const transition = evaluateTransition(previous, candidate, normalizedOptions)
        nextBeam.push({
          candidate,
          cost: (previous?.cost ?? 0) + candidate.localCost + transition.cost,
          occupied: transition.occupied,
          order: order++,
          previous,
        })
      }
    }

    nextBeam.sort((left, right) => left.cost - right.cost || left.order - right.order)
    beam = nextBeam.slice(0, normalizedOptions.beamWidth)
  }

  const selectedCandidates = backtrackCandidates(beam[0] ?? null)
  return {
    assignments: resolveNoteAssignments(groups, selectedCandidates),
    issues,
  }
}

export function applyFingeringPlan(project: ProjectData, plan: FingeringPlan): ProjectData {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => {
        const assignment = plan.assignments[note.id]
        if (assignment == null) return note
        return { ...note, fingering: { ...assignment } }
      }),
    })),
  }
}

function normalizeOptions(project: ProjectData, options: FingeringPlannerOptions): NormalizedPlannerOptions {
  const ticksPerQuarter = Math.max(1, Math.round(project.ticksPerQuarter))
  return {
    beamWidth: clampInteger(options.beamWidth ?? DEFAULT_BEAM_WIDTH, 4, 256),
    chordToleranceTicks: clampInteger(options.chordToleranceTicks ?? Math.round(ticksPerQuarter / 24), 0, ticksPerQuarter),
    splitPitch: clampInteger(options.splitPitch ?? DEFAULT_SPLIT_PITCH, 21, 108),
    ticksPerQuarter,
  }
}

function groupNotesByOnset(project: ProjectData, toleranceTicks: number): OnsetGroup[] {
  const notes = project.tracks
    .flatMap((track) => track.notes)
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id))
  const groups: OnsetGroup[] = []

  for (const note of notes) {
    let group = groups[groups.length - 1]
    if (group == null || note.startTick - group.startTick > toleranceTicks) {
      group = { events: [], startTick: note.startTick }
      groups.push(group)
    }
    const existing = group.events.find((event) => event.pitch === note.pitch)
    if (existing == null) group.events.push({ notes: [note], pitch: note.pitch })
    else existing.notes.push(note)
  }

  for (const group of groups) {
    group.events.sort((left, right) => left.pitch - right.pitch)
    for (const event of group.events) event.notes.sort((left, right) => left.id.localeCompare(right.id))
  }
  return groups
}

function buildCandidates(
  group: OnsetGroup,
  options: NormalizedPlannerOptions,
  issues: FingeringIssue[],
): Candidate[] {
  const events = describeEvents(group, issues)
  if (events.length > 10) {
    issues.push(createIssue('too-many-notes', group))
    return [createFallbackCandidate(group, events, options.splitPitch)]
  }

  const candidates: Candidate[] = []
  for (let splitIndex = 0; splitIndex <= events.length; splitIndex += 1) {
    const leftEvents = events.slice(0, splitIndex)
    const rightEvents = events.slice(splitIndex)
    if (leftEvents.length > 5 || rightEvents.length > 5) continue
    if (!eventsFitHand(leftEvents, 'left') || !eventsFitHand(rightEvents, 'right')) continue

    const leftFingerings = enumerateFingerings(leftEvents, 'left')
    const rightFingerings = enumerateFingerings(rightEvents, 'right')
    for (const left of leftFingerings) {
      for (const right of rightFingerings) {
        const assignments = [...left, ...right].sort((a, b) => a.eventIndex - b.eventIndex)
        candidates.push(createCandidate(group, assignments, options.splitPitch))
      }
    }
  }

  if (candidates.length === 0) {
    issues.push(createIssue('unplayable-group', group))
    return [createFallbackCandidate(group, events, options.splitPitch)]
  }
  candidates.sort((left, right) => left.localCost - right.localCost || left.signature.localeCompare(right.signature))
  return candidates.slice(0, 120)
}

function describeEvents(group: OnsetGroup, issues: FingeringIssue[]): DescribedEvent[] {
  return group.events.map((event, eventIndex) => {
    const manual = event.notes
      .map((note) => note.fingering)
      .filter((fingering): fingering is NoteFingering => fingering?.source === 'manual')
    const hands = new Set(manual.map(({ hand }) => hand))
    const fingers = new Set(manual.map(({ finger }) => finger))
    if (hands.size > 1 || fingers.size > 1) issues.push(createIssue('manual-conflict', {
      events: [event],
      startTick: group.startTick,
    }))
    return {
      ...event,
      constraint: {
        ...(hands.size === 1 ? { hand: [...hands][0] } : {}),
        ...(fingers.size === 1 ? { finger: [...fingers][0] } : {}),
      },
      eventIndex,
    }
  })
}

function enumerateFingerings(events: DescribedEvent[], hand: PianoHand): EventAssignment[][] {
  if (events.length === 0) return [[]]
  const combinations = chooseFingers(events.length)
  const results: EventAssignment[][] = []

  for (const combination of combinations) {
    const ordered = hand === 'right' ? combination : [...combination].reverse()
    const assignments = events.map((event, index) => ({
      eventIndex: event.eventIndex,
      finger: ordered[index],
      hand,
    }))
    if (assignments.every((assignment, index) => (
      events[index].constraint.finger == null || events[index].constraint.finger === assignment.finger
    ))) results.push(assignments)
  }
  return results
}

function chooseFingers(count: number): PianoFinger[][] {
  const results: PianoFinger[][] = []
  const visit = (nextFinger: number, chosen: PianoFinger[]) => {
    if (chosen.length === count) {
      results.push(chosen)
      return
    }
    for (let finger = nextFinger; finger <= 5; finger += 1) {
      visit(finger + 1, [...chosen, finger as PianoFinger])
    }
  }
  visit(1, [])
  return results
}

function createCandidate(group: OnsetGroup, assignments: EventAssignment[], splitPitch: number): Candidate {
  const localCost = scoreLocalAssignments(group, assignments, splitPitch)
  return {
    assignments,
    group,
    localCost,
    signature: assignments.map(({ hand, finger }) => `${hand[0]}${finger}`).join('-'),
  }
}

function scoreLocalAssignments(group: OnsetGroup, assignments: EventAssignment[], splitPitch: number): number {
  let cost = new Set(assignments.map(({ hand }) => hand)).size * 0.45
  for (const assignment of assignments) {
    const pitch = group.events[assignment.eventIndex].pitch
    const splitDistance = assignment.hand === 'left'
      ? pitch - splitPitch + 0.5
      : splitPitch - pitch
    if (splitDistance > 0) cost += splitDistance * 0.32
    if (isBlackKey(pitch) && assignment.finger === 1) cost += 0.35
    const initialFinger = preferredInitialFinger(pitch, assignment.hand, splitPitch)
    cost += Math.abs(assignment.finger - initialFinger) * 0.08
  }

  for (const hand of ['left', 'right'] as const) {
    const handAssignments = assignments.filter((assignment) => assignment.hand === hand)
    if (handAssignments.length < 2) continue
    const pitches = handAssignments.map(({ eventIndex }) => group.events[eventIndex].pitch)
    const span = Math.max(...pitches) - Math.min(...pitches)
    if (span > 12) cost += (span - 12) * 0.8
    cost += scoreChordShape(group, handAssignments)
  }
  return cost
}

function scoreChordShape(group: OnsetGroup, assignments: EventAssignment[]): number {
  let cost = 0
  for (let index = 1; index < assignments.length; index += 1) {
    const previous = assignments[index - 1]
    const current = assignments[index]
    const pitchDistance = Math.abs(group.events[current.eventIndex].pitch - group.events[previous.eventIndex].pitch)
    const fingerDistance = Math.abs(current.finger - previous.finger)
    const comfortableReach = (fingerDistance * 2.4) + 1
    if (pitchDistance > comfortableReach) cost += (pitchDistance - comfortableReach) * 0.28
  }
  return cost
}

function evaluateTransition(
  previous: BeamNode | null,
  candidate: Candidate,
  options: NormalizedPlannerOptions,
): { cost: number; occupied: Record<string, OccupiedFinger> } {
  const occupied = retainOccupied(previous?.occupied ?? {}, candidate.group.startTick)
  let cost = 0
  if (previous != null) cost += scoreMotion(previous.candidate, candidate, options)

  for (const assignment of candidate.assignments) {
    const event = candidate.group.events[assignment.eventIndex]
    const slot = `${assignment.hand}:${assignment.finger}`
    const prior = occupied[slot]
    if (prior != null && prior.pitch !== event.pitch) {
      const overlap = (prior.endTick - candidate.group.startTick) / options.ticksPerQuarter
      cost += Math.max(0, overlap) * 4
    }
    occupied[slot] = { endTick: Math.max(...event.notes.map((note) => note.endTick)), pitch: event.pitch }
  }
  return { cost, occupied }
}

function scoreMotion(previous: Candidate, current: Candidate, options: NormalizedPlannerOptions): number {
  const tickDistance = Math.max(1, current.group.startTick - previous.group.startTick)
  const urgency = Math.min(3, Math.max(0.35, options.ticksPerQuarter / tickDistance))
  let cost = 0

  for (const next of current.assignments) {
    const nextPitch = current.group.events[next.eventIndex].pitch
    const nearestAcrossHands = closestByPitch(previous.group, previous.assignments, nextPitch)
    if (nearestAcrossHands.hand !== next.hand) cost += 1.8 * urgency
  }

  for (const hand of ['left', 'right'] as const) {
    const before = previous.assignments.filter((assignment) => assignment.hand === hand)
    const after = current.assignments.filter((assignment) => assignment.hand === hand)
    if (before.length === 0 || after.length === 0) continue
    const beforeCenter = averagePitch(previous.group, before)
    const afterCenter = averagePitch(current.group, after)
    cost += Math.abs(afterCenter - beforeCenter) * 0.07 * urgency

    for (const next of after) {
      const nextPitch = current.group.events[next.eventIndex].pitch
      const repeated = before.find((assignment) => previous.group.events[assignment.eventIndex].pitch === nextPitch)
      if (repeated != null) cost += repeated.finger === next.finger ? -0.75 : 1.4 * urgency
      const nearest = closestByPitch(previous.group, before, nextPitch)
      cost += scoreFingerDirection(
        hand,
        current.group.events[next.eventIndex].pitch - previous.group.events[nearest.eventIndex].pitch,
        nearest.finger,
        next.finger,
      ) * urgency
    }
  }
  return cost
}

function scoreFingerDirection(
  hand: PianoHand,
  pitchDelta: number,
  previousFinger: PianoFinger,
  currentFinger: PianoFinger,
): number {
  const fingerDelta = currentFinger - previousFinger
  if (pitchDelta === 0) return Math.abs(fingerDelta) * 0.2
  const expectedDirection = hand === 'right' ? Math.sign(pitchDelta) : -Math.sign(pitchDelta)
  if (Math.sign(fingerDelta) === expectedDirection) return Math.abs(Math.abs(pitchDelta) - Math.abs(fingerDelta) * 2) * 0.08
  const isThumbTurn = hand === 'right'
    ? (pitchDelta > 0 && currentFinger === 1 && previousFinger >= 3)
      || (pitchDelta < 0 && previousFinger === 1 && currentFinger >= 3)
    : (pitchDelta > 0 && previousFinger === 1 && currentFinger >= 3)
      || (pitchDelta < 0 && currentFinger === 1 && previousFinger >= 3)
  return isThumbTurn && Math.abs(pitchDelta) >= 2 ? 0.9 : 3.5
}

function createFallbackCandidate(group: OnsetGroup, events: DescribedEvent[], splitPitch: number): Candidate {
  const assignments: EventAssignment[] = events.map((event, index) => {
    const hand = event.constraint.hand ?? (event.pitch < splitPitch ? 'left' : 'right')
    const sameHandEvents = events.filter((candidate) => (
      candidate.constraint.hand ?? (candidate.pitch < splitPitch ? 'left' : 'right')
    ) === hand)
    const handIndex = sameHandEvents.indexOf(event)
    const distributedFinger = Math.min(5, handIndex + 1) as PianoFinger
    return {
      eventIndex: index,
      finger: event.constraint.finger ?? (hand === 'right' ? distributedFinger : (6 - distributedFinger) as PianoFinger),
      hand,
    }
  })
  return createCandidate(group, assignments, splitPitch)
}

function resolveNoteAssignments(groups: OnsetGroup[], candidates: Candidate[]): Record<string, NoteFingering> {
  const assignments: Record<string, NoteFingering> = {}
  candidates.forEach((candidate, groupIndex) => {
    const group = groups[groupIndex]
    for (const assignment of candidate.assignments) {
      for (const note of group.events[assignment.eventIndex].notes) {
        assignments[note.id] = note.fingering?.source === 'manual'
          ? { ...note.fingering }
          : { hand: assignment.hand, finger: assignment.finger, source: 'generated' }
      }
    }
  })
  return assignments
}

function backtrackCandidates(node: BeamNode | null): Candidate[] {
  const candidates: Candidate[] = []
  for (let cursor = node; cursor != null; cursor = cursor.previous) candidates.push(cursor.candidate)
  return candidates.reverse()
}

function retainOccupied(
  occupied: Record<string, OccupiedFinger>,
  currentTick: number,
): Record<string, OccupiedFinger> {
  return Object.fromEntries(Object.entries(occupied).filter(([, value]) => value.endTick > currentTick))
}

function eventsFitHand(events: DescribedEvent[], hand: PianoHand): boolean {
  return events.every((event) => event.constraint.hand == null || event.constraint.hand === hand)
}

function preferredInitialFinger(pitch: number, hand: PianoHand, splitPitch: number): PianoFinger {
  const distance = hand === 'right' ? pitch - splitPitch : splitPitch - pitch
  return clampInteger(1 + Math.round(Math.max(0, distance) / 2), 1, 5) as PianoFinger
}

function averagePitch(group: OnsetGroup, assignments: EventAssignment[]): number {
  return assignments.reduce((sum, assignment) => sum + group.events[assignment.eventIndex].pitch, 0) / assignments.length
}

function closestByPitch(group: OnsetGroup, assignments: EventAssignment[], pitch: number): EventAssignment {
  return assignments.reduce((closest, assignment) => (
    Math.abs(group.events[assignment.eventIndex].pitch - pitch) < Math.abs(group.events[closest.eventIndex].pitch - pitch)
      ? assignment
      : closest
  ))
}

function createIssue(code: FingeringIssueCode, group: OnsetGroup): FingeringIssue {
  return {
    code,
    noteIds: group.events.flatMap((event) => event.notes.map((note) => note.id)).sort(),
    startTick: group.startTick,
  }
}

function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12)
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)))
}
