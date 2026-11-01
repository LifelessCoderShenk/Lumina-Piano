import { readFileSync, writeFileSync } from 'node:fs'
import { Midi } from '@tonejs/midi'

const media = new URL('../public/media/', import.meta.url)
const source = new Midi(readFileSync(new URL('chopin-fantaisie-impromptu.mid', media)))
const excerpt = new Midi()
excerpt.header.fromJSON(source.header.toJSON())
const start = source.header.ppq * 16
const end = source.header.ppq * 80
excerpt.header.tempos = [{ ticks: 0, bpm: source.header.tempos[0].bpm }]
excerpt.header.update()
for (const sourceTrack of source.tracks) {
  const track = excerpt.addTrack()
  track.name = sourceTrack.name
  track.instrument.number = 0
  for (const note of sourceTrack.notes) {
    if (note.ticks < start || note.ticks >= end) continue
    track.addNote({ midi: note.midi, ticks: note.ticks - start,
      durationTicks: Math.min(note.durationTicks, end - note.ticks), velocity: note.velocity })
  }
}
writeFileSync(new URL('chopin-showcase-excerpt.mid', media), Buffer.from(excerpt.toArray()))
console.log(`${excerpt.tracks.reduce((sum, track) => sum + track.notes.length, 0)} notes, ${excerpt.duration.toFixed(2)} seconds`)
