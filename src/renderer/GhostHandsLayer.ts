import { Color, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three'

import type { GhostHandPose, GhostHandsPose, HandSpacePoint } from '../hands'
import type { PianoFinger, PianoHand } from '../midi/types'
import { getWhiteKeyWidth } from './pianoMath'

const FINGERS: readonly PianoFinger[] = [1, 2, 3, 4, 5]
const HAND_RENDER_Z = 7 // In front of the keyboard, inside the camera at z=10.
const BONE_COUNT = 16 // Fifteen finger bones and one wrist.

export interface GhostHandsLayout {
  keyboardHeight: number
  keyboardY: number
  opacity: number
  viewportHeight: number
  viewportWidth: number
}

interface ScreenPoint { x: number; y: number }

interface RenderHandState {
  mesh: Mesh<PlaneGeometry, ShaderMaterial>
  material: ShaderMaterial
  bones: Float32Array
  radii: Float32Array
  nails: Float32Array
}

/** One continuous surface per hand: overlapping fingers do not accumulate alpha. */
export class GhostHandsLayer {
  readonly group = new Group()
  private readonly hands: Record<PianoHand, RenderHandState>

  constructor(geometry: PlaneGeometry) {
    this.hands = { left: createHand(geometry), right: createHand(geometry) }
    this.group.add(this.hands.left.mesh, this.hands.right.mesh)
    this.group.visible = false
  }

  update(pose: GhostHandsPose, layout: GhostHandsLayout): void {
    this.group.visible = pose.left.visible || pose.right.visible
    for (const hand of ['left', 'right'] as const) updateHand(this.hands[hand], pose[hand], layout)
  }

  hide(): void {
    this.group.visible = false
    this.hands.left.mesh.visible = false
    this.hands.right.mesh.visible = false
  }

  dispose(): void {
    this.hands.left.material.dispose()
    this.hands.right.material.dispose()
  }
}

function createHand(geometry: PlaneGeometry): RenderHandState {
  const bones = new Float32Array(BONE_COUNT * 4)
  const radii = new Float32Array(BONE_COUNT * 2)
  const nails = new Float32Array(5 * 4)
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    uniforms: {
      ghostColor: { value: new Color(0xd1b6a2) },
      ghostOpacity: { value: 0.35 },
      handOrigin: { value: new Float32Array(2) },
      handSize: { value: new Float32Array(2) },
      handPalm: { value: new Float32Array(4) },
      handYaw: { value: 0 },
      handBones: { value: bones },
      handRadii: { value: radii },
      handNails: { value: nails },
      handKeyWidth: { value: 20 },
    },
    vertexShader: `
varying vec2 vHandUv;
void main() {
  vHandUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec3 ghostColor;
uniform float ghostOpacity;
uniform vec2 handOrigin;
uniform vec2 handSize;
uniform vec4 handPalm;
uniform float handYaw;
uniform vec4 handBones[16];
uniform vec2 handRadii[16];
uniform vec4 handNails[5];
uniform float handKeyWidth;
varying vec2 vHandUv;

float smoothUnion(float a, float b, float radius) {
  float h = max(radius - abs(a - b), 0.0) / radius;
  return min(a, b) - h * h * radius * 0.25;
}
vec2 rotatePoint(vec2 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}
float ellipseDistance(vec2 p, vec2 radii) {
  return (length(p / radii) - 1.0) * min(radii.x, radii.y);
}
float boneDistance(vec2 p, vec4 bone, vec2 radii) {
  vec2 delta = bone.zw - bone.xy;
  float t = clamp(dot(p - bone.xy, delta) / max(dot(delta, delta), 0.01), 0.0, 1.0);
  return length(p - bone.xy - delta * t) - mix(radii.x, radii.y, t);
}
void main() {
  vec2 p = handOrigin + vHandUv * handSize;
  vec2 palmPoint = rotatePoint(p - handPalm.xy, handYaw);
  // Rounded knuckles and a narrower heel, instead of a rectangular palm.
  float taper = mix(0.70, 1.0, smoothstep(-0.8, 0.35, palmPoint.y / handPalm.w));
  float distanceToHand = ellipseDistance(palmPoint, vec2(handPalm.z * taper, handPalm.w));
  float surface = clamp(-distanceToHand / (handKeyWidth * 0.8), 0.0, 1.0);
  for (int i = 0; i < 16; i++) {
    float d = boneDistance(p, handBones[i], handRadii[i]);
    distanceToHand = smoothUnion(distanceToHand, d, handKeyWidth * 0.065);
    surface = max(surface, clamp(-d / max(handRadii[i].x, 0.1), 0.0, 1.0));
  }
  float coverage = 1.0 - smoothstep(-0.65, 0.65, distanceToHand);
  if (coverage < 0.01) discard;
  // Soft volume shading, with no illuminated joint markers or overlap seams.
  float shade = 0.64 + 0.30 * sqrt(surface);
  shade += 0.06 * clamp(-palmPoint.x / handPalm.z, -1.0, 1.0);
  vec3 color = ghostColor * shade;
  // Cylinder highlights and two short folds describe each articulated finger.
  // Keep these inside the existing silhouette and alpha, so joints stay seamless.
  for (int i = 0; i < 15; i++) {
    vec4 bone = handBones[i];
    vec2 axis = bone.zw - bone.xy;
    float lengthSquared = max(dot(axis, axis), 0.01);
    float t = clamp(dot(p - bone.xy, axis) / lengthSquared, 0.0, 1.0);
    vec2 normal = vec2(-axis.y, axis.x) / sqrt(lengthSquared);
    float radius = mix(handRadii[i].x, handRadii[i].y, t);
    float across = dot(p - mix(bone.xy, bone.zw, t), normal) / max(radius, 0.1);
    float mask = 1.0 - smoothstep(0.65, 1.0, abs(across));
    float along = dot(p - bone.xy, axis) / sqrt(lengthSquared);
    mask *= smoothstep(0.0, radius * 0.5, along);
    mask *= 1.0 - smoothstep(sqrt(lengthSquared), sqrt(lengthSquared) + radius, along);
    color += ghostColor * (0.075 - 0.08 * across) * mask;
    if (i - (i / 3) * 3 < 2) {
      vec2 fold = p - bone.zw;
      float longitudinal = dot(fold, axis) / sqrt(lengthSquared);
      float transverse = dot(fold, normal) / max(radius, 0.1);
      float crease = exp(-pow((longitudinal + radius * 0.12 * transverse * transverse) / max(0.45, handKeyWidth * 0.025), 2.0));
      crease *= 1.0 - smoothstep(0.45, 0.8, abs(transverse));
      color *= 1.0 - crease * 0.17;
    }
  }
  for (int i = 0; i < 5; i++) {
    vec4 nail = handNails[i];
    vec2 q = rotatePoint(p - nail.xy, nail.z);
    float nailDistance = ellipseDistance(q, vec2(nail.w * 1.3, nail.w * 0.65));
    float nailMask = 1.0 - smoothstep(-0.3, 0.6, nailDistance);
    color = mix(color, mix(ghostColor, vec3(0.96, 0.83, 0.79), 0.55), nailMask * 0.6);
  }
  gl_FragColor = vec4(color, ghostOpacity * coverage);
}`,
  })
  material.toneMapped = false
  const mesh = new Mesh(geometry, material)
  mesh.renderOrder = 140
  mesh.visible = false
  return { bones, radii, nails, material, mesh }
}

