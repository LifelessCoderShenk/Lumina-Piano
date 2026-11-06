import type { ProjectData } from '../midi/types'

export function validateProjectTimeline(project: ProjectData): void {
  const fail = () => { throw new Error('This project contains invalid note or tempo data.') }
  if (project.ticksPerQuarter <= 0 || project.totalTicks < 0
    || !Array.isArray(project.tempoMap) || project.tempoMap.length === 0
    || !Array.isArray(project.timeSignatures)) fail()
  let previousTick = -1
  for (const tempo of project.tempoMap) {
    if (!tempo || !Number.isFinite(tempo.tick) || tempo.tick < 0 || tempo.tick < previousTick
      || !Number.isFinite(tempo.microsecondsPerBeat) || tempo.microsecondsPerBeat <= 0
      || !Number.isFinite(tempo.bpm) || tempo.bpm <= 0) fail()
    previousTick = tempo.tick
  }
  previousTick = -1
  for (const signature of project.timeSignatures) {
    if (!signature || !Number.isFinite(signature.tick) || signature.tick < 0 || signature.tick < previousTick
      || !Number.isInteger(signature.numerator) || signature.numerator <= 0
      || !Number.isInteger(signature.denominator) || signature.denominator <= 0
      || !Number.isInteger(Math.log2(signature.denominator))) fail()
    previousTick = signature.tick
  }
  const trackIds = new Set<string>()
  const noteIds = new Set<string>()
  for (const track of project.tracks) {
    if (typeof track.id !== 'string' || !track.id || trackIds.has(track.id)) fail()
    trackIds.add(track.id)
    for (const note of track.notes) {
      if (!note || typeof note.id !== 'string' || !note.id || noteIds.has(note.id)
        || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
        || !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 127
        || !Number.isFinite(note.startTick) || note.startTick < 0
        || !Number.isFinite(note.endTick) || note.endTick <= note.startTick
        || !Number.isFinite(note.visualEndTick) || note.visualEndTick < note.startTick
        || (note.sustainEndTick !== undefined && (!Number.isFinite(note.sustainEndTick) || note.sustainEndTick < note.endTick))) fail()
      noteIds.add(note.id)
    }
  }
}
