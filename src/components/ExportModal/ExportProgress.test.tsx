import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ExportProgress } from './ExportProgress'

describe('ExportProgress', () => {
  it('shows the export settings snapshot as a read-only summary', () => {
    render(
      <ExportProgress
        estimatedSecondsRemaining={4}
        formatSummary={{ aspectRatio: '4:3', fps: 60, height: 1440, width: 1920 }}
        framesRendered={12}
        includeAudio
        onCancel={() => undefined}
        phaseLabel="Rendering frames..."
        progress={0.5}
        totalFrames={24}
      />,
    )

    expect(screen.getByText('1920×1440 · 60 FPS · 4:3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1080p' })).toBeNull()
    expect(screen.queryByRole('button', { name: '60 fps' })).toBeNull()
  })
})
