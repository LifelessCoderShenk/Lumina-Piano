import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { SkinnedMesh, PlaneGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { buildHandMotionTimeline, sampleHandMotionTimeline } from '../hands'
import type { PianoHand } from '../midi/types'
import { parseMidi } from '../midi/parser'
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
  const group = layer.group.children[hand === 'left' ? 0 : 1]
  const mesh = group.children[1] as SkinnedMesh
  expect(group.visible).toBe(pose.visible)
  if (!pose.visible) return
  for (const finger of [1, 2, 3, 4, 5] as const) {
    const tip = mesh.skeleton.bones.find(b => b.name === `finger-${finger}-3`)!.getWorldPosition(new Vector3())
    expect([tip.x, tip.y, tip.z].every(Number.isFinite)).toBe(true)
    expect(tip.x / 8 * currentLayout.viewportWidth).toBeCloseTo(pose.fingers[finger].tip.x * currentLayout.viewportWidth, 3)
    expect(-tip.y).toBeCloseTo(pose.fingers[finger].tip.depth, 6)
    expect(tip.z).toBeCloseTo(pose.fingers[finger].tip.height, 6)
  }
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
