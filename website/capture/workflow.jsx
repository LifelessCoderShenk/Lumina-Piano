import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/App'
import { installStub } from '../../src/preload/stub'
import { useAppStore } from '../../src/store/store'
import '../../src/styles/designTokens.css'
import { applyVisualStyle, BUILT_IN_VISUAL_STYLE_PRESETS } from '../../src/store/visualStylePresets'
import { playbackEngine } from '../../src/playback/PlaybackEngine'
import { audioScheduler } from '../../src/audio/AudioScheduler'
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
useAppStore.getState().batchUpdate(state => {
 applyVisualStyle(state, BUILT_IN_VISUAL_STYLE_PRESETS.find(preset => preset.id === 'builtin-aurora-glass').style)
 state.backgroundStyle = 'stage'
 state.noteGlow = 85
 state.lightingIntensity = 115
 state.keyboardSaber = true
 state.laneOpacity = 0
 state.noteLabelsOnKeys = false
 state.noteLabelsOnNotes = false
 state.particleSettings = {...state.particleSettings,enabled:true,density:85,glow:120,lifetime:165,size:75,speed:115,spread:110}
 state.handVisualization = {enabled:true,opacity:78}
 state.visualizerSettings = {...state.visualizerSettings,aspectRatio:'16:9',resolution:'1080p',framerate:60}
})
// Local capture control: animate the real renderer without starting audio.
const silentPreview = document.createElement('button')
silentPreview.textContent = 'Preview silently'
Object.assign(silentPreview.style, {position:'fixed',top:'10px',right:'48px',zIndex:1000,padding:'8px 12px',borderRadius:'18px',background:'#17171b',color:'#f5f5f7',border:'1px solid #555',cursor:'pointer'})
silentPreview.onclick = () => {
 if (!useAppStore.getState().projectData) return
 audioScheduler.stop()
 if (useAppStore.getState().isPlaying) playbackEngine.pause()
 else {
  if (useAppStore.getState().currentTick >= useAppStore.getState().projectData.totalTicks) playbackEngine.seek(0)
  playbackEngine.play()
 }
 silentPreview.textContent = useAppStore.getState().isPlaying ? 'Pause silent preview' : 'Preview silently'
}
const syncPreviewButton = state => {
 silentPreview.disabled = !state.projectData
 silentPreview.textContent = state.isPlaying ? 'Pause silent preview' : 'Preview silently'
}
syncPreviewButton(useAppStore.getState())
const unsubscribePreview = useAppStore.subscribe(syncPreviewButton)
window.addEventListener('pagehide', unsubscribePreview, {once:true})
if (!new URLSearchParams(location.search).has('stills')) document.body.append(silentPreview)
createRoot(document.getElementById('root')).render(<App />)
