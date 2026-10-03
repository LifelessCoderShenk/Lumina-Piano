import { PlaneGeometry } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { getWhiteKeyWidth } from './pianoMath'
import { ReactiveLightingLayer, type ReactiveLightingLayout } from './ReactiveLightingLayer'

const LAYOUT: ReactiveLightingLayout = {
  intensity: 1,
  keyboardHeight: 270,
  keyboardY: 450,
  viewportHeight: 720,
  viewportWidth: 1_280,
}

describe('ReactiveLightingLayer', () => {
  it('stays hidden without active notes and reveals colored lights for active keys', () => {
    const layer = new ReactiveLightingLayer(new PlaneGeometry(1, 1))
    layer.update([], LAYOUT)
    expect(layer.group.visible).toBe(false)

    layer.update([{ color: 0x4f8ef7, pitch: 60, strength: 0.75 }], LAYOUT)
    const first = getLights(layer)[0]
    expect(layer.group.visible).toBe(true)
    expect(first.mesh.visible).toBe(true)
    expect(first.material.uniforms.lightColor.value.getHex()).toBe(0x4f8ef7)
    expect(first.material.uniforms.lightOpacity.value).toBeCloseTo(0.12)
  })

  it('uses a bounded pool and keeps portrait glows inside the frame', () => {
    const layer = new ReactiveLightingLayer(new PlaneGeometry(1, 1))
    const portrait = { ...LAYOUT, keyboardHeight: 720, keyboardY: 1_200, viewportHeight: 1_920, viewportWidth: 1_080 }
    const active = Array.from({ length: 20 }, (_, index) => ({
      color: 0x70d7ff,
      pitch: 21 + index * 4,
      strength: 1 - index * 0.02,
    }))
    layer.update(active, portrait)
    const visible = getLights(layer).filter(({ mesh }) => mesh.visible)

    expect(visible).toHaveLength(12)
    for (const { mesh } of visible) {
      expect(mesh.position.x - mesh.scale.x / 2).toBeGreaterThanOrEqual(0)
      expect(mesh.position.x + mesh.scale.x / 2).toBeLessThanOrEqual(portrait.viewportWidth)
      expect(mesh.scale.x).toBeGreaterThan(getWhiteKeyWidth(portrait.viewportWidth) * 7)
    }
  })

  it('follows the shared visual intensity and disposes all pooled materials', () => {
    const layer = new ReactiveLightingLayer(new PlaneGeometry(1, 1))
    const lights = getLights(layer)
    const disposeSpies = lights.map(({ material }) => vi.spyOn(material, 'dispose'))
    const note = [{ color: 0xffffff, pitch: 64, strength: 1 }]

    layer.update(note, { ...LAYOUT, intensity: 2 })
    expect(lights[0].material.uniforms.lightOpacity.value).toBe(0.32)
    layer.update(note, { ...LAYOUT, intensity: 0 })
    expect(layer.group.visible).toBe(false)

    layer.dispose()
    expect(disposeSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true)
  })
})

function getLights(layer: ReactiveLightingLayer) {
  return (layer as unknown as {
    lights: Array<{
      material: {
        dispose(): void
        uniforms: {
          lightColor: { value: { getHex(): number } }
          lightOpacity: { value: number }
        }
      }
      mesh: {
        position: { x: number }
        scale: { x: number }
        visible: boolean
      }
    }>
  }).lights
}
