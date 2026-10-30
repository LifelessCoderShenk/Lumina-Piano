import React from 'react'
import {createRoot} from 'react-dom/client'
import {CanvasArea} from '../../src/components/CanvasArea/CanvasArea'
import {loadMidiBytes} from '../../src/midi/loadMidiProject'
import {useAppStore} from '../../src/store/store'
import {applyVisualStyle, BUILT_IN_VISUAL_STYLE_PRESETS} from '../../src/store/visualStylePresets'
import {ExportEngine} from '../../src/export/ExportEngine'
import {installStub} from '../../src/preload/stub'
installStub()
const write=async(file,data)=>{
 const response=await fetch('/capture-export/write?name='+encodeURIComponent(file.split(/[\\/]/).pop()),{method:'POST',body:new Uint8Array(data)})
 if(!response.ok)throw new Error(await response.text())
}
window.electronFS.mkdir=async()=>{}
window.electronFS.rm=async()=>{}
window.electronFS.writeFile=write
window.electronAPI.export.getTempDir=async()=>'/capture'
window.electronAPI.export.saveFile=async({buffer,outputPath})=>write(outputPath,buffer)
window.electronAPI.ffmpeg.run=async()=>{
 const response=await fetch('/capture-export/combine',{method:'POST'})
 if(!response.ok)throw new Error(await response.text())
}
createRoot(document.getElementById('root')).render(<CanvasArea engine="three" aspectRatioOverride="16:9" keyboardHeightRatio={.22}/>)
const button=document.createElement('button')
button.textContent='Render revised hands'
Object.assign(button.style,{position:'fixed',top:'8px',right:'12px',padding:'12px',zIndex:1000})
button.onclick=async()=>{
 try {
  button.disabled=true
  await loadMidiBytes(new Uint8Array(await(await fetch('/website/public/media/lumina-miniature.mid')).arrayBuffer()))
  const state=useAppStore.getState()
  state.batchUpdate(s=>{
   applyVisualStyle(s,BUILT_IN_VISUAL_STYLE_PRESETS.find(p=>p.name==='Aurora Glass').style)
   // Showcase treatment: visible crystal interiors, fine lingering wisps,
   // and a restrained glow that retains saturated note colors.
   s.noteGlow=85
   s.backgroundStyle='stage'
   s.lightingIntensity=115
   s.keyboardSaber=true
   s.laneOpacity=0
   s.noteLabelsOnKeys=false
   s.noteLabelsOnNotes=false
   s.particleSettings={...s.particleSettings,enabled:true,density:85,glow:120,lifetime:165,size:75,speed:115,spread:110}
   s.handVisualization={enabled:true,opacity:78}
   s.visualizerSettings={...s.visualizerSettings,aspectRatio:'16:9',resolution:'1080p',framerate:60}
  })
  // Let React apply the generated-hand layout before taking the export snapshot.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  const engine=new ExportEngine()
  engine.onProgress(p=>{button.textContent=`Rendering ${Math.round(p.progress*100)}%`})
  await engine.export({outputPath:'/capture/workflow-performance.mp4',includeAudio:true})
  button.textContent='Render complete'
 }catch(error){button.disabled=false;button.textContent=String(error)}
}
document.body.append(button)
