import { KEY_SIGNATURES } from '../../transcription/settings'
import type { MidiDeviceDescriptor } from '../../midi/LiveMidiInputController'
import type { TranscriptionSettings } from '../../transcription/types'
import { RecordingSourcesPanel } from './RecordingSourcesPanel'
import type { TranscriptionMediaSourceState } from './useTranscriptionMedia'
import styles from './TranscriptorMode.module.css'

interface Props { settings: TranscriptionSettings; onChange: (patch: Partial<TranscriptionSettings>) => void; devices: readonly MediaDeviceInfo[]; sourceStates?: readonly TranscriptionMediaSourceState[]; midiDevices?: readonly MidiDeviceDescriptor[]; disabled: boolean; estimatedBpm: number | null; section?: 'all' | 'notation' | 'inputs'; compact?: boolean; midiMessage?: string | null; mediaMessage?: string | null }

export function TranscriptionOptions({ settings, onChange, devices, sourceStates = [], midiDevices = [], disabled, estimatedBpm, section = 'all', compact = false, midiMessage = null, mediaMessage = null }: Props) {
  const content = <>
    {section === 'inputs' && <fieldset disabled={disabled} className={`${styles.optionsGrid} ${styles.optionCard}`}>
      <legend>Playing input</legend>
      <label className={styles.optionRow}><span>MIDI</span><select aria-label="Transcription MIDI input" value={settings.midiDeviceId ?? ''} onChange={(event) => onChange({ midiDeviceId: event.target.value || null })}>
        <option value="">Mouse only</option>{midiDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
      </select></label>
      {midiMessage && <p className={styles.inputNotice} role="status">{midiMessage}</p>}
    </fieldset>}

    {section !== 'notation' && <RecordingSourcesPanel settings={settings} devices={devices} sourceStates={sourceStates} disabled={disabled} message={mediaMessage} onChange={onChange} />}

    {section !== 'inputs' && <fieldset disabled={disabled} className={`${styles.optionsGrid} ${styles.optionCard}`}>
      <legend>Score</legend>
      <label className={styles.optionRow}><span>Tempo</span><select aria-label="Tempo detection" value={settings.tempoMode ?? 'manual'} onChange={(event) => onChange({ tempoMode: event.target.value as 'auto' | 'manual' })}><option value="manual">Manual</option><option value="auto">Auto</option></select></label>
      {estimatedBpm != null && <button className={styles.estimateButton} type="button" onClick={() => onChange({ bpm: estimatedBpm, tempoMode: 'manual' })}>Use {estimatedBpm} BPM</button>}
      <label className={styles.optionRow}><span>Grid</span><select aria-label="Transcription quantization" value={settings.quantization ?? 'sixteenth'} onChange={(event) => onChange({ quantization: event.target.value as TranscriptionSettings['quantization'] })}>
        <option value="eighth">1/8</option><option value="eighth-triplet">1/8 triplet</option><option value="sixteenth">1/16</option><option value="sixteenth-triplet">1/16 triplet</option><option value="none">Free</option>
      </select></label>
      <label className={styles.optionRow}><span>Key</span><select aria-label="Transcription key signature" value={settings.keySignature ?? 'auto'} onChange={(event) => onChange({ keySignature: event.target.value as TranscriptionSettings['keySignature'] })}><option value="auto">Auto</option>{KEY_SIGNATURES.map((key) => <option key={key}>{key}</option>)}</select></label>
      <label className={styles.optionRow}><span>Count-in</span><select aria-label="Count-in" value={settings.countInBeats ?? 0} onChange={(event) => onChange({ countInBeats: Number(event.target.value) })}><option value="0">Off</option><option value="3">3 beats</option><option value="4">4 beats</option><option value="6">6 beats</option></select></label>
      <div className={styles.compactToggles}>
        <label className={styles.sourceToggle}><input type="checkbox" checked={settings.metronome ?? false} onChange={(event) => onChange({ metronome: event.target.checked })} /> Metronome</label>
        <label className={styles.sourceToggle}><input aria-label="Chord names" type="checkbox" checked={settings.chordNamesEnabled} onChange={(event) => onChange({ chordNamesEnabled: event.target.checked })} /> Chords</label>
        <label className={styles.sourceToggle}><input aria-label="Piano key labels" type="checkbox" checked={settings.keyLabelsEnabled} onChange={(event) => onChange({ keyLabelsEnabled: event.target.checked })} /> Key labels</label>
      </div>
      <details className={styles.advancedOptions}>
        <summary>Fine tuning</summary>
        <label className={styles.optionRow}><span>Treble split</span><input aria-label="Staff split" type="number" min="21" max="108" value={settings.staffSplit ?? 60} onChange={(event) => onChange({ staffSplit: Number(event.target.value) })} /></label>
        <label className={styles.optionRow}><span>Min. note</span><span className={styles.valueWithUnit}><input aria-label="Short note filter" type="number" min="0" max="150" value={settings.minimumNoteMs ?? 20} onChange={(event) => onChange({ minimumNoteMs: Number(event.target.value) })} /><small>ms</small></span></label>
        <label className={styles.optionRow}><span>Chord window</span><span className={styles.valueWithUnit}><input aria-label="Chord tolerance" type="number" min="0" max="60" value={settings.chordToleranceMs ?? 25} onChange={(event) => onChange({ chordToleranceMs: Number(event.target.value) })} /><small>ms</small></span></label>
      </details>
    </fieldset>}

  </>
  return compact ? <div className={`${styles.options} ${styles.sidebarOptions}`}>{content}</div> : <details className={styles.options}><summary>Transcription settings</summary>{content}</details>
}
