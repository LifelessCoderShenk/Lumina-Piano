import { describe, expect, it } from 'vitest'

import { parseMusicXml } from './parser'

describe('MusicXML parser', () => {
  it('imports parts, chords, voices, tempo, meter, accidentals, and ties', () => {
    const project = parseMusicXml(`<?xml version="1.0"?>
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <direction><sound tempo="90"/></direction>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
          <note><chord/><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><tie type="start"/></note>
        </measure><measure number="2">
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><tie type="stop"/></note>
        </measure></part>
      </score-partwise>`)

    expect(project.tracks[0].name).toBe('Piano')
    expect(project.tracks[0].notes.map(({ pitch, startTick, endTick }) => ({ pitch, startTick, endTick }))).toEqual([
      { pitch: 60, startTick: 0, endTick: 480 },
      { pitch: 63, startTick: 0, endTick: 480 },
      { pitch: 67, startTick: 480, endTick: 1440 },
    ])
    expect(project.tempoMap[0]).toMatchObject({ tick: 0, bpm: 90 })
    expect(project.timeSignatures[0]).toEqual({ tick: 0, numerator: 3, denominator: 4 })
    expect(project.totalTicks).toBe(1440)
  })

  it('rejects malformed or unsupported score roots', () => {
    expect(() => parseMusicXml('<score-timewise/>')).toThrow('partwise MusicXML')
  })
})
