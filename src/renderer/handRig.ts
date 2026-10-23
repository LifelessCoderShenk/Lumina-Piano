import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Skeleton,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import type { PianoFinger, PianoHand } from '../midi/types'

/** Original procedural bind mesh. Units match the motion planner: keyboard width / 8. */
export function createHandRig(hand: PianoHand) {
  const sign = hand === 'right' ? 1 : -1
  const wrist = new Bone()
  wrist.name = 'wrist'
  const forearm = new Bone()
  forearm.name = 'forearm'
  wrist.add(forearm)
  const bones = [wrist, forearm]
  const fingers = {} as Record<PianoFinger, Bone[]>
  const positions: number[] = [],
    indices: number[] = [],
    weights: number[] = [],
    skinIndices: number[] = []
  const colors: number[] = []
  const sides = 16
  // Smooth elliptical cross-sections, with shared vertices along each surface.
  function tube(
    rings: Array<{
      x: number
      y: number
      z: number
      rx: number
      rz: number
      a: number
      b?: number
      blend?: number
    }>,
    nail = false,
  ) {
    const start = positions.length / 3
    rings.forEach((ring, row) => {
      for (let side = 0; side <= sides; side++) {
        const angle = (side / sides) * Math.PI * 2
        positions.push(
          ring.x + Math.cos(angle) * ring.rx,
          ring.y,
          ring.z + Math.sin(angle) * ring.rz,
        )
        skinIndices.push(ring.a, ring.b ?? ring.a, 0, 0)
        weights.push(1 - (ring.blend ?? 0), ring.blend ?? 0, 0, 0)
        const isNail =
          nail &&
          row >= rings.length - 5 &&
          row < rings.length - 2 &&
          Math.sin(angle) > 0.75
        colors.push(...(isNail ? [0.84, 0.72, 0.67] : [0.64, 0.45, 0.34]))
        if (row && side) {
          const d = start + row * (sides + 1) + side,
            c = d - 1,
            b = d - sides - 1,
            a = b - 1
          indices.push(a, c, b, b, c, d)
        }
      }
    })
  }
  tube([
    { x: 0, y: -0.66, z: -0.015, rx: 0.13, rz: 0.065, a: 1 },
    { x: 0, y: -0.45, z: -0.008, rx: 0.125, rz: 0.064, a: 1 },
    { x: 0, y: -0.18, z: 0, rx: 0.112, rz: 0.055, a: 1, b: 0, blend: 0.4 },
    { x: 0, y: 0, z: 0, rx: 0.115, rz: 0.052, a: 0 },
    { x: 0, y: 0.1, z: 0, rx: 0.168, rz: 0.062, a: 0 },
    { x: 0, y: 0.21, z: -0.008, rx: 0.2, rz: 0.06, a: 0 },
    { x: 0, y: 0.28, z: -0.018, rx: 0.17, rz: 0.044, a: 0 },
    { x: 0, y: 0.3, z: -0.02, rx: 0.01, rz: 0.008, a: 0 },
  ])
  for (const finger of [1, 2, 3, 4, 5] as const) {
    const length = { 1: 0.44, 2: 0.46, 3: 0.48, 4: 0.46, 5: 0.39 }[finger]
    const root = new Vector3(
      { 1: -0.028, 2: -0.013, 3: 0, 4: 0.013, 5: 0.027 }[finger] *
        8 *
        sign *
        (finger === 1 ? 0.92 : 0.9),
      { 1: 0.12, 2: 0.24, 3: 0.27, 4: 0.25, 5: 0.19 }[finger],
      finger === 1 ? -0.035 : -0.02,
    )
    const lengths = [length * 0.45, length * 0.32, length * 0.23]
    const chain: Bone[] = []
    const first = bones.length
    for (let i = 0; i < 4; i++) {
      const bone = new Bone()
      bone.name = `finger-${finger}-${i}`
      if (i === 0) {
        bone.position.copy(root)
        wrist.add(bone)
      } else {
        bone.position.set(0, lengths[i - 1], 0)
        chain[i - 1].add(bone)
      }
      bones.push(bone)
      chain.push(bone)
    }
    fingers[finger] = chain
    const radius = finger === 1 ? 0.04 : finger === 5 ? 0.029 : 0.034
    const rings = []
    for (let row = 0; row <= 24; row++) {
      const t = row / 24,
        distance = t * length
      const segment = t < 0.45 ? 0 : t < 0.77 ? 1 : 2
      // Both sides of a knuckle use the same pair of bones. Switching abruptly
      // to the next bone at the joint produces a visible crease or skin tear.
      let a = first + segment,
        b = a,
        blend = 0
      for (const [joint, boundary] of [0.45, 0.77].entries()) {
        if (Math.abs(t - boundary) <= 0.065) {
          a = first + joint
          b = a + 1
          blend = (t - boundary + 0.065) / 0.13
        }
      }
      const cap =
        t > 0.9 ? Math.sqrt(Math.max(0.001, 1 - ((t - 0.9) / 0.1) ** 2)) : 1
      rings.push({
        x: root.x,
        y: root.y + distance,
        z: root.z,
        rx: radius * (1 - t * 0.25) * cap,
        rz: radius * 0.85 * (1 - t * 0.25) * cap,
        a,
        b,
        blend,
      })
    }
    tube(rings, true)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  wrist.updateMatrixWorld(true)
  const skeleton = new Skeleton(bones)
  return { geometry, skeleton, wrist, forearm, fingers }
}
