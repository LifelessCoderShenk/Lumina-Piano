import { parseMidi } from './parser'

import { audioScheduler } from '../audio/AudioScheduler'
import { PlaybackEngineError, playbackEngine } from '../playback/PlaybackEngine'
import { renderer } from '../renderer/Renderer'
import { spatialIndex } from '../spatial/SpatialIndex'
import { getAppState, useAppStore } from '../store/store'
import { buildTempoMap } from '../tempo/tempoMap'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'

export async function openAndLoadMidiFile(): Promise<boolean> {
  try {
    const electronApi = getElectronApi()
    const electronFs = getElectronFs()

    if (
      electronApi == null ||
      typeof electronApi.dialog.openMidiFile !== 'function' ||
      electronFs == null ||
      typeof electronFs.readFile !== 'function'
    ) {
      throw new Error('Open MIDI file bridge is unavailable.')
    }

    const filePath = await electronApi.dialog.openMidiFile()
    if (filePath == null) {
      return false
    }

    const bytes = await electronFs.readFile(filePath)
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
  } catch (error: unknown) {
    console.error('MIDI load error:', error)
    throw error
  }
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
