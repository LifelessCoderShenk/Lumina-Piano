import React, { useEffect, useMemo, useRef, useState } from 'react'

import { type AppState, getAppState, useAppStore } from '../../store/store'
import styles from './EffectsPanel.module.css'
import { BackgroundSection } from './sections/BackgroundSection'
import { ColorModeSection } from './sections/ColorModeSection'
import { EffectsSection } from './sections/EffectsSection'
import { NoteLabelsSection } from './sections/NoteLabelsSection'
import { NoteStyleSection } from './sections/NoteStyleSection'

export interface EffectsPanelProps {
  onClose(): void
}

const MIN_WIDTH = 240
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 320
const PRESETS_STORAGE_KEY = 'lumina:effectsPresets'

interface EffectsPresetSettings {
  effectsEnabled: AppState['effectsEnabled']
  colorMode: AppState['colorMode']
  trackColors: AppState['trackColors']
  pitchClassColors: AppState['pitchClassColors']
  splitPitch: AppState['splitPitch']
  leftHandColor: AppState['leftHandColor']
  rightHandColor: AppState['rightHandColor']
  velocityLowColor: AppState['velocityLowColor']
  velocityHighColor: AppState['velocityHighColor']
  noteStyle: AppState['noteStyle']
  noteGradientDirection: AppState['noteGradientDirection']
  gradientTopColor: AppState['gradientTopColor']
  gradientBottomColorRight: AppState['gradientBottomColorRight']
  gradientBottomColorLeft: AppState['gradientBottomColorLeft']
  gradientBottomColorRightBlack: AppState['gradientBottomColorRightBlack']
  gradientBottomColorLeftBlack: AppState['gradientBottomColorLeftBlack']
  bloomEnabled: AppState['bloomEnabled']
  bloomStrength: AppState['bloomStrength']
  bloomRadius: AppState['bloomRadius']
  particlesEnabled: AppState['particlesEnabled']
  particleCount: AppState['particleCount']
  particleSize: AppState['particleSize']
  particleTrails: AppState['particleTrails']
  keyGlowEnabled: AppState['keyGlowEnabled']
  keyGlowIntensity: AppState['keyGlowIntensity']
  backgroundColor: AppState['backgroundColor']
  laneOpacity: AppState['laneOpacity']
  noteLabelsOnNotes: AppState['noteLabelsOnNotes']
  noteLabelsOnKeys: AppState['noteLabelsOnKeys']
  noteLabelFormat: AppState['noteLabelFormat']
  noteLabelColor: AppState['noteLabelColor']
  noteLabelSize: AppState['noteLabelSize']
}

interface EffectsPreset {
  id: string
  name: string
  createdAt: number
  settings: EffectsPresetSettings
}

