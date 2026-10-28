import type { Color, Object3D, Vector3 } from 'three'

export interface AnatomicalNoteEvent {
  pitch: number
  finger: number
  start: number
  end: number
}
export interface AnatomicalKey {
  x: number
  black: boolean
  mesh: { material: { color: Color } }
}
export interface AnatomicalMotion {
  sample(
    time: number,
    sequence?: string,
    showTargets?: boolean,
  ): {
    worst: number
    held: number
    wristPosition: Vector3
    tips: Vector3[]
  }
  setSequence(name: string, events: AnatomicalNoteEvent[]): void
}
export function createHandMotion(
  model: Object3D,
  scene: Object3D,
  keys: Map<number, AnatomicalKey>,
  options?: { sequences?: Record<string, AnatomicalNoteEvent[]> },
): AnatomicalMotion
