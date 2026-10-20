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
   applyVisualStyle(s,BUILT_IN_VISUAL_STYLE_PRESETS[0].style)
   s.handVisualization={enabled:true,opacity:65}
   s.visualizerSettings={...s.visualizerSettings,aspectRatio:'16:9',resolution:'1080p',framerate:30}
  })
  const engine=new ExportEngine()
  engine.onProgress(p=>{button.textContent=`Rendering ${Math.round(p.progress*100)}%`})
  await engine.export({outputPath:'/capture/workflow-performance.mp4',includeAudio:true})
  button.textContent='Render complete'
 }catch(error){button.disabled=false;button.textContent=String(error)}
}
document.body.append(button)
