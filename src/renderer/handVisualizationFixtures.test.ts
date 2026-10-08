import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Mesh, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'

import { buildHandMotionTimeline, sampleHandMotionTimeline } from '../hands'
import type { PianoFinger, PianoHand } from '../midi/types'
import { parseMidi } from '../midi/parser'
import { getWhiteKeyWidth } from './pianoMath'
import { GhostHandsLayer, type GhostHandsLayout } from './GhostHandsLayer'

const PIECES = [
  ['Moonlight Sonata', 'test-midis/moonlight.mid'],
  ['Pirates', 'public/sample-pieces/Pirates of the Caribbean.mid'],
  ['Revolutionary Etude', 'public/sample-pieces/Etude-in-C-Minor-Opus-10-Nr-12.mid'],
] as const

const LAYOUTS: Array<[string, GhostHandsLayout]> = [
  ['landscape', layout(1_920, 1_080, 405)],
  ['portrait', layout(1_080, 1_920, 720)],
  ['square', layout(1_080, 1_080, 405)],
  ['compact', layout(360, 640, 240)],
]

describe.each(PIECES)('ghost-hand fixture: %s', (_name, relativePath) => {
  it('keeps the complete rig aligned and proportionate across output shapes', () => {
    const project = parseMidi(Uint8Array.from(readFileSync(resolve(process.cwd(), relativePath))))
    const timeline = buildHandMotionTimeline(project)
    const plannedNoteIds = new Set(
      Object.values(timeline.hands).flatMap(({ fingerEvents }) => (
        Object.values(fingerEvents).flatMap((events) => events.flatMap(({ noteIds }) => noteIds))
      )),
    )
    expect(plannedNoteIds.size).toBe(project.tracks.reduce((sum, { notes }) => sum + notes.length, 0))
    const noteTicks = project.tracks.flatMap(({ notes }) => notes.map(({ startTick }) => startTick))
      .sort((left, right) => left - right)
    const sampledTicks = evenlySample(noteTicks, 8)
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))

    for (const [_layoutName, currentLayout] of LAYOUTS) {
      for (const tick of sampledTicks) {
        const pose = sampleHandMotionTimeline(timeline, tick)
        layer.update(pose, currentLayout)
        assertHand(layer, 'left', pose.left, currentLayout)
        assertHand(layer, 'right', pose.right, currentLayout)
      }
    }

    layer.dispose()
  }, 20_000)
})

function assertHand(
  layer: GhostHandsLayer,
  hand: PianoHand,
  pose: ReturnType<typeof sampleHandMotionTimeline>[PianoHand],
  currentLayout: GhostHandsLayout,
): void {
  const rendered = getHands(layer)[hand]
  expect(rendered.group.visible).toBe(pose.visible)
  if (!pose.visible) return

  const whiteKeyWidth = getWhiteKeyWidth(currentLayout.viewportWidth)
  const expectedThickness = Math.max(4, whiteKeyWidth * 0.5)
  expect(rendered.segments[1][0].scale.y).toBeCloseTo(expectedThickness, 4)
  expect(rendered.palm.scale.x / whiteKeyWidth).toBeGreaterThanOrEqual(4.29)
  expect(rendered.palm.position.x - rendered.palm.scale.x / 2).toBeGreaterThanOrEqual(0)
  expect(rendered.palm.position.x + rendered.palm.scale.x / 2).toBeLessThanOrEqual(currentLayout.viewportWidth)
  expect(rendered.palm.position.y - rendered.palm.scale.y / 2).toBeGreaterThanOrEqual(0)
  expect(rendered.palm.position.y + rendered.palm.scale.y / 2).toBeLessThanOrEqual(currentLayout.viewportHeight)

  for (const mesh of rendered.group.children.filter((child): child is Mesh => (
    child instanceof Mesh && child.visible
  ))) {
    expect([mesh.position.x, mesh.position.y, mesh.position.z, mesh.scale.x, mesh.scale.y].every(Number.isFinite)).toBe(true)
    expect(mesh.scale.x).toBeGreaterThan(0)
    expect(mesh.scale.y).toBeGreaterThan(0)
    expect(mesh.position.x).toBeGreaterThanOrEqual(0)
    expect(mesh.position.x).toBeLessThanOrEqual(currentLayout.viewportWidth)
    expect(mesh.position.y).toBeGreaterThanOrEqual(0)
    expect(mesh.position.y).toBeLessThanOrEqual(currentLayout.viewportHeight)
  }

  for (const finger of [1, 2, 3, 4, 5] as const) {
    const contact = rendered.contactNodes[finger]
    expect(contact.visible).toBe(pose.fingers[finger].pressed)
    if (contact.visible) {
      expect(contact.position.x).toBeCloseTo(pose.fingers[finger].tip.x * currentLayout.viewportWidth, 4)
    }
  }
}

function getHands(layer: GhostHandsLayer) {
  return (layer as unknown as {
    hands: Record<PianoHand, {
      contactNodes: Record<PianoFinger, Mesh>
      group: { children: unknown[]; visible: boolean }
      palm: Mesh
      segments: Record<PianoFinger, Mesh[]>
    }>
  }).hands
}

function evenlySample(values: number[], count: number): number[] {
  if (values.length <= count) return [...new Set(values)]
  return [...new Set(Array.from({ length: count }, (_, index) => (
    values[Math.round((values.length - 1) * index / (count - 1))]
  )))]
}

function layout(viewportWidth: number, viewportHeight: number, keyboardHeight: number): GhostHandsLayout {
  return {
    keyboardHeight,
    keyboardY: viewportHeight - keyboardHeight,
    opacity: 0.35,
    viewportHeight,
    viewportWidth,
  }
}
