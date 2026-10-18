import React from 'react'
import { createRoot } from 'react-dom/client'
import { Midi } from '@tonejs/midi'
import { CanvasArea } from '../../src/components/CanvasArea/CanvasArea'
import { CreateNoteEditor } from '../../src/components/CreateNoteEditor/CreateNoteEditor'
import { parseMidi } from '../../src/midi/parser'
import { buildTempoMap } from '../../src/tempo/tempoMap'
import { useAppStore } from '../../src/store/store'
import { spatialIndex } from '../../src/spatial/SpatialIndex'
import { playbackEngine } from '../../src/playback/PlaybackEngine'
const midi=new Midi();midi.header.setTempo(80)
const track=midi.addTrack();track.name='Correction demonstration';
// Deliberate F5 in place of E5. Only the app's editor will correct it.
[72,74,77,79,76,74,72].forEach((pitch,i)=>track.addNote({midi:pitch,time:i*.75,duration:.65,velocity:.7}))
const project=parseMidi(midi.toArray());const tempo=buildTempoMap(project.tempoMap,project.ticksPerQuarter)
spatialIndex.build(project);playbackEngine.init(tempo);useAppStore.getState().loadProject(project,tempo)
createRoot(document.getElementById('root')).render(<><CanvasArea engine="three" aspectRatioOverride="16:9" keyboardHeightRatio={.22}/><CreateNoteEditor/></>)

import { renderOfflineMidiAudioBuffer } from '../../src/audio/renderOfflineMidiAudio'
const save=document.createElement('button');save.textContent='Render phrase audio'
Object.assign(save.style,{position:'fixed',bottom:'80px',right:'20px',zIndex:100})
save.onclick=async()=>{
 save.disabled=true
 const state=useAppStore.getState()
 const pitch=state.projectData.tracks[0].notes[2].pitch
 const buffer=await renderOfflineMidiAudioBuffer(state,6)
 const samples=buffer.length,channels=buffer.numberOfChannels
 const data=new ArrayBuffer(44+samples*channels*2);const view=new DataView(data)
 const str=(offset,text)=>[...text].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)))
 str(0,'RIFF');view.setUint32(4,data.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,data.byteLength-44,true)
 for(let i=0;i<samples;i++)for(let c=0;c<channels;c++){const s=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]));view.setInt16(44+(i*channels+c)*2,s<0?s*32768:s*32767,true)}
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));a.download=`correction-${pitch===77?'before':'after'}.wav`;a.textContent=`Save ${pitch===77?'before':'after'} audio`;Object.assign(a.style,{position:'fixed',bottom:'115px',right:'20px',zIndex:100,background:'white'});document.body.append(a);save.disabled=false
}
document.body.append(save)
