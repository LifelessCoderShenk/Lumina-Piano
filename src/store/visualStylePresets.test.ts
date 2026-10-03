import { beforeEach, describe, expect, it } from 'vitest'

import { resetStore, useAppStore } from './store'
import {
  applyVisualStyle,
  BUILT_IN_VISUAL_STYLE_PRESETS,
  captureVisualStyle,
  createVisualStylePreset,
  loadVisualStylePresets,
  storeVisualStylePresets,
} from './visualStylePresets'

describe('visual style presets', () => {
  beforeEach(() => resetStore())

  it('captures and reapplies the complete visual look without changing the music', () => {
    const originalProject = { tracks: [], tempoMap: [], timeSignatures: [], totalTicks: 0, ticksPerQuarter: 480 }
    useAppStore.setState({
      backgroundColor: '#123456',
      handVisualization: { enabled: true, opacity: 44 },
      projectData: originalProject,
      noteStyle: 'saber',
    })
    const style = captureVisualStyle(useAppStore.getState())
    useAppStore.setState({ backgroundColor: '#000000', noteStyle: 'solid' })

    useAppStore.getState().batchUpdate((state) => applyVisualStyle(state, style))

    expect(useAppStore.getState()).toMatchObject({
      backgroundColor: '#123456',
      handVisualization: { enabled: true, opacity: 44 },
      noteStyle: 'saber',
    })
    expect(useAppStore.getState().projectData).toBe(originalProject)
  })

  it('persists named styles and ignores invalid stored entries', () => {
    const storage = createMemoryStorage()
    const preset = createVisualStylePreset('  Concert   Blue  ', useAppStore.getState())
    storeVisualStylePresets([preset], storage)
    expect(loadVisualStylePresets(storage)).toEqual([{ ...preset, name: 'Concert Blue' }])

    storage.setItem('lumina.visual-style-presets.v1', '[{"name":"Broken"}]')
    expect(loadVisualStylePresets(storage)).toEqual([])
  })

  it('ships complete and distinct starter looks', () => {
    expect(BUILT_IN_VISUAL_STYLE_PRESETS.map(({ id }) => id)).toEqual([
      'builtin-clean-studio',
      'builtin-concert-gem',
      'builtin-aurora-glass',
    ])
    expect(new Set(BUILT_IN_VISUAL_STYLE_PRESETS.map(({ style }) => JSON.stringify(style))).size).toBe(3)

    useAppStore.getState().batchUpdate((state) => {
      applyVisualStyle(state, BUILT_IN_VISUAL_STYLE_PRESETS[2].style)
    })

    expect(useAppStore.getState()).toMatchObject({
      backgroundStyle: 'aurora',
      noteStyle: 'crystal',
      particleSettings: { style: 'wisp' },
    })
  })
})

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}
