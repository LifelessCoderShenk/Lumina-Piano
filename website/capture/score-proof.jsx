import React from 'react'
import { createRoot } from 'react-dom/client'
import { Midi } from '@tonejs/midi'
import { createScorePrintHtml, createTranscriptionMidi } from '../../src/transcription/exportTranscription'
// Original eight-bar demo phrase, authored for the website; rendered by Lumina.
const midi = new Midi()
midi.header.setTempo(80)
const left = midi.addTrack(); left.name = 'Left hand'
const right = midi.addTrack(); right.name = 'Melody'
const chords = [[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59],[48,55,60,64],[41,48,53,57],[43,50,55,59],[48,55,60,64]]
const melody = [[76,79,74,72],[76,72,71,69],[72,77,76,72],[71,74,79,77],[76,79,84,79],[77,76,74,72],[71,74,77,71],[72]]
chords.forEach((chord, bar) => {
  if (bar === 7) chord.forEach(pitch => left.addNote({midi:pitch,time:bar*3,duration:2.8,velocity:.5}))
  else [0,1,2,3,2,1,2,1].forEach((index, step) => left.addNote({midi:chord[index],time:bar*3+step*.375,duration:.55,velocity:.42+(step%3)*.035}))
  melody[bar].forEach((pitch, beat) => right.addNote({midi:pitch,time:bar*3+beat*.75,duration:bar===7?2.8:.67,velocity:.68+(beat%2)*.05}))
})

const notes=midi.tracks.flatMap((track,channel)=>track.notes.map((note,i)=>({id:`${channel}-${i}`,pitch:note.midi,velocity:Math.round(note.velocity*127),channel,startMs:note.time*1000,endMs:(note.time+note.duration)*1000})))
const settings={title:'Lumina - Original piano miniature',bpm:80,meter:'4/4',chordNamesEnabled:false,keyLabelsEnabled:false,midiDeviceId:null,quantization:'eighth',keySignature:'C',staffSplit:60,minimumNoteMs:30,chordToleranceMs:30}
const html=await createScorePrintHtml(notes,settings)
const midiBytes=createTranscriptionMidi(notes,settings)
createRoot(document.getElementById('root')).render(<div style={{width:'100%',height:'100%',background:'#fff'}}><iframe title="Actual Lumina print export" srcDoc={html} style={{width:'100%',height:'100%',border:0}}/><a aria-label="Download demo MIDI" href={'data:audio/midi;base64,'+btoa(String.fromCharCode(...midiBytes))} download="lumina-miniature.mid" style={{position:'fixed',top:8,right:8}}>Download demo MIDI</a></div>)
