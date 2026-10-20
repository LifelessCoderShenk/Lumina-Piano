import { Mesh, type Object3D, OrthographicCamera, PlaneGeometry, Vector3 } from 'three'
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
  it('draws one continuous translucent surface per hand inside the camera clipping planes', () => {
    const camera = new OrthographicCamera(0, 1200, 600, 0, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.updateMatrixWorld(true)
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    expect(layer.group.visible).toBe(false)
    layer.update(createHandsPose(false), LAYOUT)
    layer.group.updateMatrixWorld(true)
    let surfaces = 0
    layer.group.traverseVisible((part: Object3D) => {
      if (!(part instanceof Mesh)) return
      const projected = part.getWorldPosition(new Vector3()).project(camera)
      expect(projected.z).toBeGreaterThanOrEqual(-1)
      expect(projected.z).toBeLessThanOrEqual(1)
      expect(part.renderOrder).toBe(140)
      surfaces++
    })
    // No per-joint transparent planes that would accumulate alpha at overlaps.
    expect(surfaces).toBe(2)
    layer.dispose()
  })

  it('keeps every fingertip aligned and tapers the bones toward the tips', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    const pose = createHandsPose(true)
    layer.update(pose, LAYOUT)
    const right = layer.group.children[1] as Mesh
    const bones = right.material.uniforms.handBones.value as Float32Array
    const radii = right.material.uniforms.handRadii.value as Float32Array
    expect(right.visible).toBe(true)
    for (const finger of [1, 2, 3, 4, 5] as const) {
      const lastBone = (finger - 1) * 3 + 2
      expect(bones[lastBone * 4 + 2]).toBeCloseTo(pose.right.fingers[finger].tip.x * LAYOUT.viewportWidth, 3)
      expect(bones[lastBone * 4 + 3]).toBeCloseTo(LAYOUT.viewportHeight - LAYOUT.keyboardY - (pose.right.fingers[finger].tip.depth - pose.right.fingers[finger].tip.height * 0.25) * LAYOUT.keyboardHeight, 3)
      expect(radii[lastBone * 2 + 1]).toBeLessThan(radii[(finger - 1) * 6])
    }
    expect(right.material.uniforms.ghostOpacity.value).toBeCloseTo(0.35)
    layer.dispose()
  })

  it('clamps opacity, hides inactive hands, and disposes both surfaces', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    const left = layer.group.children[0] as Mesh
    const right = layer.group.children[1] as Mesh
    const leftDispose = vi.spyOn(left.material, 'dispose')
    const rightDispose = vi.spyOn(right.material, 'dispose')
    layer.update(createHandsPose(true), { ...LAYOUT, opacity: 2 })
    expect(left.visible).toBe(false)
    expect(right.material.uniforms.ghostOpacity.value).toBe(0.8)
    layer.hide()
    expect(layer.group.visible).toBe(false)
    expect(right.visible).toBe(false)
    layer.dispose()
    expect(leftDispose).toHaveBeenCalledOnce()
    expect(rightDispose).toHaveBeenCalledOnce()
  })
})

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
