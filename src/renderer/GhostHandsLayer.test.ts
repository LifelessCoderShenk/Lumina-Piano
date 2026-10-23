import { SkinnedMesh, PlaneGeometry, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type {
  FingerPose,
  GhostHandPose,
  GhostHandsPose,
  HandSpacePoint,
} from '../hands'
import type { PianoFinger, PianoHand } from '../midi/types'
import { GhostHandsLayer, type GhostHandsLayout } from './GhostHandsLayer'

const LAYOUT: GhostHandsLayout = {
  keyboardHeight: 240,
  keyboardY: 360,
  opacity: 0.35,
  viewportHeight: 600,
  viewportWidth: 1200,
}

describe('GhostHandsLayer', () => {
  it('uses skinned 3D geometry with normalized weights and a shared depth prepass', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1))
    layer.update(createHandsPose(false), LAYOUT)
    for (const group of layer.group.children) {
      const [depth, mesh] = group.children as SkinnedMesh[]
      expect(depth.skeleton).toBe(mesh.skeleton)
      expect(depth.geometry).toBe(mesh.geometry)
      expect(depth.material.colorWrite).toBe(false)
      expect(depth.material.depthWrite).toBe(true)
      expect(mesh.material.depthTest).toBe(true)
      const weights = mesh.geometry.getAttribute('skinWeight')
      for (let i = 0; i < weights.count; i++)
        expect(
          weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i),
        ).toBeCloseTo(1)
      expect(mesh.skeleton.bones).toHaveLength(22)
    }
    layer.dispose()
  })
  it('places the skeleton tips exactly at the solved planner contacts', () => {
    const layer = new GhostHandsLayer(new PlaneGeometry(1, 1)),
      pose = createHandsPose(true)
    layer.update(pose, LAYOUT)
    const mesh = layer.group.children[1].children[1] as SkinnedMesh
    for (const finger of [1, 2, 3, 4, 5] as const) {
      const tip = mesh.skeleton.bones
        .find((b) => b.name === `finger-${finger}-3`)!
        .getWorldPosition(new Vector3())
      expect(tip.x / 8).toBeCloseTo(pose.right.fingers[finger].tip.x, 8)
      expect(-tip.y).toBeCloseTo(pose.right.fingers[finger].tip.depth, 8)
      expect(tip.z).toBeCloseTo(pose.right.fingers[finger].tip.height, 8)
    }
    layer.dispose()
  })
  it('clamps opacity, hides inactive hands and releases owned GPU resources', () => {
    const quad = new PlaneGeometry(1, 1),
      layer = new GhostHandsLayer(quad)
    const mesh = layer.group.children[1].children[1] as SkinnedMesh
    const dispose = vi.spyOn(mesh.geometry, 'dispose'),
      sharedDispose = vi.spyOn(quad, 'dispose')
    layer.update(createHandsPose(true), { ...LAYOUT, opacity: 2 })
    expect(layer.group.children[0].visible).toBe(false)
    expect(mesh.material.uniforms.ghostOpacity.value).toBe(0.8)
    layer.hide()
    expect(layer.group.visible).toBe(false)
    layer.dispose()
    expect(dispose).toHaveBeenCalledOnce()
    expect(sharedDispose).not.toHaveBeenCalled()
  })
})

function createHandsPose(hideLeft: boolean): GhostHandsPose {
  return {
    left: createHandPose('left', !hideLeft, false),
    right: createHandPose('right', true, true),
    tick: 240,
  }
}

function createHandPose(
  hand: PianoHand,
  visible: boolean,
  firstFingerPressed: boolean,
): GhostHandPose {
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
