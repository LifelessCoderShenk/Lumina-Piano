import React from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import { Midi } from '@tonejs/midi'
import { CanvasArea } from '../../src/components/CanvasArea/CanvasArea'
import { parseMidi } from '../../src/midi/parser'
import { buildTempoMap } from '../../src/tempo/tempoMap'
import { useAppStore } from '../../src/store/store'
import { spatialIndex } from '../../src/spatial/SpatialIndex'
import { playbackEngine } from '../../src/playback/PlaybackEngine'
import { audioScheduler } from '../../src/audio/AudioScheduler'
import { applyVisualStyle, BUILT_IN_VISUAL_STYLE_PRESETS } from '../../src/store/visualStylePresets'

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
const project = parseMidi(midi.toArray())
project.totalTicks += project.ticksPerQuarter * 4
const tempo = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
spatialIndex.build(project); playbackEngine.init(tempo)
useAppStore.getState().loadProject(project,tempo)
useAppStore.getState().batchUpdate(s=>applyVisualStyle(s,BUILT_IN_VISUAL_STYLE_PRESETS[0].style))
useAppStore.getState().setCreateNoteColorMode('single')
useAppStore.getState().setCreateSingleNoteColor('#60bfff')
useAppStore.getState().setNoteGlow(65)
createRoot(document.getElementById('root')).render(<CanvasArea engine="three" aspectRatioOverride="16:9" keyboardHeightRatio={.22}/> )
const button=document.createElement('button')
button.textContent='Record original performance with audio'
Object.assign(button.style,{position:'fixed',top:'8px',right:'12px',zIndex:'99999',padding:'12px'})
button.onclick=async()=>{
 try {
  button.disabled=true; button.textContent='Loading actual piano samples…'
  if(!audioScheduler.isReady()) await audioScheduler.init()
  await Tone.start()
  const destination=Tone.getContext().rawContext.createMediaStreamDestination()
  Tone.getDestination().connect(destination)
  const stream=document.querySelector('canvas').captureStream(30)
  destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track))
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:12000000,audioBitsPerSecond:192000})
  const chunks=[]
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
  recorder.onstop=()=>{
   Tone.getDestination().disconnect(destination)
   stream.getTracks().forEach(t=>t.stop())
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));a.download='lumina-original-performance.webm';a.textContent='Save performance with audio'
   Object.assign(a.style,{position:'fixed',top:'55px',right:'12px',zIndex:'99999',background:'white',padding:'12px'})
   document.body.append(a);button.textContent='Recording finished'
  }
  playbackEngine.seek(0);recorder.start();playbackEngine.play()
  button.textContent='Recording 26 seconds with piano audio…'
  setTimeout(()=>{recorder.stop();playbackEngine.pause()},26000)
 }catch(error){button.textContent=String(error);button.disabled=false}
}
document.body.append(button)
