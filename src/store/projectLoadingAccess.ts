import type { ProjectData } from '../midi/types'
import type { PrecomputedTempoMap } from '../tempo/tempoMap'

interface ProjectLoadingStoreAccess {
  getCurrentTick: () => number
  loadProject: (projectData: ProjectData, tempoMap: PrecomputedTempoMap) => void
}

let projectLoadingStoreAccess: null | ProjectLoadingStoreAccess = null

export function registerProjectLoadingStoreAccess(access: ProjectLoadingStoreAccess): void {
  projectLoadingStoreAccess = access
}

export function loadProjectIntoStore(projectData: ProjectData, tempoMap: PrecomputedTempoMap): void {
  if (projectLoadingStoreAccess == null) {
    throw new Error('Project loading store access is unavailable.')
  }

  projectLoadingStoreAccess.loadProject(projectData, tempoMap)
}

export function getStoreCurrentTick(): number {
  if (projectLoadingStoreAccess == null) {
    throw new Error('Project loading store access is unavailable.')
  }

  return projectLoadingStoreAccess.getCurrentTick()
}
