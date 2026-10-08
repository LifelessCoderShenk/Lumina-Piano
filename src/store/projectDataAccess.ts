import type { ProjectData } from '../midi/types'

type ProjectDataChangeListener = (
  projectData: ProjectData | null,
  previousProjectData: ProjectData | null,
) => void

interface ProjectDataStoreAccess {
  getCurrentProjectData: () => ProjectData | null
  subscribeToProjectData: (listener: ProjectDataChangeListener) => () => void
}

let projectDataStoreAccess: null | ProjectDataStoreAccess = null
const pendingListeners = new Set<ProjectDataChangeListener>()
const pendingUnsubscribeMap = new Map<ProjectDataChangeListener, (() => void)>()

export function registerProjectDataStoreAccess(access: ProjectDataStoreAccess): void {
  projectDataStoreAccess = access

  for (const listener of pendingListeners) {
    pendingUnsubscribeMap.set(listener, access.subscribeToProjectData(listener))
  }
}

export function getCurrentProjectData(): ProjectData | null {
  return projectDataStoreAccess?.getCurrentProjectData() ?? null
}

export function subscribeToProjectData(listener: ProjectDataChangeListener): () => void {
  if (projectDataStoreAccess != null) {
    return projectDataStoreAccess.subscribeToProjectData(listener)
  }

  pendingListeners.add(listener)

  return () => {
    const unsubscribe = pendingUnsubscribeMap.get(listener)
    if (unsubscribe != null) {
      unsubscribe()
      pendingUnsubscribeMap.delete(listener)
    }

    pendingListeners.delete(listener)
  }
}
