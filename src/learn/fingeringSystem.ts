import type { Note } from '../midi/types'

type LearnHand = 'left' | 'right' | 'both'
type SingleHand = Exclude<LearnHand, 'both'>

const MIDDLE_C_PITCH = 60
const PHRASE_GAP_TICKS = 480
const MIN_FINGER = 1
const MAX_FINGER = 5
const STEP_INTERVAL_SEMITONES = 2
const LEAP_INTERVAL_SEMITONES = 7

export function assignFingerNumbers(
  notes: Note[],
  hand: LearnHand,
): Record<string, number> {
  if (notes.length === 0) {
    return {}
  }

  if (hand === 'both') {
    return {
      ...assignFingerNumbers(notes, 'left'),
      ...assignFingerNumbers(notes, 'right'),
    }
  }

  const handNotes = notes
    .filter((note) => isNoteForHand(note, hand))
    .slice()
    .sort(compareNotes)

  if (handNotes.length === 0) {
    return {}
  }

  const fingerNumbers: Record<string, number> = {}

  for (const phrase of splitIntoPhrases(handNotes)) {
    Object.assign(fingerNumbers, assignPhraseFingerNumbers(phrase, hand))
  }

  return fingerNumbers
}

function isNoteForHand(note: Note, hand: SingleHand): boolean {
  return hand === 'left' ? note.pitch < MIDDLE_C_PITCH : note.pitch >= MIDDLE_C_PITCH
}

function splitIntoPhrases(notes: Note[]): Note[][] {
  const phrases: Note[][] = []
  let currentPhrase: Note[] = []

  for (const note of notes) {
    const previous = currentPhrase[currentPhrase.length - 1]

    if (previous != null && note.startTick - previous.startTick > PHRASE_GAP_TICKS) {
      phrases.push(currentPhrase)
      currentPhrase = []
    }

    currentPhrase.push(note)
  }

  if (currentPhrase.length > 0) {
    phrases.push(currentPhrase)
  }

  return phrases
}

function assignPhraseFingerNumbers(
  phrase: Note[],
  hand: SingleHand,
): Record<string, number> {
  if (phrase.length === 1) {
    return {
      [phrase[0].id]: MIN_FINGER,
    }
  }

  const fingerNumbers: Record<string, number> = {}
  const minPitch = Math.min(...phrase.map((note) => note.pitch))
  const maxPitch = Math.max(...phrase.map((note) => note.pitch))
  const chordGroups = groupChordNotes(phrase)

  for (const chordGroup of chordGroups) {
    if (chordGroup.length === 1) {
      const note = chordGroup[0]
      fingerNumbers[note.id] = mapPitchToFinger(note.pitch, minPitch, maxPitch, hand)
      continue
    }

    chordGroup.forEach((note, index) => {
      const sequentialFinger = hand === 'right'
        ? MIN_FINGER + index
        : chordGroup.length - index

      fingerNumbers[note.id] = clampFinger(sequentialFinger)
    })
  }

  refineIntervals(phrase, fingerNumbers, hand)

  for (const note of phrase) {
    fingerNumbers[note.id] = clampFinger(fingerNumbers[note.id] ?? MIN_FINGER)
  }

  return fingerNumbers
}

function groupChordNotes(phrase: Note[]): Note[][] {
  const groups: Note[][] = []
  let currentGroup: Note[] = []
  let currentStartTick: number | null = null

  for (const note of phrase) {
    if (currentStartTick !== null && note.startTick !== currentStartTick) {
      groups.push(currentGroup)
      currentGroup = []
    }

    currentGroup.push(note)
    currentStartTick = note.startTick
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups.map((group) => group.slice().sort((left, right) => left.pitch - right.pitch))
}

function mapPitchToFinger(
  pitch: number,
  minPitch: number,
  maxPitch: number,
  hand: SingleHand,
): number {
  if (maxPitch <= minPitch) {
    return MIN_FINGER
  }

  const normalized = (pitch - minPitch) / (maxPitch - minPitch)
  const mappedFinger = hand === 'right'
    ? MIN_FINGER + (normalized * (MAX_FINGER - MIN_FINGER))
    : MAX_FINGER - (normalized * (MAX_FINGER - MIN_FINGER))

  return clampFinger(Math.round(mappedFinger))
}

function refineIntervals(
  phrase: Note[],
  fingerNumbers: Record<string, number>,
  hand: SingleHand,
): void {
  for (let index = 1; index < phrase.length; index += 1) {
    const previous = phrase[index - 1]
    const current = phrase[index]

    if (current.startTick === previous.startTick) {
      continue
    }

    if (current.pitch === previous.pitch) {
      fingerNumbers[current.id] = fingerNumbers[previous.id] ?? MIN_FINGER
      continue
    }

    const interval = Math.abs(current.pitch - previous.pitch)

    if (interval >= LEAP_INTERVAL_SEMITONES) {
      fingerNumbers[current.id] = MIN_FINGER
      continue
    }

    if (interval <= STEP_INTERVAL_SEMITONES) {
      const previousFinger = fingerNumbers[previous.id] ?? MIN_FINGER
      fingerNumbers[current.id] = clampFinger(previousFinger + getStepDirection(previous, current, hand))
    }
  }
}

function getStepDirection(previous: Note, current: Note, hand: SingleHand): number {
  const isAscending = current.pitch > previous.pitch

  if (hand === 'right') {
    return isAscending ? 1 : -1
  }

  return isAscending ? -1 : 1
}

function clampFinger(value: number): number {
  return Math.min(MAX_FINGER, Math.max(MIN_FINGER, Math.round(value)))
}

function compareNotes(left: Note, right: Note): number {
  if (left.startTick !== right.startTick) {
    return left.startTick - right.startTick
  }

  if (left.pitch !== right.pitch) {
    return left.pitch - right.pitch
  }

  if (left.endTick !== right.endTick) {
    return left.endTick - right.endTick
  }

  return left.id.localeCompare(right.id)
}
