// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { SkinnedMesh, type Object3D, type ShaderMaterial } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AnatomicalHandsLayer } from './AnatomicalHandsLayer'
import { parseMidi } from '../midi/parser'
import { planProjectHandPerformance } from '../hands/anatomicalPerformance'

const project = () =>
  parseMidi(
    new Uint8Array(readFileSync('website/public/media/lumina-miniature.mid')),
  )
const load = async () => {
  const bytes = readFileSync('src/assets/hands/right.glb')
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
}
const layout = {
  viewportWidth: 1920,
  viewportHeight: 1080,
  keyboardHeight: 180,
  keyboardY: 770,
  opacity: 0.65,
}
const matrices = (layer: AnatomicalHandsLayer) => {
  const result: number[][] = []
  layer.group.updateMatrixWorld(true)
  layer.group.traverse((object: Object3D) => {
    if (object instanceof SkinnedMesh) {
      object.skeleton.update()
      result.push(Array.from(object.skeleton.boneMatrices))
    }
  })
  return result
}

describe('anatomical app integration', () => {
  it('uses the real bundled mesh, supports seek and resize, and releases resources', async () => {
    const layer = new AnatomicalHandsLayer()
    await layer.initialize(load)
    const source = project()
    layer.updateProject(source, 960, layout)
    expect(layer.group.visible).toBe(true)
    const first = matrices(layer)
    expect(first).toHaveLength(4) // Each hand has a color and depth pass.
    expect(first.flat().every(Number.isFinite)).toBe(true)
    layer.updateProject(source, 3000, layout)
    expect(matrices(layer)).not.toEqual(first)
    layer.updateProject(source, 960, {
      ...layout,
      viewportWidth: 1080,
      viewportHeight: 1920,
    })
    expect(matrices(layer)).toEqual(first)
    layer.group.traverse((object: Object3D) => {
      if (object instanceof SkinnedMesh)
        expect((object.material as ShaderMaterial).uniforms.viewport.value.x).toBe(1080)
    })
    layer.hide()
    expect(layer.group.visible).toBe(false)
    const dispose = vi.fn()
    layer.group.traverse((object: Object3D) => {
      if (object instanceof SkinnedMesh)
        object.geometry.addEventListener('dispose', dispose)
    })
    layer.dispose()
    expect(dispose).toHaveBeenCalledOnce()
    expect(layer.group.children).toHaveLength(0)
  })

  it('keeps app timing and manual assignments without modifying the project', () => {
    const source = project()
    source.tracks = [
      {
        ...source.tracks[0],
        notes: [
          {
            id: 'manual',
            pitch: 72,
            startTick: 0,
            endTick: 480,
            visualEndTick: 480,
            velocity: 100,
            fingering: { hand: 'right', finger: 4, source: 'manual' },
          },
        ],
      },
    ]
    const before = JSON.stringify(source)
    const plan = planProjectHandPerformance(source, {
      leadIn: 0,
      previewLimits: false,
    })
    expect(plan.events[0]).toMatchObject({ start: 0, hand: 'right', finger: 3 })
    expect(JSON.stringify(source)).toBe(before)
  })

  it('reports an invalid project and refuses a silent handless export, then recovers on edit', async () => {
    const onError = vi.fn()
    const layer = new AnatomicalHandsLayer(onError)
    await layer.initialize(load)
    const invalid = project()
    invalid.tracks[0].notes[0].pitch = 1
    layer.updateProject(invalid, 0, layout)
    layer.updateProject(invalid, 20, layout)
    expect(onError).toHaveBeenCalledOnce()
    expect(layer.group.visible).toBe(false)
    expect(() => layer.assertAvailable()).toThrow('88-key')
    layer.updateProject(project(), 0, layout)
    expect(() => layer.assertAvailable()).not.toThrow()
    expect(layer.group.visible).toBe(true)
    layer.dispose()
  })

  it('handles asset load failures without crashing the main preview', async () => {
    const onError = vi.fn()
    const layer = new AnatomicalHandsLayer(onError)
    await layer.initialize(async () => {
      throw new Error('Missing hand asset')
    })
    layer.updateProject(project(), 0, layout)
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('Missing hand asset'),
    )
    expect(() => layer.assertAvailable()).toThrow('Missing hand asset')
    layer.dispose()
  })
})
