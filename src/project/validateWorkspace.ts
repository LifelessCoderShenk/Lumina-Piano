import { validateBackgroundStyle, validateColorMode, validateCreateNoteColorMode, validateNoteStyle, validateNoteLabelFormat, validateNoteGradientDirection, validateScoreOverlaySize, validateParticleSettingsPatch } from '../store/validation'
import { cameraOverlayInitial, createCreateNoteColorDefaults, createParticleSettingsDefaults, createVisualizerSettingsDefaults, handVisualizationInitial, visualizerSettingsInitial } from '../store/defaults'
import type { LuminaProjectDocument } from './luminaProject'

function record(value: unknown): asserts value is Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) throw new Error('This project contains incomplete workspace settings.')
}
function shape(value: unknown, template: object, partial = false): void {
  record(value)
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(template, key)) throw new Error(`Unsupported project setting: ${key}`)
  }
  for (const [key, expected] of Object.entries(template)) {
    if (partial && !Object.hasOwn(value, key)) continue
    const actual = value[key]
    if (expected === null) {
      if (actual !== null && typeof actual !== 'string') throw new Error(`Invalid project setting: ${key}`)
    } else if (typeof expected === 'object') shape(actual, expected)
    else if (typeof actual !== typeof expected || (typeof actual === 'number' && !Number.isFinite(actual))) {
      throw new Error(`Invalid project setting: ${key}`)
    }
  }
}
export function validateWorkspace(workspace: LuminaProjectDocument['workspace']): void {
  record(workspace)
  shape(workspace.appearance, createVisualizerSettingsDefaults(), true)
  const appearance = workspace.appearance
  if (appearance.backgroundStyle !== undefined) validateBackgroundStyle(appearance.backgroundStyle)
  if (appearance.colorMode !== undefined) validateColorMode(appearance.colorMode)
  if (appearance.noteStyle !== undefined) validateNoteStyle(appearance.noteStyle)
  if (appearance.noteLabelFormat !== undefined) validateNoteLabelFormat(appearance.noteLabelFormat)
  if (appearance.noteGradientDirection !== undefined) validateNoteGradientDirection(appearance.noteGradientDirection)
  if (appearance.scoreOverlaySize !== undefined) validateScoreOverlaySize(appearance.scoreOverlaySize)
  shape(workspace.cameraOverlay, cameraOverlayInitial)
  shape(workspace.createNoteColors, createCreateNoteColorDefaults())
  validateCreateNoteColorMode(workspace.createNoteColors.mode)
  // Older projects predate particle colors, styles, and generated hands.
  shape(workspace.particleSettings, createParticleSettingsDefaults(), true)
  validateParticleSettingsPatch(workspace.particleSettings)
  if (workspace.handVisualization != null) shape(workspace.handVisualization, handVisualizationInitial)
  shape(workspace.visualizerSettings, visualizerSettingsInitial)
  const { aspectRatio, resolution, framerate } = workspace.visualizerSettings
  if (!['fit', '16:9', '9:16', '1:1', '4:3'].includes(aspectRatio)
    || !['720p', '1080p', '4K'].includes(resolution) || ![30, 60].includes(framerate)) {
    throw new Error('This project contains unsupported export settings.')
  }
  shape(workspace.playback, { currentTick: 0, loopEnabled: false, loopStartTick: 0, loopEndTick: 0 })
  record(workspace.tracks)
  for (const key of ['colors', 'muted', 'soloed'] as const) {
    const values = workspace.tracks[key]
    record(values)
    if (Object.values(values).some(value => typeof value !== (key === 'colors' ? 'string' : 'boolean'))) {
      throw new Error('This project contains invalid track settings.')
    }
  }
}
