import { PlaneGeometry } from 'three'
import { describe, expect, it, vi } from 'vitest'

import type { FingerPose, GhostHandPose, GhostHandsPose, HandSpacePoint } from '../hands'
import type { PianoFinger, PianoHand } from '../midi/types'
import { GhostHandsLayer, type GhostHandsLayout } from './GhostHandsLayer'

const LAYOUT: GhostHandsLayout = {
  keyboardHeight: 240,
  keyboardY: 360,
  opacity: 0.35,
  viewportHeight: 600,
  viewportWidth: 1_200,
}

describe('GhostHandsLayer', () => {
  it('builds two complete five-finger hand rigs and hides them initially', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    const hands = getHands(layer)

    expect(layer.group.visible).toBe(false)
    expect(Object.keys(hands.left.segments)).toHaveLength(5)
    expect(Object.values(hands.left.segments).every((segments) => segments.length === 3)).toBe(true)
    expect(Object.values(hands.right.jointNodes).every((joints) => joints.length === 4)).toBe(true)
  })

  it('places articulated geometry from the sampled pose and emphasizes pressed fingertips', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    const pose = createHandsPose(true)
    layer.update(pose, LAYOUT)
    const right = getHands(layer).right
    const firstSegment = right.segments[1][0]
    const tipContact = right.contactNodes[1]

    expect(layer.group.visible).toBe(true)
    expect(right.group.visible).toBe(true)
    expect(firstSegment.scale.x).toBeGreaterThan(firstSegment.scale.y)
    expect(Number.isFinite(firstSegment.position.x)).toBe(true)
    expect(Number.isFinite(firstSegment.position.y)).toBe(true)
    expect(tipContact.visible).toBe(true)
    expect(right.contactNodes[2].visible).toBe(false)
    expect(right.material.uniforms.ghostOpacity.value).toBeCloseTo(0.35)
    expect(right.contactMaterial.uniforms.ghostOpacity.value).toBeCloseTo(0.63)
  })

  it('clamps opacity, hides inactive hands, and disposes its materials', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    const hands = getHands(layer)
    const leftDispose = vi.spyOn(hands.left.material, 'dispose')
    const rightDispose = vi.spyOn(hands.right.contactMaterial, 'dispose')

    layer.update(createHandsPose(true), { ...LAYOUT, opacity: 2 })
    expect(hands.left.group.visible).toBe(false)
    expect(hands.right.material.uniforms.ghostOpacity.value).toBe(0.8)

    layer.hide()
    expect(layer.group.visible).toBe(false)
    layer.dispose()
    expect(leftDispose).toHaveBeenCalledOnce()
    expect(rightDispose).toHaveBeenCalledOnce()
  })
})

function getHands(layer: GhostHandsLayer) {
  return (layer as unknown as {
    hands: Record<PianoHand, {
      contactMaterial: { dispose(): void; uniforms: Record<string, { value: number }> }
      contactNodes: Record<PianoFinger, { visible: boolean }>
      group: { visible: boolean }
      jointNodes: Record<PianoFinger, unknown[]>
      material: { dispose(): void; uniforms: Record<string, { value: number }> }
      segments: Record<PianoFinger, Array<{
        position: { x: number; y: number }
        scale: { x: number; y: number }
      }>>
    }>
  }).hands
}

function createHandsPose(hideLeft: boolean): GhostHandsPose {
  return {
    left: createHandPose('left', !hideLeft, false),
    right: createHandPose('right', true, true),
    tick: 240,
  }
}

function createHandPose(hand: PianoHand, visible: boolean, firstFingerPressed: boolean): GhostHandPose {
  const fingers = {} as Record<PianoFinger, FingerPose>
  for (const finger of [1, 2, 3, 4, 5] as const) {
    const rootX = (hand === 'left' ? 0.4 : 0.6) + (finger - 3) * 0.015
    fingers[finger] = {
      contactAmount: finger === 1 && firstFingerPressed ? 1 : 0,
      finger,
      joints: [
        point(rootX, 0.82, 0.18),
        point(rootX + 0.002, 0.74, 0.13),
        point(rootX + 0.003, 0.67, 0.08),
        point(rootX + 0.004, 0.62, 0.01),
      ],
      pressed: finger === 1 && firstFingerPressed,
      targetPitch: finger === 1 ? 60 : null,
      tip: point(rootX + 0.004, 0.62, 0.01),
    }
  }
  return {
    fingers,
    hand,
    visible,
    wrist: point(hand === 'left' ? 0.4 : 0.6, 0.9, 0.2),
    yaw: hand === 'left' ? -0.08 : 0.08,
  }
}

function point(x: number, depth: number, height: number): HandSpacePoint {
  return { depth, height, x }
}
