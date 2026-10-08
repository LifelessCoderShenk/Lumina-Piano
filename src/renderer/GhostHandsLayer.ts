import { Color, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three'

import type { FingerPose, GhostHandPose, GhostHandsPose, HandSpacePoint } from '../hands'
import type { PianoFinger, PianoHand } from '../midi/types'
import { getWhiteKeyWidth } from './pianoMath'

const FINGERS: readonly PianoFinger[] = [1, 2, 3, 4, 5]
const SEGMENTS_PER_FINGER = 3
const JOINTS_PER_FINGER = 4
const HAND_LIFT_PROJECTION = 0.25
const LEFT_HAND_COLOR = 0x70d7ff
const RIGHT_HAND_COLOR = 0xb99aff
const HAND_RENDER_Z = 14

export interface GhostHandsLayout {
  keyboardHeight: number
  keyboardY: number
  opacity: number
  viewportHeight: number
  viewportWidth: number
}

interface ScreenPoint {
  x: number
  y: number
}

interface RenderHandState {
  contactMaterial: ShaderMaterial
  contactNodes: Record<PianoFinger, Mesh<PlaneGeometry, ShaderMaterial>>
  group: Group
  jointNodes: Record<PianoFinger, Array<Mesh<PlaneGeometry, ShaderMaterial>>>
  material: ShaderMaterial
  palm: Mesh<PlaneGeometry, ShaderMaterial>
  segments: Record<PianoFinger, Array<Mesh<PlaneGeometry, ShaderMaterial>>>
  wrist: Mesh<PlaneGeometry, ShaderMaterial>
}

export class GhostHandsLayer {
  readonly group = new Group()

  private readonly hands: Record<PianoHand, RenderHandState>

  constructor(private readonly geometry: PlaneGeometry) {
    this.hands = {
      left: this.createHand('left'),
      right: this.createHand('right'),
    }
    this.group.add(this.hands.left.group, this.hands.right.group)
    this.group.visible = false
  }

  update(pose: GhostHandsPose, layout: GhostHandsLayout): void {
    const opacity = clamp(layout.opacity, 0.1, 0.8)
    this.group.visible = pose.left.visible || pose.right.visible
    this.updateHand(this.hands.left, pose.left, layout, opacity)
    this.updateHand(this.hands.right, pose.right, layout, opacity)
  }

  hide(): void {
    this.group.visible = false
    this.hands.left.group.visible = false
    this.hands.right.group.visible = false
  }

  dispose(): void {
    for (const hand of Object.values(this.hands)) {
      hand.material.dispose()
      hand.contactMaterial.dispose()
    }
  }

  private createHand(hand: PianoHand): RenderHandState {
    const material = createGhostMaterial(hand === 'left' ? LEFT_HAND_COLOR : RIGHT_HAND_COLOR)
    const contactMaterial = createGhostMaterial(0xffffff)
    const group = new Group()
    const palm = createPart(this.geometry, material, group)
    const wrist = createPart(this.geometry, material, group)
    const segments = {} as RenderHandState['segments']
    const jointNodes = {} as RenderHandState['jointNodes']
    const contactNodes = {} as RenderHandState['contactNodes']

    for (const finger of FINGERS) {
      segments[finger] = Array.from({ length: SEGMENTS_PER_FINGER }, () => (
        createPart(this.geometry, material, group)
      ))
      jointNodes[finger] = Array.from({ length: JOINTS_PER_FINGER }, () => (
        createPart(this.geometry, material, group)
      ))
      contactNodes[finger] = createPart(this.geometry, contactMaterial, group)
      contactNodes[finger].visible = false
    }

    group.visible = false
    return { contactMaterial, contactNodes, group, jointNodes, material, palm, segments, wrist }
  }

  private updateHand(
    renderHand: RenderHandState,
    pose: GhostHandPose,
    layout: GhostHandsLayout,
    opacity: number,
  ): void {
    renderHand.group.visible = pose.visible
    if (!pose.visible) return

    setMaterialOpacity(renderHand.material, opacity)
    setMaterialOpacity(renderHand.contactMaterial, Math.min(0.95, opacity + 0.28))
    const wrist = toScreenPoint(pose.wrist, layout)
    const roots = FINGERS.map((finger) => toScreenPoint(pose.fingers[finger].joints[0], layout))
    const averageRoot = averagePoint(roots)
    const whiteKeyWidth = getWhiteKeyWidth(layout.viewportWidth)
    const fingerThickness = getFingerThickness(layout)
    const palmWidth = Math.max(
      whiteKeyWidth * 4.3,
      Math.max(...roots.map(({ x }) => x))
        - Math.min(...roots.map(({ x }) => x))
        + fingerThickness * 1.8,
    )
    const palmLength = Math.max(whiteKeyWidth * 2.7, distance(wrist, averageRoot) + fingerThickness * 2)
    const palmCenter = containOval({
      x: (wrist.x + averageRoot.x) / 2,
      y: (wrist.y + averageRoot.y) / 2,
    }, palmWidth, palmLength, layout)
    setOval(
      renderHand.palm,
      palmCenter,
      palmWidth,
      palmLength,
      -pose.yaw,
      HAND_RENDER_Z,
    )
    setOval(
      renderHand.wrist,
      containOval(wrist, palmWidth * 0.58, whiteKeyWidth * 1.2, layout),
      palmWidth * 0.58,
      Math.max(fingerThickness * 2.2, whiteKeyWidth * 1.2),
      -pose.yaw,
      HAND_RENDER_Z + 0.01,
    )

    for (const finger of FINGERS) {
      this.updateFinger(renderHand, pose.fingers[finger], layout, fingerThickness)
    }
  }

  private updateFinger(
    hand: RenderHandState,
    fingerPose: FingerPose,
    layout: GhostHandsLayout,
    thickness: number,
  ): void {
    const joints = fingerPose.joints.map((point) => toScreenPoint(point, layout))
    for (let index = 0; index < SEGMENTS_PER_FINGER; index += 1) {
      setSegment(hand.segments[fingerPose.finger][index], joints[index], joints[index + 1], thickness, HAND_RENDER_Z + 0.02)
    }
    for (let index = 0; index < JOINTS_PER_FINGER; index += 1) {
      const jointScale = index === JOINTS_PER_FINGER - 1 ? 0.88 : 1
      setOval(
        hand.jointNodes[fingerPose.finger][index],
        joints[index],
        thickness * jointScale,
        thickness * jointScale,
        0,
        HAND_RENDER_Z + 0.03,
      )
    }

    const contact = hand.contactNodes[fingerPose.finger]
    contact.visible = fingerPose.pressed
    if (fingerPose.pressed) {
      const pulseSize = thickness * (1.15 + fingerPose.contactAmount * 0.32)
      setOval(contact, joints[JOINTS_PER_FINGER - 1], pulseSize, pulseSize, 0, HAND_RENDER_Z + 0.05)
    }
  }
}

function createGhostMaterial(color: number): ShaderMaterial {
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    uniforms: {
      ghostColor: { value: new Color(color) },
      ghostOpacity: { value: 0.35 },
    },
    vertexShader: `
varying vec2 vGhostUv;

void main() {
  vGhostUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec3 ghostColor;
uniform float ghostOpacity;
varying vec2 vGhostUv;

void main() {
  vec2 point = (vGhostUv - 0.5) * 2.0;
  float roundedShape = pow(abs(point.x), 4.0) + pow(abs(point.y), 4.0);
  float edge = 1.0 - smoothstep(0.76, 1.0, roundedShape);
  float centerGlow = 1.0 - 0.18 * length(point);
  gl_FragColor = vec4(ghostColor * centerGlow, ghostOpacity * edge);
}`,
  })
  material.toneMapped = false
  return material
}

