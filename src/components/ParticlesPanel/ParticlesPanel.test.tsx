import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetStore, useAppStore } from '../../store/store'
import { PARTICLE_PRESETS } from '../../store/particlePresets'
import { ParticlesPanel } from './ParticlesPanel'

describe('ParticlesPanel', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('renders every control with note-following color selected by default', () => {
    render(<ParticlesPanel />)

    expect(screen.getByRole('checkbox', { name: 'Enable particles' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Spark' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Wisp' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ray' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Burst Density' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Particle Size' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Spread' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Lifetime' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Glow' })).toBeTruthy()
    expect((screen.getByRole('combobox', { name: 'Particle preset' }) as HTMLSelectElement).value).toBe('prism')
    expect(screen.getByRole('option', { name: 'Wisp' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset to Default' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow notes' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByLabelText('Custom particle color')).toBeNull()
  })

  it('reveals and applies one custom particle color', () => {
    render(<ParticlesPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('Custom particle color'), { target: { value: '#ff8844' } })

    expect(useAppStore.getState().particleSettings).toMatchObject({
      colorMode: 'custom',
      customColor: '#ff8844',
    })
  })

  it('updates the Create-mode particle settings', () => {
    render(<ParticlesPanel />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable particles' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Burst Density' }), {
      target: { value: '175' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Spread' }), {
      target: { value: '25' },
    })

    expect(useAppStore.getState().particleSettings).toMatchObject({
      density: 175,
      enabled: false,
      spread: 25,
    })
  })

  it('keeps the Wisp shape selected when its motion settings become custom', () => {
    render(<ParticlesPanel />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Particle preset' }), {
      target: { value: 'wisp' },
    })

    expect(useAppStore.getState().particleSettings).toEqual(
      PARTICLE_PRESETS.find(({ id }) => id === 'wisp')!.settings,
    )
    expect((screen.getByRole('combobox', { name: 'Particle preset' }) as HTMLSelectElement).value).toBe('wisp')

    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), {
      target: { value: '189' },
    })

    expect((screen.getByRole('combobox', { name: 'Particle preset' }) as HTMLSelectElement).value).toBe('custom')
    expect(screen.getByRole('option', { name: 'Custom' })).toBeTruthy()
    expect(useAppStore.getState().particleSettings.style).toBe('wisp')
    expect(screen.getByRole('button', { name: 'Wisp' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('selects particle shape independently from the preset', () => {
    render(<ParticlesPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Ray' }))

    expect(useAppStore.getState().particleSettings.style).toBe('ray')
    expect(screen.getByRole('button', { name: 'Ray' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('resets all particle settings to the default preset', () => {
    useAppStore.getState().setParticleSettings({
      density: 175,
      enabled: false,
      glow: 50,
      lifetime: 200,
      size: 75,
      speed: 150,
      spread: 0,
    })
    render(<ParticlesPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }))

    expect(useAppStore.getState().particleSettings).toEqual(PARTICLE_PRESETS[0].settings)
    expect((screen.getByRole('combobox', { name: 'Particle preset' }) as HTMLSelectElement).value).toBe('prism')
  })
})
