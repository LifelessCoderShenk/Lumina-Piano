import type { ProjectData } from '../midi/types'
import { loadProjectData } from '../midi/loadMidiProject'
import { playbackEngine } from '../playback/PlaybackEngine'
import { handVisualizationInitial } from '../store/defaults'
import { useAppStore } from '../store/store'
import type {
  AppState,
  CameraOverlaySettings,
  CreateNoteColors,
  HandVisualizationSettings,
  ParticleSettings,
  VisualizerSettings,
  VisualizerSettingsSlice,
} from '../store/types'
import { validateProjectData } from '../store/validation'

export const LUMINA_PROJECT_KIND = 'lumina-piano-project'
export const LUMINA_PROJECT_VERSION = 1

type AppearanceSettings = Pick<
  VisualizerSettingsSlice,
  | 'backgroundColor' | 'backgroundImage' | 'backgroundImageTreatment' | 'backgroundStyle' | 'colorMode' | 'fallSpeed' | 'gradientBottomColorLeft' | 'gradientBottomColorLeftBlack'
  | 'gradientBottomColorRight' | 'gradientBottomColorRightBlack' | 'gradientTopColor' | 'laneOpacity'
  | 'keyboardSaber' | 'leftHandColor' | 'lightingIntensity' | 'noteGradientDirection' | 'noteLabelColor' | 'noteLabelFormat'
  | 'noteGlow' | 'noteLabelSize' | 'noteLabelsOnKeys' | 'noteLabelsOnNotes' | 'noteOpacity' | 'noteStyle' | 'noteWidth' | 'pitchClassColors'
  | 'rightHandColor' | 'scoreOverlayOpacity' | 'scoreOverlaySize' | 'splitPitch' | 'velocityHighColor' | 'velocityLowColor'
>

export interface LuminaProjectDocument {
  kind: typeof LUMINA_PROJECT_KIND
  version: typeof LUMINA_PROJECT_VERSION
  name: string
  savedAt: number
  projectData: ProjectData
  workspace: {
    appearance: AppearanceSettings
    cameraOverlay: CameraOverlaySettings
    createNoteColors: CreateNoteColors
    handVisualization?: HandVisualizationSettings
    particleSettings: ParticleSettings
    visualizerSettings: VisualizerSettings
    tracks: {
      colors: Record<string, string>
      muted: Record<string, boolean>
      soloed: Record<string, boolean>
    }
    playback: {
      currentTick: number
      loopEnabled: boolean
      loopStartTick: number
      loopEndTick: number
    }
  }
}

const APPEARANCE_KEYS: readonly (keyof AppearanceSettings)[] = [
  'backgroundColor', 'backgroundImage', 'backgroundImageTreatment', 'backgroundStyle', 'colorMode', 'fallSpeed', 'gradientBottomColorLeft', 'gradientBottomColorLeftBlack',
  'gradientBottomColorRight', 'gradientBottomColorRightBlack', 'gradientTopColor', 'laneOpacity',
  'keyboardSaber', 'leftHandColor', 'lightingIntensity', 'noteGradientDirection', 'noteLabelColor', 'noteLabelFormat', 'noteLabelSize',
  'noteGlow', 'noteLabelsOnKeys', 'noteLabelsOnNotes', 'noteOpacity', 'noteStyle', 'noteWidth', 'pitchClassColors', 'rightHandColor',
  'scoreOverlayOpacity', 'scoreOverlaySize', 'splitPitch', 'velocityHighColor', 'velocityLowColor',
]

export function createLuminaProjectDocument(state: AppState, name: string): LuminaProjectDocument {
  if (state.projectData == null) throw new Error('Load or record a performance before saving a project.')
  const appearance = {} as AppearanceSettings
  for (const key of APPEARANCE_KEYS) (appearance as Record<string, unknown>)[key] = structuredClone(state[key])
  return {
    kind: LUMINA_PROJECT_KIND,
    version: LUMINA_PROJECT_VERSION,
    name: cleanProjectName(name),
    savedAt: Date.now(),
    projectData: structuredClone(state.projectData),
    workspace: {
      appearance,
      cameraOverlay: structuredClone(state.cameraOverlay),
      createNoteColors: structuredClone(state.createNoteColors),
      handVisualization: structuredClone(state.handVisualization),
      particleSettings: structuredClone(state.particleSettings),
      visualizerSettings: structuredClone(state.visualizerSettings),
      tracks: {
        colors: { ...state.trackColors }, muted: { ...state.trackMuted }, soloed: { ...state.trackSoloed },
      },
      playback: {
        currentTick: state.currentTick, loopEnabled: state.loopEnabled,
        loopStartTick: state.loopStartTick, loopEndTick: state.loopEndTick,
      },
    },
  }
}

export function serializeLuminaProject(document: LuminaProjectDocument): string {
  return JSON.stringify(document, null, 2)
}

