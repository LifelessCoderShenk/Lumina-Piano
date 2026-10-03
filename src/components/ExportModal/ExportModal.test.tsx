import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { resetStore, useAppStore } from '../../store/store'
import { ExportModal } from './ExportModal'

describe('ExportModal', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('keeps resolution and framerate out of the export sheet', () => {
    useAppStore.getState().setVisualizerSettings({
      framerate: 30,
      resolution: '4K',
    })

    render(<ExportModal isOpen onClose={() => undefined} variant="sheet" />)

    expect(screen.getByText('Output Destination')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '720p' })).toBeNull()
    expect(screen.queryByRole('button', { name: '1080p' })).toBeNull()
    expect(screen.queryByRole('button', { name: '4K' })).toBeNull()
    expect(screen.queryByRole('button', { name: '30 fps' })).toBeNull()
    expect(screen.queryByRole('button', { name: '60 fps' })).toBeNull()
  })
})