function createPart(
  geometry: PlaneGeometry,
  material: ShaderMaterial,
  group: Group,
): Mesh<PlaneGeometry, ShaderMaterial> {
  const mesh = new Mesh(geometry, material)
  mesh.renderOrder = Math.round(HAND_RENDER_Z * 10)
  group.add(mesh)
  return mesh
}

function setMaterialOpacity(material: ShaderMaterial, opacity: number): void {
  material.uniforms.ghostOpacity.value = opacity
}

function toScreenPoint(point: HandSpacePoint, layout: GhostHandsLayout): ScreenPoint {
  const topDownY = layout.keyboardY + (
    point.depth - point.height * HAND_LIFT_PROJECTION
  ) * layout.keyboardHeight
  return {
    x: point.x * layout.viewportWidth,
    y: layout.viewportHeight - topDownY,
  }
}

function setSegment(
  mesh: Mesh<PlaneGeometry, ShaderMaterial>,
  from: ScreenPoint,
  to: ScreenPoint,
  thickness: number,
  z: number,
): void {
  const length = Math.max(thickness, distance(from, to) + thickness * 0.55)
  mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, z)
  mesh.rotation.z = Math.atan2(to.y - from.y, to.x - from.x)
  mesh.scale.set(length, thickness, 1)
  mesh.visible = true
}

function setOval(
  mesh: Mesh<PlaneGeometry, ShaderMaterial>,
  center: ScreenPoint,
  width: number,
  height: number,
  rotation: number,
  z: number,
): void {
  mesh.position.set(center.x, center.y, z)
  mesh.rotation.z = rotation
  mesh.scale.set(width, height, 1)
  mesh.visible = true
}

function getFingerThickness(layout: GhostHandsLayout): number {
  const whiteKeyWidth = getWhiteKeyWidth(layout.viewportWidth)
  return clamp(whiteKeyWidth * 0.5, 4, Math.max(4, whiteKeyWidth * 0.62))
}

function containOval(
  center: ScreenPoint,
  width: number,
  height: number,
  layout: GhostHandsLayout,
): ScreenPoint {
  return {
    x: clamp(center.x, width / 2, layout.viewportWidth - width / 2),
    y: clamp(center.y, height / 2, layout.viewportHeight - height / 2),
  }
}

function averagePoint(points: ScreenPoint[]): ScreenPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function distance(from: ScreenPoint, to: ScreenPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
