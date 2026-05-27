import type { CameraViewport } from '../camera/CameraSystem'
import type { Note, ProjectData } from '../midi/types'
import { getAppState, subscribeToStore } from '../store/store'
import { SpatialIndexError } from './errors'

export interface IndexedNote {
  note: Note
  trackId: string
  trackIndex: number
}

export class SpatialIndex {
  private indexedNotes: IndexedNote[] = []
  private maxNoteDuration = 0
  private projectData: ProjectData | null = null
  private trackCount = 0
  private hasBuilt = false
  private readonly autoSubscribe: boolean

  constructor(autoSubscribe = true) {
    this.autoSubscribe = autoSubscribe

    if (this.autoSubscribe) {
      subscribeToStore((state, previousState) => {
        if (state.projectData !== previousState.projectData) {
          if (state.projectData != null) {
            this.build(state.projectData)
          } else {
            this.clear()
          }
        }
      })

      const currentProject = getAppState().projectData
      if (currentProject != null) {
        this.build(currentProject)
      }
    }
  }

  build(projectData: ProjectData): void {
    if (projectData == null || !Array.isArray(projectData.tracks)) {
      this.projectData = null
      this.trackCount = 0
      this.indexedNotes = []
      this.maxNoteDuration = 0
      this.hasBuilt = true
      return
    }

    this.projectData = projectData
    this.trackCount = projectData.tracks.length
    this.indexedNotes = []
    this.maxNoteDuration = 0
    this.hasBuilt = true

    if (projectData.tracks.length === 0) {
      return
    }

    const flattenedNotes: IndexedNote[] = []

    projectData.tracks.forEach((track, trackIndex) => {
      for (const note of track.notes) {
        flattenedNotes.push({
          note,
          trackId: track.id,
          trackIndex,
        })
        this.maxNoteDuration = Math.max(this.maxNoteDuration, note.visualEndTick - note.startTick)
      }
    })

    flattenedNotes.sort((left, right) => {
      if (left.note.startTick !== right.note.startTick) {
        return left.note.startTick - right.note.startTick
      }

      if (left.note.pitch !== right.note.pitch) {
        return left.note.pitch - right.note.pitch
      }

      return left.trackIndex - right.trackIndex
    })

    this.indexedNotes = flattenedNotes
  }

  clear(): void {
    this.indexedNotes = []
    this.maxNoteDuration = 0
    this.projectData = null
    this.trackCount = 0
    this.hasBuilt = false
  }

  getVisibleNotes(viewport: CameraViewport): IndexedNote[] {
    this.assertValidViewport(viewport)

    if (!this.hasBuilt) {
      return []
    }

    if (viewport.minTick === viewport.maxTick || this.indexedNotes.length === 0) {
      return []
    }

    const minPitch = Math.floor(viewport.minPitch)
    const maxPitch = Math.ceil(viewport.maxPitch)
    const startIndex = this.findStartIndex(viewport.minTick)
    const result: IndexedNote[] = []

    for (let index = startIndex; index < this.indexedNotes.length; index += 1) {
      const indexedNote = this.indexedNotes[index]
      if (indexedNote.note.startTick >= viewport.maxTick) {
        break
      }

      if (this.noteOverlapsTickRange(indexedNote.note, viewport.minTick, viewport.maxTick) &&
          indexedNote.note.pitch >= minPitch &&
          indexedNote.note.pitch <= maxPitch) {
        result.push(indexedNote)
      }
    }

    return result
  }

  getNoteAtPoint(worldX: number, worldY: number): IndexedNote | null {
    if (!this.hasBuilt) {
      return null
    }

    if (this.indexedNotes.length === 0) {
      return null
    }

    const targetPitch = Math.round(worldX)
    const startIndex = this.findStartIndex(worldY)
    let bestMatch: IndexedNote | null = null

    for (let index = startIndex; index < this.indexedNotes.length; index += 1) {
      const indexedNote = this.indexedNotes[index]
      if (indexedNote.note.startTick > worldY) {
        break
      }

      if (
        indexedNote.note.pitch === targetPitch &&
        indexedNote.note.startTick <= worldY &&
        indexedNote.note.visualEndTick >= worldY
      ) {
        if (bestMatch == null || indexedNote.note.startTick >= bestMatch.note.startTick) {
          bestMatch = indexedNote
        }
      }
    }

    return bestMatch
  }

  getNotesInRegion(
    minWorldX: number,
    minWorldY: number,
    maxWorldX: number,
    maxWorldY: number,
  ): IndexedNote[] {
    if (maxWorldX < minWorldX || maxWorldY < minWorldY) {
      throw new SpatialIndexError('Selection region is invalid.', 'INVALID_REGION', {
        maxWorldX,
        maxWorldY,
        minWorldX,
        minWorldY,
      })
    }

    if (!this.hasBuilt) {
      return []
    }

    if (this.indexedNotes.length === 0) {
      return []
    }

    const minPitch = Math.floor(minWorldX)
    const maxPitch = Math.ceil(maxWorldX)
    const startIndex = this.findStartIndex(minWorldY)
    const result: IndexedNote[] = []

    for (let index = startIndex; index < this.indexedNotes.length; index += 1) {
      const indexedNote = this.indexedNotes[index]
      if (indexedNote.note.startTick >= maxWorldY) {
        break
      }

      if (this.noteOverlapsTickRange(indexedNote.note, minWorldY, maxWorldY) &&
          indexedNote.note.pitch >= minPitch &&
          indexedNote.note.pitch <= maxPitch) {
        result.push(indexedNote)
      }
    }

    return result
  }

  getTotalNoteCount(): number {
    return this.indexedNotes.length
  }

  getIndexedTrackCount(): number {
    return this.trackCount
  }

  isBuilt(): boolean {
    return this.hasBuilt
  }

  private findStartIndex(minTick: number): number {
    const searchTick = minTick - this.maxNoteDuration
    return lowerBound(this.indexedNotes, searchTick)
  }

  private noteOverlapsTickRange(note: Note, minTick: number, maxTick: number): boolean {
    return note.startTick < maxTick && note.visualEndTick > minTick
  }

  private assertValidViewport(viewport: CameraViewport): void {
    if (viewport.maxTick < viewport.minTick) {
      throw new SpatialIndexError('Viewport tick bounds are invalid.', 'INVALID_VIEWPORT', viewport)
    }
  }
}

function lowerBound(indexedNotes: IndexedNote[], targetTick: number): number {
  let low = 0
  let high = indexedNotes.length

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (indexedNotes[mid].note.startTick < targetTick) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

export const spatialIndex = new SpatialIndex()
export { SpatialIndexError }