export function EffectsPanel({ onClose }: EffectsPanelProps) {
  const store = useAppStore()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [presets, setPresets] = useState<EffectsPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isNamingPreset, setIsNamingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const isResizing = useRef(false)
  const moveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null)
  const upHandlerRef = useRef<((event: MouseEvent) => void) | null>(null)

  useEffect(() => {
    setPresets(loadPresets())

    return () => {
      detachListeners(moveHandlerRef, upHandlerRef, isResizing)
    }
  }, [])

  useEffect(() => {
    persistPresets(presets)
  }, [presets])

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  )

  const onResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    detachListeners(moveHandlerRef, upHandlerRef, isResizing)

    isResizing.current = true
    const startX = event.clientX
    const startWidth = width

    const onMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) {
        return
      }

      const nextWidth = clamp(startWidth + moveEvent.clientX - startX, MIN_WIDTH, MAX_WIDTH)
      setWidth(nextWidth)
    }

    const onUp = () => {
      detachListeners(moveHandlerRef, upHandlerRef, isResizing)
    }

    moveHandlerRef.current = onMove
    upHandlerRef.current = onUp

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const beginSavePreset = () => {
    setIsNamingPreset(true)
    setPresetName(selectedPreset?.name ?? '')
  }

  const cancelSavePreset = () => {
    setIsNamingPreset(false)
    setPresetName('')
  }

  const confirmSavePreset = () => {
    const trimmedName = presetName.trim()
    if (trimmedName.length === 0) {
      return
    }

    const existingPreset = presets.find((preset) => preset.name.toLowerCase() === trimmedName.toLowerCase()) ?? null
    if (
      existingPreset != null &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm(`Overwrite preset "${existingPreset.name}"?`)
    ) {
      return
    }

    const nextPreset: EffectsPreset = {
      createdAt: existingPreset?.createdAt ?? Date.now(),
      id: existingPreset?.id ?? globalThis.crypto.randomUUID(),
      name: trimmedName,
      settings: snapshotPresetSettings(getAppState()),
    }

    setPresets((currentPresets) => {
      const withoutExisting = currentPresets.filter((preset) => preset.id !== existingPreset?.id)
      return [...withoutExisting, nextPreset].sort((left, right) => left.name.localeCompare(right.name))
    })
    setSelectedPresetId(nextPreset.id)
    setIsNamingPreset(false)
    setPresetName('')
  }

  const handleLoadPreset = () => {
    if (selectedPreset == null) {
      return
    }

    applyPresetSettings(store, selectedPreset.settings)
  }

  const handleDeletePreset = () => {
    if (selectedPreset == null) {
      return
    }

    setPresets((currentPresets) => currentPresets.filter((preset) => preset.id !== selectedPreset.id))
    setSelectedPresetId('')
  }

  return (
    <div className={styles.panel} style={{ width }}>
      <div className={styles.header}>
        <div className={styles.title}>Effects</div>
        <button className={styles.closeButton} aria-label="Close effects panel" onClick={onClose}>
          ×
        </button>
      </div>
      <div className={styles.content}>
        <section className={styles.presetsSection}>
          <div className={styles.presetsTitle}>Presets</div>
          <select
            className={styles.presetSelect}
            value={selectedPresetId}
            onChange={(event) => setSelectedPresetId(event.target.value)}
          >
            <option value="">Select a preset...</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <div className={styles.presetActions}>
            <button className={styles.presetButton} type="button" onClick={beginSavePreset}>
              Save
            </button>
            <button
              className={styles.presetButton}
              type="button"
              onClick={handleLoadPreset}
              disabled={selectedPreset == null}
            >
              Load
            </button>
            <button
              className={styles.presetButton}
              type="button"
              onClick={handleDeletePreset}
              disabled={selectedPreset == null}
            >
              Delete
            </button>
          </div>
          {isNamingPreset ? (
            <div className={styles.savePresetRow}>
              <input
                className={styles.presetInput}
                type="text"
                value={presetName}
                placeholder="Preset name"
                onChange={(event) => setPresetName(event.target.value)}
              />
              <div className={styles.inlinePresetActions}>
                <button className={styles.presetButton} type="button" onClick={confirmSavePreset}>
                  Confirm
                </button>
                <button className={styles.presetButtonSecondary} type="button" onClick={cancelSavePreset}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
        <ColorModeSection />
        <NoteStyleSection />
        <NoteLabelsSection />
        <EffectsSection />
        <BackgroundSection />
      </div>
      <div
        className={styles.resizeHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize effects panel"
        onMouseDown={onResizeStart}
      />
    </div>
  )
}

function snapshotPresetSettings(state: AppState): EffectsPresetSettings {
  return {
    backgroundColor: state.backgroundColor,
    bloomEnabled: state.bloomEnabled,
    bloomRadius: state.bloomRadius,
    bloomStrength: state.bloomStrength,
    colorMode: state.colorMode,
    effectsEnabled: { ...state.effectsEnabled },
    gradientBottomColorLeft: state.gradientBottomColorLeft,
    gradientBottomColorLeftBlack: state.gradientBottomColorLeftBlack,
    gradientBottomColorRight: state.gradientBottomColorRight,
    gradientBottomColorRightBlack: state.gradientBottomColorRightBlack,
    gradientTopColor: state.gradientTopColor,
    keyGlowEnabled: state.keyGlowEnabled,
    keyGlowIntensity: state.keyGlowIntensity,
    laneOpacity: state.laneOpacity,
    leftHandColor: state.leftHandColor,
    noteGradientDirection: state.noteGradientDirection,
    noteLabelColor: state.noteLabelColor,
    noteLabelFormat: state.noteLabelFormat,
    noteLabelSize: state.noteLabelSize,
    noteLabelsOnKeys: state.noteLabelsOnKeys,
    noteLabelsOnNotes: state.noteLabelsOnNotes,
    noteStyle: state.noteStyle,
    particleCount: state.particleCount,
    particleSize: state.particleSize,
    particleTrails: state.particleTrails,
    particlesEnabled: state.particlesEnabled,
    pitchClassColors: { ...state.pitchClassColors },
    rightHandColor: state.rightHandColor,
    splitPitch: state.splitPitch,
    trackColors: { ...state.trackColors },
    velocityHighColor: state.velocityHighColor,
    velocityLowColor: state.velocityLowColor,
  }
}

function applyPresetSettings(
  store: ReturnType<typeof useAppStore>,
  settings: EffectsPresetSettings,
): void {
  store.batchUpdate((state) => {
    state.backgroundColor = settings.backgroundColor
    state.bloomEnabled = settings.bloomEnabled
    state.bloomRadius = settings.bloomRadius
    state.bloomStrength = settings.bloomStrength
    state.colorMode = settings.colorMode
    state.effectsEnabled = { ...settings.effectsEnabled }
    state.gradientBottomColorLeft = settings.gradientBottomColorLeft
    state.gradientBottomColorLeftBlack = settings.gradientBottomColorLeftBlack
    state.gradientBottomColorRight = settings.gradientBottomColorRight
    state.gradientBottomColorRightBlack = settings.gradientBottomColorRightBlack
    state.gradientTopColor = settings.gradientTopColor
    state.keyGlowEnabled = settings.keyGlowEnabled
    state.keyGlowIntensity = settings.keyGlowIntensity
    state.laneOpacity = settings.laneOpacity
    state.leftHandColor = settings.leftHandColor
    state.noteGradientDirection = settings.noteGradientDirection
    state.noteLabelColor = settings.noteLabelColor
    state.noteLabelFormat = settings.noteLabelFormat
    state.noteLabelSize = settings.noteLabelSize
    state.noteLabelsOnKeys = settings.noteLabelsOnKeys
    state.noteLabelsOnNotes = settings.noteLabelsOnNotes
    state.noteStyle = settings.noteStyle
    state.particleCount = settings.particleCount
    state.particleSize = settings.particleSize
    state.particleTrails = settings.particleTrails
    state.particlesEnabled = settings.particlesEnabled
    state.pitchClassColors = { ...settings.pitchClassColors }
    state.rightHandColor = settings.rightHandColor
    state.showBloom = settings.bloomEnabled
    state.showParticles = settings.particlesEnabled
    state.splitPitch = settings.splitPitch
    state.trackColors = { ...settings.trackColors }
    state.velocityHighColor = settings.velocityHighColor
    state.velocityLowColor = settings.velocityLowColor
  })
}

function loadPresets(): EffectsPreset[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(PRESETS_STORAGE_KEY)
    if (rawValue == null) {
      return []
    }

    const parsedValue = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue.filter(isEffectsPreset)
  } catch {
    return []
  }
}

function persistPresets(presets: EffectsPreset[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }

  window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

function isEffectsPreset(value: unknown): value is EffectsPreset {
  if (typeof value !== 'object' || value == null) {
    return false
  }

  const candidate = value as Partial<EffectsPreset>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.settings === 'object' &&
    candidate.settings != null
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function detachListeners(
  moveHandlerRef: React.MutableRefObject<((event: MouseEvent) => void) | null>,
  upHandlerRef: React.MutableRefObject<((event: MouseEvent) => void) | null>,
  isResizing: React.MutableRefObject<boolean>,
): void {
  if (moveHandlerRef.current != null) {
    document.removeEventListener('mousemove', moveHandlerRef.current)
    moveHandlerRef.current = null
  }

  if (upHandlerRef.current != null) {
    document.removeEventListener('mouseup', upHandlerRef.current)
    upHandlerRef.current = null
  }

  isResizing.current = false
}
