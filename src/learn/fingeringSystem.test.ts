import { describe, expect, it } from 'vitest'

import type { Note } from '../midi/types'
import { assignFingerNumbers } from './fingeringSystem'

describe('assignFingerNumbers', () => {
  it('assigns 1 through 5 to a right-hand ascending scale', () => {
    const notes = [
      createNote('n1', 60, 0),
      createNote('n2', 62, 120),
      createNote('n3', 64, 240),
      createNote('n4', 65, 360),
      createNote('n5', 67, 480),
    ]

    expect(assignFingerNumbers(notes, 'right')).toEqual({
      n1: 1,
      n2: 2,
      n3: 3,
      n4: 4,
      n5: 5,
    })
  })

  it('assigns 1 through 5 to a left-hand descending scale', () => {
    const notes = [
      createNote('n1', 59, 0),
      createNote('n2', 57, 120),
      createNote('n3', 55, 240),
      createNote('n4', 53, 360),
      createNote('n5', 52, 480),
    ]

    expect(assignFingerNumbers(notes, 'left')).toEqual({
      n1: 1,
      n2: 2,
      n3: 3,
      n4: 4,
      n5: 5,
    })
  })

  it('assigns chord notes sequentially by pitch', () => {
    const rightChord = [
      createNote('c1', 60, 0),
      createNote('c2', 64, 0),
      createNote('c3', 67, 0),
    ]
    const leftChord = [
      createNote('l1', 48, 0),
      createNote('l2', 52, 0),
      createNote('l3', 55, 0),
    ]

    expect(assignFingerNumbers(rightChord, 'right')).toEqual({
      c1: 1,
      c2: 2,
      c3: 3,
    })
    expect(assignFingerNumbers(leftChord, 'left')).toEqual({
      l1: 3,
      l2: 2,
      l3: 1,
    })
  })

  it('splits phrases when the gap exceeds 480 ticks', () => {
    const notes = [
      createNote('p1', 60, 0),
      createNote('p2', 65, 120),
      createNote('p3', 72, 700),
    ]

    expect(assignFingerNumbers(notes, 'right')).toEqual({
      p1: 1,
      p2: 5,
      p3: 1,
    })
  })

  it('uses a thumb pivot after leaps of 7 semitones or more', () => {
    const notes = [
      createNote('l1', 60, 0),
      createNote('l2', 72, 120),
    ]

    expect(assignFingerNumbers(notes, 'right')).toEqual({
      l1: 1,
      l2: 1,
    })
  })

  it('returns thumb for a single-note phrase', () => {
    expect(assignFingerNumbers([createNote('single', 64, 0)], 'right')).toEqual({
      single: 1,
    })
  })

  it('returns an empty object for empty input', () => {
    expect(assignFingerNumbers([], 'both')).toEqual({})
  })

  it('processes and merges both hands independently', () => {
    const notes = [
      createNote('left-1', 48, 0),
      createNote('left-2', 52, 120),
      createNote('right-1', 60, 0),
      createNote('right-2', 64, 120),
    ]

    expect(assignFingerNumbers(notes, 'both')).toEqual({
      'left-1': 5,
      'left-2': 1,
      'right-1': 1,
      'right-2': 5,
    })
  })

  it('clamps all output values to the 1 through 5 range', () => {
    const notes = [
      createNote('c1', 60, 0),
      createNote('c2', 62, 0),
      createNote('c3', 64, 0),
      createNote('c4', 65, 0),
      createNote('c5', 67, 0),
      createNote('c6', 69, 0),
      createNote('repeat', 69, 120),
    ]

    const assigned = assignFingerNumbers(notes, 'right')

    expect(Object.values(assigned).every((finger) => finger >= 1 && finger <= 5)).toBe(true)
    expect(assigned.repeat).toBe(assigned.c6)
  })
})

function createNote(id: string, pitch: number, startTick: number): Note {
  return {
    endTick: startTick + 120,
    id,
    pitch,
    startTick,
    velocity: 100,
    visualEndTick: startTick + 120,
  }
}
