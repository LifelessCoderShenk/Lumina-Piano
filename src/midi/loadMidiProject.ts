import { parseMidi } from './parser'

import { audioScheduler } from '../audio/AudioScheduler'
import { PlaybackEngineError, playbackEngine } from '../playback/PlaybackEngine'
import { getActiveVisualizerRenderer } from '../renderer/activeVisualizerRenderer'
import { spatialIndex } from '../spatial/SpatialIndex'
import { registerMidiPieceLoader } from '../store/midiPieceLoaderAccess'
import { getStoreCurrentTick, loadProjectIntoStore } from '../store/projectLoadingAccess'
import { buildTempoMap } from '../tempo/tempoMap'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'
import type { ProjectData } from './types'

const CREATE_MODE_PLAYBACK_PRE_ROLL_SECONDS = 1

export async function openAndLoadMidiFile(): Promise<boolean> {
  try {
    const electronApi = getElectronApi()
    const openMidiFile = electronApi?.openMidiFile ?? electronApi?.dialog?.openMidiFile

    if (
      electronApi == null ||
      typeof openMidiFile !== 'function' ||
      getElectronFs() == null ||
      typeof getElectronFs()?.readFile !== 'function'
    ) {
      throw new Error('Open MIDI file bridge is unavailable.')
    }

    const filePath = await openMidiFile()
    if (filePath == null) {
      return false
    }

    if (!isMidiFilePath(filePath)) {
      console.warn(`Ignoring non-MIDI file selected from MIDI loader: ${filePath}`)
      return false
    }

    return loadMidiFileFromPath(filePath)
  } catch (error: unknown) {
    console.error('MIDI load error:', error)
    throw error
  }
}

export async function loadMidiFileFromPath(filePath: string): Promise<boolean> {
  const electronFs = getElectronFs()
  if (electronFs == null || typeof electronFs.readFile !== 'function') {
    throw new Error('Read MIDI file bridge is unavailable.')
  }

  const bytes = await electronFs.readFile(filePath)
  return loadMidiBytes(bytes)
}

export async function loadMidiBytes(bytes: Uint8Array): Promise<boolean> {
  const parsedProject = parseMidi(bytes)
  return loadProjectData(parsedProject)
}

export async function loadProjectData(projectData: ProjectData): Promise<boolean> {
  const tempoMap = buildTempoMap(projectData.tempoMap, projectData.ticksPerQuarter)

  await ensureAudioSchedulerReady()
  ensurePlaybackEngineReady(tempoMap)
  spatialIndex.build(projectData)
  loadProjectIntoStore(projectData, tempoMap)
  playbackEngine.seek(0)

  const activeRenderer = getActiveVisualizerRenderer()
  if (activeRenderer?.isReady()) {
    activeRenderer.renderFrame(getStoreCurrentTick())
  }

  return true
}

export async function warmUpAudioAndStartPlayback(): Promise<void> {
  await audioScheduler.warmUp()
  playbackEngine.playWithPreRoll(CREATE_MODE_PLAYBACK_PRE_ROLL_SECONDS)
}

async function ensureAudioSchedulerReady(): Promise<void> {
  if (audioScheduler.isReady()) {
    return
  }

  await audioScheduler.init()
}

function ensurePlaybackEngineReady(tempoMap: PrecomputedTempoMap): void {
  try {
    playbackEngine.init(tempoMap)
  } catch (error: unknown) {
    if (error instanceof PlaybackEngineError && error.code === 'ALREADY_INITIALIZED') {
      return
    }

    throw error
  }
}

function getElectronApi() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

function getElectronFs() {
  return typeof window !== 'undefined' ? window.electronFS : undefined
}

export function isMidiFilePath(filePath: string): boolean {
  const normalizedPath = filePath.trim().toLowerCase()
  return normalizedPath.endsWith('.mid') || normalizedPath.endsWith('.midi')
}

registerMidiPieceLoader({
  loadMidiFileFromPath,
  warmUpAudioAndStartPlayback,
})
