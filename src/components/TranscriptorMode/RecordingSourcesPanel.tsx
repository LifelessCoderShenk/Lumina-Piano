import { Camera, Mic2, Plus, Trash2 } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import type { TranscriptionMediaRole, TranscriptionMediaSource, TranscriptionSettings } from '../../transcription/types'
import { defaultVideoOverlay } from '../../transcription/settings'
import type { TranscriptionMediaSourceState } from './useTranscriptionMedia'
import styles from './TranscriptorMode.module.css'

interface Props {
  settings: TranscriptionSettings
  devices: readonly MediaDeviceInfo[]
  disabled: boolean
  sourceStates?: readonly TranscriptionMediaSourceState[]
  message?: string | null
  onChange: (patch: Partial<TranscriptionSettings>) => void
}

export function RecordingSourcesPanel({ settings, devices, disabled, sourceStates = [], message = null, onChange }: Props) {
  const sources = [...(settings.mediaSources ?? [])]
  const videoDevices = devices.filter((device) => device.kind === 'videoinput')
  const audioDevices = devices.filter((device) => device.kind === 'audioinput')
  const update = (id: string, patch: Partial<TranscriptionMediaSource>) => onChange({ mediaSources: sources.map((source) => source.id === id ? { ...source, ...patch } : source) })
  const remove = (id: string) => onChange({ mediaSources: sources.filter((source) => source.id !== id) })
  const add = (kind: 'video' | 'audio', role: TranscriptionMediaRole = kind === 'video' ? 'face' : 'microphone') => {
    const count = sources.filter((source) => source.kind === kind).length
    const deviceList = kind === 'video' ? videoDevices : audioDevices
    const used = new Set(sources.filter((source) => source.kind === kind).map((source) => source.deviceId))
    const nextDevice = deviceList.find((device) => !used.has(device.deviceId))?.deviceId ?? null
    const source: TranscriptionMediaSource = {
      id: createSourceId(kind), kind, role,
      name: role === 'piano' ? (kind === 'video' ? 'Piano camera' : 'Piano audio') : kind === 'video' ? `Camera ${count + 1}` : `Audio ${count + 1}`,
      deviceId: nextDevice, enabled: true, volume: 1, latencyMs: 0,
      ...(kind === 'video' ? { overlay: defaultVideoOverlay(role, count) } : {}),
    }
    onChange({ mediaSources: [...sources, source] })
  }
  const addPianoSetup = () => {
    const next = [...sources]
    if (!next.some((source) => source.kind === 'video' && source.role === 'piano')) {
      const used = new Set(next.filter((source) => source.kind === 'video').map((source) => source.deviceId))
      next.push({ id: createSourceId('video'), kind: 'video', role: 'piano', name: 'Piano camera', deviceId: videoDevices.find((device) => !used.has(device.deviceId))?.deviceId ?? null, enabled: true, volume: 1, latencyMs: 0, overlay: defaultVideoOverlay('piano') })
    }
    if (!next.some((source) => source.kind === 'audio' && source.role === 'piano')) {
      const used = new Set(next.filter((source) => source.kind === 'audio').map((source) => source.deviceId))
      next.push({ id: createSourceId('audio'), kind: 'audio', role: 'piano', name: 'Piano audio', deviceId: audioDevices.find((device) => !used.has(device.deviceId))?.deviceId ?? null, enabled: true, volume: 1, latencyMs: 0 })
    }
    onChange({ mediaSources: next })
  }

  return <fieldset disabled={disabled} className={`${styles.optionsGrid} ${styles.sourcesFieldset} ${styles.optionCard}`}>
    <legend>Cameras & audio</legend>
    <div className={styles.sourceButtons}>
      <button type="button" aria-label="Add piano setup" onClick={addPianoSetup}><AppIcon icon={Plus} size={16} /> Piano</button>
      <button type="button" aria-label="Add video" onClick={() => add('video')}><AppIcon icon={Camera} size={16} /> Camera</button>
      <button type="button" aria-label="Add audio" onClick={() => add('audio')}><AppIcon icon={Mic2} size={16} /> Audio</button>
    </div>
    {sources.length > 0 && <div className={styles.sourceList}>
      {sources.map((source) => {
        const choices = source.kind === 'video' ? videoDevices : audioDevices
        const overlay = source.overlay ?? defaultVideoOverlay(source.role, sources.filter((candidate) => candidate.kind === 'video').indexOf(source))
        const state = sourceStates.find((entry) => entry.source.id === source.id)
        const status = !source.enabled ? 'Off' : state?.status === 'ready' ? 'Ready' : state?.status === 'loading' ? 'Connecting…' : state?.status === 'error' ? 'Unavailable' : 'Waiting'
        return <div className={styles.sourceRow} key={source.id}>
          <div className={styles.sourceHeader}>
            <span className={styles.sourceKind}><AppIcon icon={source.kind === 'video' ? Camera : Mic2} size={16} />{source.name}</span>
            <span className={`${styles.sourceStatus} ${state?.status === 'error' ? styles.sourceStatusError : ''}`} title={state?.message ?? status} aria-live="polite">{status}</span>
            <label className={styles.sourceToggle}><input aria-label={`Use ${source.name}`} type="checkbox" checked={source.enabled} onChange={(event) => update(source.id, { enabled: event.target.checked })} /> On</label>
            <button className={styles.sourceRemove} type="button" title={`Remove ${source.name}`} aria-label={`Remove ${source.name}`} onClick={() => remove(source.id)}><AppIcon icon={Trash2} size={16} /></button>
          </div>
          <select className={styles.sourceDevice} aria-label={`${source.name} device`} value={source.deviceId ?? ''} onChange={(event) => update(source.id, { deviceId: event.target.value || null })}>
            <option value="">Default {source.kind === 'video' ? 'camera' : 'input'}</option>
            {choices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${source.kind === 'video' ? 'Camera' : 'Audio input'} ${index + 1}`}</option>)}
          </select>
          <select className={styles.sourceRole} aria-label={`${source.name} role`} value={source.role} onChange={(event) => {
            const role = event.target.value as TranscriptionMediaRole
            update(source.id, { role, ...(source.kind === 'video' ? { overlay: defaultVideoOverlay(role) } : {}) })
          }}>
            {source.kind === 'video' ? <><option value="face">Face</option><option value="piano">Piano</option><option value="overhead">Overhead</option><option value="other">Other</option></> : <><option value="piano">Piano</option><option value="microphone">Microphone</option><option value="room">Room</option><option value="other">Other</option></>}
          </select>
          {state?.status === 'error' && state.message && <p className={styles.sourceError} role="status">{state.message}</p>}
          <details className={styles.sourceAdvanced}>
            <summary>{source.kind === 'video' ? 'Frame' : 'Level & sync'}</summary>
            <div className={styles.sourceAdvancedBody}>
              <label className={styles.optionRow}><span>Name</span><input className={styles.sourceName} aria-label={`${source.name} name`} value={source.name} maxLength={60} onChange={(event) => update(source.id, { name: event.target.value })} /></label>
              {source.kind === 'video' ? <div className={styles.sourceAdjustments}>
                <label>Width <input aria-label={`${source.name} width`} type="range" min="0.15" max="1" step="0.01" value={overlay.width} onChange={(event) => update(source.id, { overlay: { ...overlay, width: Number(event.target.value), x: Math.min(overlay.x, 1 - Number(event.target.value)) } })} /></label>
                <label>Height <input aria-label={`${source.name} height`} type="range" min="0.12" max="1" step="0.01" value={overlay.height ?? defaultVideoOverlay(source.role).height} onChange={(event) => update(source.id, { overlay: { ...overlay, height: Number(event.target.value), y: Math.min(overlay.y, 1 - Number(event.target.value)) } })} /></label>
                <label>Zoom <input aria-label={`${source.name} zoom crop`} type="range" min="0" max="0.35" step="0.01" value={overlay.crop} onChange={(event) => update(source.id, { overlay: { ...overlay, crop: Number(event.target.value) } })} /></label>
                <label>Vertical <input aria-label={`${source.name} crop position`} type="range" min="0" max="1" step="0.01" value={overlay.cropY ?? .5} onChange={(event) => update(source.id, { overlay: { ...overlay, cropY: Number(event.target.value) } })} /></label>
                <label className={styles.sourceToggle}><input type="checkbox" checked={overlay.mirror} onChange={(event) => update(source.id, { overlay: { ...overlay, mirror: event.target.checked } })} /> Mirror</label>
              </div> : <div className={styles.sourceAdjustments}>
                <label>Level <input type="range" min="0" max="2" step="0.05" value={source.volume} onChange={(event) => update(source.id, { volume: Number(event.target.value) })} /></label>
                <label>Sync <span className={styles.valueWithUnit}><input type="number" min="-2000" max="2000" value={source.latencyMs} onChange={(event) => update(source.id, { latencyMs: Number(event.target.value) })} /><small>ms</small></span></label>
              </div>}
            </div>
          </details>
        </div>
      })}
    </div>}
    {message && <p className={styles.inputNotice} role="status">{message}</p>}
  </fieldset>
}

function createSourceId(kind: 'video' | 'audio'): string {
  return `${kind}-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}
