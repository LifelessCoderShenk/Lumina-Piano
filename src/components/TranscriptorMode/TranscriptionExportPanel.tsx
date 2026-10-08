import { useRef, useState } from 'react'
import { ChevronDown, Download, X } from 'lucide-react'
import { AppIcon } from '../AppIcon/AppIcon'
import type { TranscriptionExportFormat } from '../../transcription/exportTranscription'
import type { TranscriptionSettings } from '../../transcription/types'
import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from '../../transcription/videoExportSettings'
import styles from './TranscriptorMode.module.css'

interface Props {
  settings: TranscriptionSettings
  format: TranscriptionExportFormat
  takeName: string
  disabled: boolean
  exporting: boolean
  progress: number
  hasRecordedAudio: boolean
  onFormatChange: (format: TranscriptionExportFormat) => void
  onSettingsChange: (patch: Partial<TranscriptionSettings>) => void
  onOpen: () => void
  onExport: () => void
  onCancel: () => void
}

export function TranscriptionExportPanel({ settings, format, takeName, disabled, exporting, progress, hasRecordedAudio, onFormatChange, onSettingsChange, onOpen, onExport, onCancel }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const video = format === 'mp4' || format === 'webm'
  const audio = video || format === 'mp3'
  const missingAudio = audio && settings.exportAudioMix === 'recorded' && !hasRecordedAudio
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <>
    <div className={`${styles.toolbarGroup} ${styles.toolbarExport}`}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls="transcription-export-panel" disabled={disabled || exporting} onClick={() => { if (!open) onOpen(); setOpen(!open) }}><AppIcon icon={Download} size={16} /> Export <AppIcon icon={ChevronDown} size={16} /></button>
    </div>
    {open && <section id="transcription-export-panel" className={styles.exportPanel} aria-label="Transcription export options" onKeyDown={(event) => { if (event.key === 'Escape' && !exporting) { event.stopPropagation(); close() } }}>
      <header className={styles.exportHeader}><span>{takeName}</span><button type="button" aria-label="Close export options" disabled={exporting} onClick={close}><AppIcon icon={X} size={16} /></button></header>
      <div className={styles.exportFields}>
        <label>Format <select aria-label="Transcription export format" value={format} onChange={(event) => onFormatChange(event.target.value as TranscriptionExportFormat)} disabled={exporting}><option value="pdf">PDF sheet music</option><option value="mid">MIDI</option><option value="mp3">MP3 audio</option><option value="mp4">MP4 performance video</option><option value="webm">WebM performance video</option></select></label>
        {format !== 'pdf' && <label>Timing <select aria-label="Export timing" value={settings.exportTiming ?? 'edited'} disabled={exporting} onChange={(event) => onSettingsChange({ exportTiming: event.target.value as 'original' | 'edited' })}><option value="edited">Edited take</option><option value="original">Original performance</option></select></label>}
        {audio && <label>Audio <select aria-label="Export audio mix" value={settings.exportAudioMix ?? 'combined'} disabled={exporting} onChange={(event) => onSettingsChange({ exportAudioMix: event.target.value as TranscriptionSettings['exportAudioMix'] })}><option value="combined">Piano + inputs</option><option value="recorded">Inputs only</option><option value="synth">Piano only</option></select></label>}
        {audio && settings.exportAudioMix !== 'recorded' && <label>Piano level <span className={styles.exportLevel}><input aria-label="Piano volume" type="range" min="0" max="2" step="0.05" value={settings.pianoVolume ?? 1} disabled={exporting} onChange={(event) => onSettingsChange({ pianoVolume: Number(event.target.value) })} /><output>{Math.round((settings.pianoVolume ?? 1) * 100)}%</output></span></label>}
        <div className={styles.exportSubmit}>
          {video && <span className={styles.exportVideoSummary}>{VIDEO_WIDTH} × {VIDEO_HEIGHT} · {VIDEO_FPS} fps</span>}
          <button type="button" disabled={disabled || exporting || missingAudio} aria-describedby={missingAudio ? 'transcription-export-warning' : undefined} onClick={onExport}>{exporting ? `Exporting… ${Math.round(progress * 100)}%` : 'Export file'}</button>
          {exporting && video && <button type="button" onClick={onCancel}>Cancel export</button>}
        </div>
      </div>
      {missingAudio && <p id="transcription-export-warning" role="status" className={styles.exportWarning}>This take has no recorded audio. Choose Piano only or Piano + inputs.</p>}
    </section>}
  </>
}