export function parseLuminaProject(text: string): LuminaProjectDocument {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This is not a valid Lumina project file.') }
  if (value == null || typeof value !== 'object') throw new Error('This Lumina project is invalid.')
  const document = value as Partial<LuminaProjectDocument>
  if (document.kind !== LUMINA_PROJECT_KIND) throw new Error('This file is not a Lumina project.')
  if (document.version !== LUMINA_PROJECT_VERSION) throw new Error('This Lumina project version is not supported.')
  if (typeof document.name !== 'string' || document.workspace == null) throw new Error('This Lumina project is incomplete.')
  validateProjectData(document.projectData)
  return document as LuminaProjectDocument
}

export async function saveCurrentLuminaProject(suggestedName: string): Promise<{ filePath: string; name: string } | null> {
  const state = useAppStore.getState()
  const name = cleanProjectName(suggestedName)
  const filePath = await window.electronAPI?.showSaveDialog?.({
    title: 'Save editable Lumina project', defaultPath: `${name}.lumina`,
    filters: [{ name: 'Lumina Projects', extensions: ['lumina'] }],
  })
  if (filePath == null) return null
  const normalizedPath = filePath.toLowerCase().endsWith('.lumina') ? filePath : `${filePath}.lumina`
  const bytes = new TextEncoder().encode(serializeLuminaProject(createLuminaProjectDocument(state, name)))
  await window.electronFS.writeFile(normalizedPath, bytes)
  return { filePath: normalizedPath, name }
}

export async function chooseAndLoadLuminaProject(): Promise<{ filePath: string; name: string } | null> {
  const picker = window.electronAPI?.openProjectFile ?? window.electronAPI?.dialog?.openProjectFile
  if (typeof picker !== 'function') throw new Error('Open Project is unavailable.')
  const filePath = await picker()
  return filePath == null ? null : loadLuminaProjectFileFromPath(filePath)
}

export async function loadLuminaProjectFileFromPath(filePath: string): Promise<{ filePath: string; name: string }> {
  const bytes = await window.electronFS.readFile(filePath)
  const document = parseLuminaProject(new TextDecoder().decode(bytes))
  await applyLuminaProjectDocument(document)
  return { filePath, name: document.name }
}

export async function applyLuminaProjectDocument(document: LuminaProjectDocument): Promise<void> {
  await loadProjectData(document.projectData)
  const maxTick = Math.max(0, document.projectData.totalTicks)
  const clampTick = (tick: number) => Math.max(0, Math.min(maxTick, Number.isFinite(tick) ? tick : 0))
  const workspace = document.workspace
  useAppStore.getState().batchUpdate((state) => {
    Object.assign(state, workspace.appearance)
    state.backgroundImage = workspace.appearance.backgroundImage ?? null
    state.backgroundImageTreatment = workspace.appearance.backgroundImageTreatment ?? {
      blur: 0,
      dim: 20,
      saturation: 100,
      vignette: 20,
    }
    state.backgroundStyle = workspace.appearance.backgroundStyle ?? 'flat'
    state.fallSpeed = workspace.appearance.fallSpeed ?? 100
    state.keyboardSaber = workspace.appearance.keyboardSaber ?? false
    state.lightingIntensity = workspace.appearance.lightingIntensity ?? 100
    state.noteGlow = workspace.appearance.noteGlow ?? 100
    state.noteOpacity = workspace.appearance.noteOpacity ?? 100
    state.noteWidth = workspace.appearance.noteWidth ?? 100
    state.scoreOverlayOpacity = workspace.appearance.scoreOverlayOpacity ?? 100
    state.scoreOverlaySize = workspace.appearance.scoreOverlaySize ?? 'standard'
    state.cameraOverlay = structuredClone(workspace.cameraOverlay)
    state.createNoteColors = structuredClone(workspace.createNoteColors)
    state.handVisualization = structuredClone(workspace.handVisualization ?? handVisualizationInitial)
    state.particleSettings = {
      ...structuredClone(workspace.particleSettings),
      colorMode: workspace.particleSettings.colorMode ?? 'note',
      customColor: workspace.particleSettings.customColor ?? '#7ec8ff',
      style: workspace.particleSettings.style ?? 'spark',
    }
    state.visualizerSettings = structuredClone(workspace.visualizerSettings)
    state.trackColors = { ...workspace.tracks.colors }
    state.trackMuted = { ...workspace.tracks.muted }
    state.trackSoloed = { ...workspace.tracks.soloed }
    state.currentTick = clampTick(workspace.playback.currentTick)
    state.loopStartTick = clampTick(workspace.playback.loopStartTick)
    state.loopEndTick = clampTick(workspace.playback.loopEndTick)
    state.loopEnabled = workspace.playback.loopEnabled && state.loopEndTick > state.loopStartTick
    state.isPlaying = false
    state.appMode = 'create'
    state.activeSecondBarTab = 'pieces'
  })
  playbackEngine.seek(useAppStore.getState().currentTick)
}

function cleanProjectName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\.+$/g, '').slice(0, 100) || 'Untitled Project'
}
