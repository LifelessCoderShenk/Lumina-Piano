import { readFileSync, writeFileSync } from 'node:fs'
import toneMidi from '@tonejs/midi'
const { Midi } = toneMidi

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
  track.channel = sourceTrack.channel
  // This piano engraving puts pedal marks on the lower staff only, while
  // exporting each staff on a separate MIDI channel. Both share one pedal.
  const pedal = source.tracks.flatMap(staff => staff.controlChanges[64] ?? [])
    .sort((a, b) => a.ticks - b.ticks)
  const initialPedal = pedal.filter(event => event.ticks < start).at(-1)
  if (initialPedal) track.addCC({ number: 64, ticks: 0, value: initialPedal.value })
  for (const event of pedal) {
    if (event.ticks >= start && event.ticks < end)
      track.addCC({ number: 64, ticks: event.ticks - start, value: event.value })
  }
  if (pedal.length) track.addCC({ number: 64, ticks: end - start, value: 0 })
  for (const note of sourceTrack.notes) {
    if (note.ticks < start || note.ticks >= end) continue
    track.addNote({ midi: note.midi, ticks: note.ticks - start,
      durationTicks: Math.min(note.durationTicks, end - note.ticks), velocity: note.velocity })
  }
}
writeFileSync(new URL('chopin-showcase-excerpt.mid', media), Buffer.from(excerpt.toArray()))
console.log(`${excerpt.tracks.reduce((sum, track) => sum + track.notes.length, 0)} notes, ${excerpt.duration.toFixed(2)} seconds`)