function updateHand(hand: RenderHandState, pose: GhostHandPose, layout: GhostHandsLayout): void {
  hand.mesh.visible = pose.visible
  if (!pose.visible) return
  const keyWidth = getWhiteKeyWidth(layout.viewportWidth)
  const wrist = toScreenPoint(pose.wrist, layout)
  const roots = FINGERS.slice(1).map((finger) => toScreenPoint(pose.fingers[finger].joints[0], layout))
  const knuckles = averagePoint(roots)
  const palmWidth = Math.max(keyWidth * 2.8, Math.max(...roots.map(p => p.x)) - Math.min(...roots.map(p => p.x)) + keyWidth * 0.8)
  const palmHeight = Math.max(keyWidth * 1.8, Math.hypot(knuckles.x - wrist.x, knuckles.y - wrist.y) * 1.08)
  const palm = { x: (wrist.x + knuckles.x) / 2, y: (wrist.y + knuckles.y) / 2 }
  const points: ScreenPoint[] = [
    { x: palm.x - palmWidth, y: palm.y - palmHeight },
    { x: palm.x + palmWidth, y: palm.y + palmHeight },
  ]
  for (const finger of FINGERS) {
    const joints = pose.fingers[finger].joints.map(point => toScreenPoint(point, layout))
    points.push(...joints)
    const width = keyWidth * (finger === 1 ? 0.58 : finger === 5 ? 0.39 : 0.46)
    for (let index = 0; index < 3; index++) {
      const bone = (finger - 1) * 3 + index
      hand.bones.set([joints[index].x, joints[index].y, joints[index + 1].x, joints[index + 1].y], bone * 4)
      hand.radii.set([width * (0.55 - index * 0.045), width * (0.505 - index * 0.045)], bone * 2)
    }
    const tip = joints[3], previous = joints[2]
    const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x)
    hand.nails.set([tip.x - Math.cos(angle) * width * 0.3, tip.y - Math.sin(angle) * width * 0.3, angle, width * 0.28], (finger - 1) * 4)
  }
  const wristEnd = { x: wrist.x, y: wrist.y - keyWidth * 1.1 }
  points.push(wristEnd)
  hand.bones.set([wrist.x, wrist.y, wristEnd.x, wristEnd.y], 60)
  hand.radii.set([palmWidth * 0.25, palmWidth * 0.22], 30)
  const padding = keyWidth
  const left = Math.min(...points.map(p => p.x)) - padding
  const bottom = Math.min(...points.map(p => p.y)) - padding
  const width = Math.max(...points.map(p => p.x)) + padding - left
  const height = Math.max(...points.map(p => p.y)) + padding - bottom
  hand.mesh.position.set(left + width / 2, bottom + height / 2, HAND_RENDER_Z)
  hand.mesh.scale.set(width, height, 1)
  hand.material.uniforms.handOrigin.value.set([left, bottom])
  hand.material.uniforms.handSize.value.set([width, height])
  hand.material.uniforms.handPalm.value.set([palm.x, palm.y, palmWidth / 2, palmHeight / 2])
  hand.material.uniforms.handYaw.value = -pose.yaw
  hand.material.uniforms.handKeyWidth.value = keyWidth
  hand.material.uniforms.ghostOpacity.value = Math.min(0.8, Math.max(0.1, layout.opacity))
}

function toScreenPoint(point: HandSpacePoint, layout: GhostHandsLayout): ScreenPoint {
  return {
    x: point.x * layout.viewportWidth,
    y: layout.viewportHeight - layout.keyboardY - (point.depth - point.height * 0.25) * layout.keyboardHeight,
  }
}

function averagePoint(points: ScreenPoint[]): ScreenPoint {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  }
}
