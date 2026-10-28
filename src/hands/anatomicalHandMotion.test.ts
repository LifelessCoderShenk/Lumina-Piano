// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Color, Group } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createHandMotion } from './anatomicalHandMotion.mjs'
import { getBlackKeyWidth, getWhiteKeyWidth, isBlackKey, pitchToKeyX } from '../renderer/pianoMath'

it('releases a reused finger exactly at note-off and stays deterministic when scrubbing', async () => {
  const bytes = readFileSync('src/assets/hands/right.glb')
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const width = 52 * .0235
  const keys = new Map(Array.from({ length: 88 }, (_, index) => {
    const pitch = index + 21, black = isBlackKey(pitch)
    return [pitch, {
      x: pitchToKeyX(pitch, width) + (black ? getBlackKeyWidth(width) : getWhiteKeyWidth(width)) / 2 - width / 2,
      black, mesh: { material: { color: new Color() } },
    }] as const
  }))
  const motion = createHandMotion(asset.scene, new Group(), keys, { sequences: { passage: [
    { pitch: 60, finger: 1, start: 0, end: .5 },
    { pitch: 62, finger: 1, start: .5, end: 1 },
  ] } })
  const boundary = motion.sample(.5, 'passage')
  expect(boundary.held).toBe(1)
  expect(boundary.worst).toBeLessThan(.003)
  motion.sample(.9, 'passage')
  const repeated = motion.sample(.5, 'passage')
  expect(repeated.wristPosition.toArray()).toEqual(boundary.wristPosition.toArray())
  expect(repeated.tips.map(tip => tip.toArray())).toEqual(boundary.tips.map(tip => tip.toArray()))
  expect(motion.sample(1, 'passage').held).toBe(0)
})
