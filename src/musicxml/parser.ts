import type { Note, ProjectData, TempoEvent, TimeSignatureEvent, Track } from '../midi/types'

const TICKS_PER_QUARTER = 480
const STEP_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function parseMusicXml(text: string): ProjectData {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror') != null || xml.documentElement.localName !== 'score-partwise') {
    throw new Error('This file is not a valid partwise MusicXML score.')
  }
  const partNames = new Map(Array.from(xml.querySelectorAll('score-part')).map((part) => [
    part.getAttribute('id') ?? '', part.querySelector('part-name')?.textContent?.trim() || 'Part',
  ]))
  const tempoEvents: TempoEvent[] = []
  const timeSignatures: TimeSignatureEvent[] = []
  const tracks = Array.from(xml.documentElement.children)
    .filter((element) => element.localName === 'part')
    .map((part, index) => parsePart(part, index, partNames, tempoEvents, timeSignatures))
  if (tracks.length === 0) throw new Error('The MusicXML score does not contain any parts.')
  const totalTicks = Math.max(0, ...tracks.flatMap((track) => track.notes.map((note) => note.endTick)))
  return {
    tracks,
    tempoMap: uniqueByTick(tempoEvents.length > 0 ? tempoEvents : [tempoEvent(0, 120)]),
    timeSignatures: uniqueByTick(timeSignatures.length > 0 ? timeSignatures : [{ tick: 0, numerator: 4, denominator: 4 }]),
    totalTicks,
    ticksPerQuarter: TICKS_PER_QUARTER,
  }
}

function parsePart(
  part: Element,
  partIndex: number,
  partNames: Map<string, string>,
  tempos: TempoEvent[],
  signatures: TimeSignatureEvent[],
): Track {
  let cursor = 0
  let divisions = 1
  let lastNoteStart = 0
  let noteIndex = 0
  const notes: Note[] = []
  const openTies = new Map<string, Note>()
  for (const measure of Array.from(part.children).filter((element) => element.localName === 'measure')) {
    for (const item of Array.from(measure.children)) {
      if (item.localName === 'attributes') {
        divisions = positiveNumber(item.querySelector('divisions')?.textContent, divisions)
        const numerator = positiveNumber(item.querySelector('time > beats')?.textContent, 0)
        const denominator = positiveNumber(item.querySelector('time > beat-type')?.textContent, 0)
        if (numerator > 0 && denominator > 0) signatures.push({ tick: cursor, numerator, denominator })
      } else if (item.localName === 'backup') {
        cursor = Math.max(0, cursor - scaleDuration(item.querySelector('duration')?.textContent, divisions))
      } else if (item.localName === 'forward') {
        cursor += scaleDuration(item.querySelector('duration')?.textContent, divisions)
      } else if (item.localName === 'direction') {
        const bpm = Number(item.querySelector('sound')?.getAttribute('tempo') ?? item.querySelector('per-minute')?.textContent)
        if (Number.isFinite(bpm) && bpm > 0) tempos.push(tempoEvent(cursor, bpm))
      } else if (item.localName === 'note') {
        const duration = scaleDuration(item.querySelector('duration')?.textContent, divisions)
        const isChord = item.querySelector('chord') != null
        const startTick = isChord ? lastNoteStart : cursor
        if (!isChord) lastNoteStart = startTick
        if (item.querySelector('rest') == null && item.querySelector('pitch') != null) {
          const pitch = parsePitch(item)
          const voice = item.querySelector('voice')?.textContent?.trim() ?? '1'
          const tieKey = `${voice}:${pitch}`
          const tieStop = item.querySelector('tie[type="stop"]') != null
          const tieStart = item.querySelector('tie[type="start"]') != null
          const tiedNote = tieStop ? openTies.get(tieKey) : undefined
          if (tiedNote != null) {
            tiedNote.endTick = startTick + duration
            tiedNote.visualEndTick = tiedNote.endTick
            if (!tieStart) openTies.delete(tieKey)
          } else {
            const note: Note = {
              id: `xml-${partIndex}-${noteIndex++}`,
              pitch,
              startTick,
              endTick: startTick + Math.max(1, duration),
              visualEndTick: startTick + Math.max(1, duration),
              velocity: clamp(Math.round(Number(item.querySelector('sound')?.getAttribute('dynamics') ?? 80)), 1, 127),
            }
            notes.push(note)
            if (tieStart) openTies.set(tieKey, note)
          }
        }
        if (!isChord) cursor += duration
      }
    }
  }
  const id = part.getAttribute('id') || `part-${partIndex + 1}`
  return { id, name: partNames.get(id) ?? `Part ${partIndex + 1}`, channel: partIndex % 16, notes }
}

function parsePitch(note: Element): number {
  const step = note.querySelector('pitch > step')?.textContent?.trim().toUpperCase() ?? ''
  const octave = Number(note.querySelector('pitch > octave')?.textContent)
  const alter = Number(note.querySelector('pitch > alter')?.textContent ?? 0)
  if (!(step in STEP_PITCH) || !Number.isFinite(octave) || !Number.isFinite(alter)) throw new Error('The score contains an invalid pitch.')
  return clamp((octave + 1) * 12 + STEP_PITCH[step] + alter, 0, 127)
}

function scaleDuration(value: string | null | undefined, divisions: number): number {
  const duration = Number(value ?? 0)
  return Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration / divisions * TICKS_PER_QUARTER)) : 0
}

function positiveNumber(value: string | null | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function tempoEvent(tick: number, bpm: number): TempoEvent {
  return { tick, bpm, microsecondsPerBeat: Math.round(60_000_000 / bpm) }
}

function uniqueByTick<T extends { tick: number }>(events: T[]): T[] {
  return [...new Map(events.sort((a, b) => a.tick - b.tick).map((event) => [event.tick, event])).values()]
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
