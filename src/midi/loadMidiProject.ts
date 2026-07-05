import { parseMidi } from './parser'

import { audioScheduler } from '../audio/AudioScheduler'
import { PlaybackEngineError, playbackEngine } from '../playback/PlaybackEngine'
import { renderer } from '../renderer/Renderer'
import { spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, useAppStore } from '../store/store'
import { buildTempoMap } from '../tempo/tempoMap'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'

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
  const tempoMap = buildTempoMap(parsedProject.tempoMap, parsedProject.ticksPerQuarter)

  await ensureAudioSchedulerReady()
  ensurePlaybackEngineReady(tempoMap)
  spatialIndex.build(parsedProject)
  useAppStore.getState().loadProject(parsedProject, tempoMap)
  playbackEngine.seek(0)

  if (renderer.isReady()) {
    renderer.renderFrame(getAppState().currentTick)
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
