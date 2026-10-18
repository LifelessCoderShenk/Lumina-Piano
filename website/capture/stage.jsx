import React from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasArea } from '../../src/components/CanvasArea/CanvasArea'

// Use the actual app renderer in a dedicated 16:9 capture surface.
// The sidebar-sized canvas made all 88 keys too narrow for their height.
createRoot(document.getElementById('root')).render(
  <CanvasArea engine="three" aspectRatioOverride="16:9" keyboardHeightRatio={0.22} />
)
import { applyVisualStyle, BUILT_IN_VISUAL_STYLE_PRESETS } from '../../src/store/visualStylePresets'
import { parseMidi } from '../../src/midi/parser'
import { buildTempoMap } from '../../src/tempo/tempoMap'
import { useAppStore } from '../../src/store/store'
import { spatialIndex } from '../../src/spatial/SpatialIndex'
import { playbackEngine } from '../../src/playback/PlaybackEngine'
const bytes = new Uint8Array(await (await fetch('/test-midis/moonlight.mid')).arrayBuffer())
const project = parseMidi(bytes)
const tempo = buildTempoMap(project.tempoMap, project.ticksPerQuarter)
spatialIndex.build(project)
playbackEngine.init(tempo)
useAppStore.getState().loadProject(project, tempo)
playbackEngine.seek(18000)


// Capture the genuine WebGL output; controls live outside the recorded canvas.
const toolbar = document.createElement('div')
Object.assign(toolbar.style, { position: 'fixed', top: '8px', right: '12px', zIndex: '99999', display: 'flex', gap: '8px', background: '#151515', padding: '8px' })
for (const [name, mode, color, tick] of [
  ['concert', 'single', '#5ac8fa', 105000],
  ['aurora', 'pitchClass', '#329bff', 160000],

]) {
  const button = document.createElement('button')
  button.textContent = `Record ${name} demo`
  button.onclick = async () => {
    const state = useAppStore.getState()
    state.batchUpdate(draft => applyVisualStyle(draft, BUILT_IN_VISUAL_STYLE_PRESETS[name === 'concert' ? 1 : 2].style))
    state.setNoteGlow(75)
    state.setParticleSettings({ density: 45, glow: 100, size: 70 })
    state.setCreateNoteColorMode(mode)
    state.setCreateSingleNoteColor(color)
    playbackEngine.seek(tick)
    const canvas = document.querySelector('canvas')
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 16000000 })
    const chunks = []
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop())
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      link.download = `lumina-${name}-showcase.webm`
      link.textContent = `Save ${name} video`
      toolbar.append(link)
      button.disabled = false
      button.textContent = `Record ${name} demo`
    }
    button.disabled = true
    button.textContent = 'Recording 18 seconds…'
    recorder.start()
    playbackEngine.play()
    setTimeout(() => { recorder.stop(); playbackEngine.pause() }, 18000)
  }
  toolbar.append(button)
}
document.body.append(toolbar)
