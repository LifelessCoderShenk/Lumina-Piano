import React, { useState } from 'react'

import { useAppStore } from '../../store/store'
import {
  applyVisualStyle,
  BUILT_IN_VISUAL_STYLE_PRESETS,
  captureVisualStyle,
  createVisualStylePreset,
  loadVisualStylePresets,
  storeVisualStylePresets,
  visualStyleMatches,
  type VisualStyle,
  type VisualStylePreset,
} from '../../store/visualStylePresets'
import styles from './VisualStyleControl.module.css'

export function VisualStyleControl() {
  const styleRevision = useAppStore((state) => JSON.stringify(captureVisualStyle(state)))
  const [presets, setPresets] = useState<VisualStylePreset[]>(() => loadVisualStylePresets())
  const [isNaming, setIsNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const currentStyle = JSON.parse(styleRevision) as VisualStyle
  const availablePresets = [...BUILT_IN_VISUAL_STYLE_PRESETS, ...presets]
  const activeId = availablePresets.find((preset) => visualStyleMatches(preset.style, currentStyle))?.id ?? ''
  const canDeleteActiveStyle = presets.some(({ id }) => id === activeId)

  const persist = (nextPresets: VisualStylePreset[]) => {
    storeVisualStylePresets(nextPresets)
    setPresets(nextPresets)
  }

  const save = () => {
    try {
      const preset = createVisualStylePreset(name, useAppStore.getState())
      persist([...presets, preset])
      setName(''); setIsNaming(false); setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not save style.')
    }
  }

  return (
    <section className={styles.control} aria-label="Saved visual styles">
      <div className={styles.row}>
        <label className={styles.selectLabel}>
          <span>Style</span>
          <select
            aria-label="Visual style"
            value={activeId}
            onChange={(event) => {
              const preset = availablePresets.find(({ id }) => id === event.target.value)
              if (preset != null) useAppStore.getState().batchUpdate((state) => applyVisualStyle(state, preset.style))
            }}
          >
            <option value="">Custom</option>
            <optgroup label="Starter looks">
              {BUILT_IN_VISUAL_STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </optgroup>
            {presets.length > 0 ? (
              <optgroup label="Saved styles">
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        <button type="button" className={styles.actionButton} onClick={() => { setIsNaming(true); setError(null) }}>Save style</button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Delete selected style"
          disabled={!canDeleteActiveStyle}
          onClick={() => persist(presets.filter(({ id }) => id !== activeId))}
        >×</button>
      </div>
      {isNaming ? (
        <form className={styles.nameRow} onSubmit={(event) => { event.preventDefault(); save() }}>
          <input autoFocus aria-label="Style name" maxLength={40} placeholder="Style name" value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit">Save</button>
          <button type="button" onClick={() => { setIsNaming(false); setError(null) }}>Cancel</button>
        </form>
      ) : null}
      {error != null ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  )
}
