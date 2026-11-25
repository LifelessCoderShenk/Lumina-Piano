import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store/store'
import { applyVisualStyle, BUILT_IN_VISUAL_STYLE_PRESETS, captureVisualStyle } from '../../store/visualStylePresets'
import { applySamplePieceVisualDefaults } from './samplePieceColorDefaults'

afterEach(() => useAppStore.getState().resetStore())

describe('sample visual isolation', () => {
  it.each(['Etude-in-C-Minor-Opus-10-Nr-12.mid', 'Pirates of the Caribbean.mid'])(
    '%s looks the same after any selected preset', (fileName) => {
      useAppStore.getState().resetStore()
      applySamplePieceVisualDefaults(fileName)
      const expected = captureVisualStyle(useAppStore.getState())
      for (const preset of BUILT_IN_VISUAL_STYLE_PRESETS) {
        useAppStore.getState().batchUpdate((state) => {
          applyVisualStyle(state, preset.style)
          state.particleSettings.enabled = false
          state.noteGlow = 180
          state.backgroundImage = 'custom-image'
        })
        applySamplePieceVisualDefaults(fileName)
        expect(captureVisualStyle(useAppStore.getState())).toEqual(expected)
        expect(useAppStore.getState().backgroundImage).toBeNull()
        expect(useAppStore.getState().particleSettings.enabled).toBe(true)
      }
    },
  )

  it('leaves other MIDI appearances untouched', () => {
    const before = captureVisualStyle(useAppStore.getState())
    applySamplePieceVisualDefaults('my-recording.mid')
    expect(captureVisualStyle(useAppStore.getState())).toEqual(before)
  })
})
