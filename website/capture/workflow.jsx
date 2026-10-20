import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/App'
import { installStub } from '../../src/preload/stub'
import { useAppStore } from '../../src/store/store'
import '../../src/styles/designTokens.css'
import { Midi } from '@tonejs/midi'
// Adapt the native file bridge for this local-only demonstration. Real app UI,
// parser, editor, renderer, export engine and audio renderer remain unchanged.
installStub()
const bytes=new Uint8Array(await (await fetch('/website/public/media/lumina-miniature.mid')).arrayBuffer())
const midi=new Midi(bytes)
const melody=midi.tracks.find(t=>t.notes.some(n=>n.midi===76 && n.time===0))
melody.notes.find(n=>n.midi===76 && n.time===0).midi=77
const staged=midi.toArray()
const write=async(file,data)=>{
 const response=await fetch('/capture-export/write?name='+encodeURIComponent(file.split(/[\\/]/).pop()),{method:'POST',body:new Uint8Array(data)})
 if(!response.ok)throw new Error(await response.text())
}
window.electronAPI.openMidiFile=async()=>'/capture/lumina-miniature.mid'
window.electronAPI.dialog.openMidiFile=window.electronAPI.openMidiFile
window.electronFS.readFile=async()=>staged
window.electronFS.mkdir=async()=>{}
// Keep capture intermediates for verification; no deletion performed.
window.electronFS.rm=async()=>{}
window.electronFS.writeFile=write
window.electronAPI.export.getTempDir=async()=>'/capture'
window.electronAPI.export.saveFile=async({buffer,outputPath})=>write(outputPath,buffer)
window.electronAPI.dialog.getDefaultExportPath=async()=>'/capture/workflow-performance.mp4'
window.electronAPI.dialog.showSaveDialog=async()=>'/capture/workflow-performance.mp4'
window.electronAPI.ffmpeg.run=async()=>{
 const response=await fetch('/capture-export/combine',{method:'POST'})
 if(!response.ok)throw new Error(await response.text())
}
useAppStore.getState().setHandVisualization({enabled:true,opacity:65})
createRoot(document.getElementById('root')).render(<App />)
