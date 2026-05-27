import type { ProjectData } from '../../midi/types'

export function computeDensityData(projectData: ProjectData, segments = 200): number[] {
  const totalTicks = projectData.totalTicks
  if (totalTicks <= 0 || segments <= 0) {
    return Array.from({ length: Math.max(segments, 0) }, () => 0)
  }

  const bucketSize = totalTicks / segments
  const counts = Array.from({ length: segments }, () => 0)

  for (const track of projectData.tracks) {
    for (const note of track.notes) {
      const bucketIndex = Math.min(
        segments - 1,
        Math.floor(note.startTick / bucketSize),
      )
      counts[bucketIndex] += 1
    }
  }

  const maxCount = Math.max(...counts, 1)
  return counts.map((count) => count / maxCount)
}
