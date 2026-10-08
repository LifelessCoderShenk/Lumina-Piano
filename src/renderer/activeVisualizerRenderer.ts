/*
INPUT: A live visualizer renderer instance and keyboard/MIDI view commands.
OUTPUT: The active-renderer registry and extended interactive renderer contract.
PURPOSE: Lets application modes coordinate one shared keyboard scene and live input feedback.
*/

import type { LiveMidiNote, VisualizerRenderer } from './VisualizerRenderer'
import type { RenderLayoutContext } from './layoutConstants'

export interface ActiveVisualizerRenderer extends VisualizerRenderer {
  getKeyX(pitch: number): number
  getKeyboardY(): number
  getRenderLayoutContext?(): RenderLayoutContext
  setActiveKeyPitches?(pitches: Iterable<number>): void
  setKeyboardOpacity(opacity: number): void
  setLiveMidiNotes?(notes: readonly LiveMidiNote[]): void
  setLiveNoteSource?(sourceId: string, notes: readonly LiveMidiNote[]): void
  isLiveNoteSourceActiveOrRecent?(sourceId: string, recentWindowMs?: number): boolean
  /** Shows the static keyboard while suppressing all time-based visual content. */
  setGuideOnly?(guideOnly: boolean): void
  /** Shows the normal keyboard and active-key highlights while hiding visualizer effects. */
  setKeyboardOnly?(keyboardOnly: boolean): void
  /** Review-only MIDI-video clock override used by the recording timeline. */
  setReviewTimelineTick?(tick: number | null): void
}

const activeVisualizerRendererRef: { current: ActiveVisualizerRenderer | null } = {
  current: null,
}

export function registerActiveVisualizerRenderer(renderer: ActiveVisualizerRenderer | null): void {
  activeVisualizerRendererRef.current = renderer
}

export function clearActiveVisualizerRenderer(renderer: ActiveVisualizerRenderer | null): void {
  if (renderer == null || activeVisualizerRendererRef.current === renderer) {
    activeVisualizerRendererRef.current = null
  }
}

export function getActiveVisualizerRenderer(): ActiveVisualizerRenderer | null {
  return activeVisualizerRendererRef.current
}
