import { AdditiveBlending, Color, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three'

import { getWhiteKeyWidth, pitchToKeyX } from './pianoMath'

const LIGHT_POOL_SIZE = 12
const LIGHT_RENDER_Z = 0.5
const LIGHT_BASE_OPACITY = 0.16

export interface ReactiveLight {
  color: number
  pitch: number
  strength: number
}

export interface ReactiveLightingLayout {
  intensity: number
  keyboardHeight: number
  keyboardY: number
  viewportHeight: number
  viewportWidth: number
}

interface LightState {
  material: ShaderMaterial
  mesh: Mesh<PlaneGeometry, ShaderMaterial>
}

export class ReactiveLightingLayer {
  readonly group = new Group()

  private readonly lights: LightState[]

  constructor(private readonly geometry: PlaneGeometry) {
    this.lights = Array.from({ length: LIGHT_POOL_SIZE }, () => this.createLight())
    this.group.visible = false
  }

  update(activeLights: readonly ReactiveLight[], layout: ReactiveLightingLayout): void {
    const intensity = clamp(layout.intensity, 0, 2)
    if (intensity <= 0) {
      this.hide()
      return
    }

    const visibleLights = activeLights
      .filter(({ strength }) => Number.isFinite(strength) && strength > 0.001)
      .sort((left, right) => right.strength - left.strength || left.pitch - right.pitch)
      .slice(0, LIGHT_POOL_SIZE)
    this.group.visible = visibleLights.length > 0
    const whiteKeyWidth = getWhiteKeyWidth(layout.viewportWidth)
    const width = Math.max(whiteKeyWidth * 7.2, layout.viewportWidth * 0.075)
    const height = Math.max(
      whiteKeyWidth * 4,
      Math.min(layout.keyboardY * 0.54, layout.keyboardHeight * 1.8),
    )

    for (let index = 0; index < this.lights.length; index += 1) {
      const state = this.lights[index]
      const light = visibleLights[index]
      if (light == null) {
        state.mesh.visible = false
        continue
      }

      const centerX = clamp(
        pitchToKeyX(light.pitch, layout.viewportWidth) + whiteKeyWidth / 2,
        width / 2,
        layout.viewportWidth - width / 2,
      )
      const topDownCenterY = layout.keyboardY - height * 0.35
      state.mesh.position.set(centerX, layout.viewportHeight - topDownCenterY, LIGHT_RENDER_Z)
      state.mesh.scale.set(width, height, 1)
      state.mesh.visible = true
      state.material.uniforms.lightColor.value.setHex(light.color)
      state.material.uniforms.lightOpacity.value = clamp(
        LIGHT_BASE_OPACITY * light.strength * intensity,
        0,
        0.32,
      )
      state.material.needsUpdate = true
    }
  }

  hide(): void {
    this.group.visible = false
    for (const { mesh } of this.lights) mesh.visible = false
  }

  dispose(): void {
    for (const { material } of this.lights) material.dispose()
  }

  private createLight(): LightState {
    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        lightColor: { value: new Color(0xffffff) },
        lightOpacity: { value: 0 },
      },
      vertexShader: `
varying vec2 vLightUv;

void main() {
  vLightUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform vec3 lightColor;
uniform float lightOpacity;
varying vec2 vLightUv;

void main() {
  vec2 point = vec2((vLightUv.x - 0.5) * 1.25, (vLightUv.y - 0.18) * 0.9);
  float distanceFromSource = length(point);
  float bloom = 1.0 - smoothstep(0.06, 0.82, distanceFromSource);
  float verticalFade = smoothstep(0.0, 0.12, vLightUv.y) * (1.0 - smoothstep(0.62, 1.0, vLightUv.y));
  gl_FragColor = vec4(lightColor, lightOpacity * bloom * verticalFade);
}`,
    })
    material.toneMapped = false
    const mesh = new Mesh(this.geometry, material)
    mesh.renderOrder = Math.round(LIGHT_RENDER_Z * 10)
    mesh.visible = false
    this.group.add(mesh)
    return { material, mesh }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
