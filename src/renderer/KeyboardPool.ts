import * as PIXI from 'pixi.js'

import { PIANO_MAX_PITCH, PIANO_MIN_PITCH, isBlackKey } from './pianoMath'

export interface KeyboardGraphic {
  pitch: number
  graphic: PIXI.Graphics
  isBlack: boolean
}

export class KeyboardPool {
  private entries: KeyboardGraphic[] = []

  init(): void {
    if (this.entries.length > 0) {
      return
    }

    for (let pitch = PIANO_MIN_PITCH; pitch <= PIANO_MAX_PITCH; pitch += 1) {
      this.entries.push({
        graphic: new PIXI.Graphics(),
        isBlack: isBlackKey(pitch),
        pitch,
      })
    }
  }

  getEntries(): readonly KeyboardGraphic[] {
    return this.entries
  }

  getWhiteEntries(): KeyboardGraphic[] {
    return this.entries.filter((entry) => !entry.isBlack)
  }

  getBlackEntries(): KeyboardGraphic[] {
    return this.entries.filter((entry) => entry.isBlack)
  }

  destroy(): void {
    for (const entry of this.entries) {
      entry.graphic.parent?.removeChild(entry.graphic)
      entry.graphic.destroy()
    }

    this.entries = []
  }
}
