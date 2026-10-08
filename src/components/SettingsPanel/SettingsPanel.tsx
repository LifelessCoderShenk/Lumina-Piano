import React, { useRef, useState } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'

import { AppIcon } from '../AppIcon/AppIcon'
import { type VisualizerSettings, useAppStore, visualizerSettingsInitial } from '../../store/store'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  onClose(): void
}

const panelStyle = {
  backgroundColor: 'var(--color-bg)',
} as const

const bodyTextStyle = {
  color: 'var(--color-text-body)',
} as const

const headerTextStyle = {
  color: 'var(--color-text-header)',
} as const

const ASPECT_RATIO_OPTIONS: VisualizerSettings['aspectRatio'][] = ['fit', '16:9', '9:16', '1:1', '4:3']
const RESOLUTION_OPTIONS: VisualizerSettings['resolution'][] = ['720p', '1080p', '4K']
const FRAMERATE_OPTIONS: VisualizerSettings['framerate'][] = [30, 60]
const NOTE_STYLE_OPTIONS = ['solid', 'gradient', 'saber', 'outline', 'crystal', 'gem'] as const
const BACKGROUND_STYLE_OPTIONS = ['flat', 'studio', 'aurora', 'stage'] as const
const MAX_BACKGROUND_IMAGE_BYTES = 12 * 1024 * 1024

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useAppStore((state) => state.visualizerSettings)
  const setVisualizerSettings = useAppStore((state) => state.setVisualizerSettings)
  const backgroundColor = useAppStore((state) => state.backgroundColor)
  const backgroundImage = useAppStore((state) => state.backgroundImage)
  const backgroundStyle = useAppStore((state) => state.backgroundStyle)
  const noteLabelsOnKeys = useAppStore((state) => state.noteLabelsOnKeys)
  const noteLabelsOnNotes = useAppStore((state) => state.noteLabelsOnNotes)
  const setBackgroundColor = useAppStore((state) => state.setBackgroundColor)
  const setBackgroundImage = useAppStore((state) => state.setBackgroundImage)
  const setBackgroundStyle = useAppStore((state) => state.setBackgroundStyle)
  const setNoteLabelsOnKeys = useAppStore((state) => state.setNoteLabelsOnKeys)
  const setNoteLabelsOnNotes = useAppStore((state) => state.setNoteLabelsOnNotes)
  const noteStyle = useAppStore((state) => state.noteStyle)
  const fallSpeed = useAppStore((state) => state.fallSpeed)
  const noteWidth = useAppStore((state) => state.noteWidth)
  const noteOpacity = useAppStore((state) => state.noteOpacity)
  const noteGlow = useAppStore((state) => state.noteGlow)
  const lightingIntensity = useAppStore((state) => state.lightingIntensity)
  const keyboardSaber = useAppStore((state) => state.keyboardSaber)
  const handVisualization = useAppStore((state) => state.handVisualization)
  const setNoteStyle = useAppStore((state) => state.setNoteStyle)
  const setFallSpeed = useAppStore((state) => state.setFallSpeed)
  const setNoteWidth = useAppStore((state) => state.setNoteWidth)
  const setNoteOpacity = useAppStore((state) => state.setNoteOpacity)
  const setNoteGlow = useAppStore((state) => state.setNoteGlow)
  const setLightingIntensity = useAppStore((state) => state.setLightingIntensity)
  const setKeyboardSaber = useAppStore((state) => state.setKeyboardSaber)
  const setHandVisualization = useAppStore((state) => state.setHandVisualization)
  const backgroundImageInputRef = useRef<HTMLInputElement>(null)
  const [backgroundImageError, setBackgroundImageError] = useState<string | null>(null)

  const chooseBackgroundImage = async (file: File | undefined) => {
    if (file == null) return

    try {
      const dataUrl = await readBackgroundImage(file)
      setBackgroundImage(dataUrl)
      setBackgroundImageError(null)
    } catch (error) {
      setBackgroundImageError(error instanceof Error ? error.message : 'Could not use that image.')
    }
  }

  return (
    <section className={styles.panel} data-testid="settings-panel" style={panelStyle}>
      <div className={styles.headerRow}>
        <h2 className={styles.heading} style={headerTextStyle}>Visualizer Settings</h2>
        <button
          type="button"
          aria-label="Close visualizer settings"
          className={styles.closeButton}
          onClick={onClose}
          style={bodyTextStyle}
        >
          <AppIcon icon={X} size={18} />
        </button>
      </div>

      <SettingsSection
        title="ASPECT RATIO"
        options={ASPECT_RATIO_OPTIONS}
        value={settings.aspectRatio}
        onSelect={(aspectRatio) => {
          setVisualizerSettings({ aspectRatio })
        }}
      />

      <SettingsSection
        title="RESOLUTION"
        options={RESOLUTION_OPTIONS}
        value={settings.resolution}
        onSelect={(resolution) => {
          setVisualizerSettings({ resolution })
        }}
      />

      <SettingsSection
        title="FRAMERATE"
        options={FRAMERATE_OPTIONS}
        value={settings.framerate}
        onSelect={(framerate) => {
          setVisualizerSettings({ framerate })
        }}
      />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle} style={headerTextStyle}>APPEARANCE</h3>
        <span className={styles.controlLabel}>Background</span>
        <input
          ref={backgroundImageInputRef}
          className={styles.fileInput}
          aria-label="Choose background image file"
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={(event) => {
            void chooseBackgroundImage(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {backgroundImage == null ? (
          <>
            <div className={styles.segmentedControl} aria-label="Background scene">
              {BACKGROUND_STYLE_OPTIONS.map((style) => (
                <button
                  key={style}
                  type="button"
                  aria-pressed={backgroundStyle === style}
                  className={`${styles.segmentButton} ${backgroundStyle === style ? styles.segmentButtonActive : ''}`}
                  onClick={() => setBackgroundStyle(style)}
                >
                  {style === 'flat' ? 'Plain' : style === 'studio' ? 'Studio' : style === 'aurora' ? 'Aurora' : 'Stage'}
                </button>
              ))}
            </div>
            <div className={styles.backgroundControls}>
              <label className={styles.colorControl}>
                <span>Color</span>
                <span className={styles.colorInputGroup}>
                  <input
                    aria-label="Visualizer background"
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => setBackgroundColor(event.target.value)}
                  />
                  <output>{backgroundColor.toUpperCase()}</output>
                </span>
              </label>
              <button
                type="button"
                className={styles.imageButton}
                onClick={() => backgroundImageInputRef.current?.click()}
              >
                <AppIcon icon={ImagePlus} size={16} />
                Add image
              </button>
            </div>
          </>
        ) : (
          <div className={styles.backgroundImageCard}>
            <img className={styles.backgroundPreview} src={backgroundImage} alt="Custom background preview" />
            <button
              type="button"
              className={styles.imageButton}
              onClick={() => backgroundImageInputRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className={styles.removeImageButton}
              aria-label="Remove background image"
              onClick={() => setBackgroundImage(null)}
            >
              <AppIcon icon={Trash2} size={16} />
            </button>
          </div>
        )}
        {backgroundImageError == null ? null : (
          <p className={styles.imageError} role="alert">{backgroundImageError}</p>
        )}
        <span className={styles.controlLabel}>Falling notes</span>
        <div className={styles.segmentedControl} aria-label="Falling note style">
          {NOTE_STYLE_OPTIONS.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={noteStyle === style}
              className={`${styles.segmentButton} ${noteStyle === style ? styles.segmentButtonActive : ''}`}
              onClick={() => setNoteStyle(style)}
            >
              {style === 'solid'
                ? 'Flat'
                : style === 'gradient'
                  ? 'Sculpted'
                  : style === 'saber'
                    ? 'Saber'
                    : style === 'outline'
                      ? 'Outline'
                      : style === 'crystal'
                        ? 'Crystal'
                        : 'Gem'}
            </button>
          ))}
        </div>
        <label className={styles.rangeControl}>
          <span>Fall speed</span>
          <input
            aria-label="Fall speed"
            type="range"
            min="50"
            max="200"
            value={fallSpeed}
            onChange={(event) => setFallSpeed(Number(event.target.value))}
          />
          <output>{fallSpeed}%</output>
        </label>
        <label className={styles.rangeControl}>
          <span>Note width</span>
          <input
            aria-label="Note width"
            type="range"
            min="60"
            max="120"
            value={noteWidth}
            onChange={(event) => setNoteWidth(Number(event.target.value))}
          />
          <output>{noteWidth}%</output>
        </label>
        <label className={styles.rangeControl}>
          <span>Note opacity</span>
          <input
            aria-label="Note opacity"
            type="range"
            min="20"
            max="100"
            value={noteOpacity}
            onChange={(event) => setNoteOpacity(Number(event.target.value))}
          />
          <output>{noteOpacity}%</output>
        </label>
        <label className={styles.rangeControl}>
          <span>Note glow</span>
          <input
            aria-label="Note glow"
            type="range"
            min="0"
            max="200"
            value={noteGlow}
            onChange={(event) => setNoteGlow(Number(event.target.value))}
          />
          <output>{noteGlow}%</output>
        </label>
        <label className={styles.rangeControl}>
          <span>Lighting</span>
          <input
            aria-label="Reactive lighting"
            type="range"
            min="0"
            max="200"
            value={lightingIntensity}
            onChange={(event) => setLightingIntensity(Number(event.target.value))}
          />
          <output>{lightingIntensity}%</output>
        </label>
        <label className={styles.toggleControl}>
          <input
            aria-label="Show keyboard beams"
            type="checkbox"
            checked={keyboardSaber}
            onChange={(event) => setKeyboardSaber(event.target.checked)}
          />
          <span>Keyboard beams</span>
        </label>
        <label className={styles.toggleControl}>
          <input
            aria-label="Show ghost hands"
            type="checkbox"
            checked={handVisualization.enabled}
            onChange={(event) => setHandVisualization({ enabled: event.target.checked })}
          />
          <span>Ghost hands</span>
        </label>
        {handVisualization.enabled ? (
          <label className={`${styles.rangeControl} ${styles.subControl}`}>
            <span>Opacity</span>
            <input
              aria-label="Ghost hands opacity"
              type="range"
              min="10"
              max="80"
              value={handVisualization.opacity}
              onChange={(event) => setHandVisualization({ opacity: Number(event.target.value) })}
            />
            <output>{handVisualization.opacity}%</output>
          </label>
        ) : null}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle} style={headerTextStyle}>NOTE NAMES</h3>
        <label className={styles.toggleControl}>
          <input
            aria-label="Show note names on falling notes"
            type="checkbox"
            checked={noteLabelsOnNotes}
            onChange={(event) => setNoteLabelsOnNotes(event.target.checked)}
          />
          <span>Show names on falling notes</span>
        </label>
        <label className={styles.toggleControl}>
          <input
            aria-label="Show note names on keyboard keys"
            type="checkbox"
            checked={noteLabelsOnKeys}
            onChange={(event) => setNoteLabelsOnKeys(event.target.checked)}
          />
          <span>Show names on keyboard keys</span>
        </label>
      </div>

      <p className={styles.footerNote} style={bodyTextStyle}>
        Defaults: {visualizerSettingsInitial.aspectRatio}, {visualizerSettingsInitial.resolution}, {visualizerSettingsInitial.framerate} FPS
      </p>
    </section>
  )
}

function readBackgroundImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Choose a PNG, JPG, or WebP image.'))
  }
  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
    return Promise.reject(new Error('Choose an image smaller than 12 MB.'))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read that image.'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

interface SettingsSectionProps<T extends string | number> {
  title: string
  options: T[]
  value: T
  onSelect(value: T): void
}

function SettingsSection<T extends string | number>({
  title,
  options,
  value,
  onSelect,
}: SettingsSectionProps<T>) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle} style={headerTextStyle}>{title}</h3>
      <div className={styles.segmentedControl}>
        {options.map((option) => {
          const selected = option === value

          return (
            <button
              key={String(option)}
              type="button"
              className={`${styles.segmentButton} ${selected ? styles.segmentButtonActive : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(option)}
              style={{
                backgroundColor: selected ? 'var(--color-icon)' : 'transparent',
                color: 'var(--color-text-body)',
              }}
            >
              {option === 'fit' ? 'Fit' : option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
