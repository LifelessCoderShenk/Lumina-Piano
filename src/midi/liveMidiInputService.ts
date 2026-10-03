/*
INPUT: Live MIDI mode mounts that need normalized Web MIDI events.
OUTPUT: Reference-counted access to one shared LiveMidiInputController instance.
PURPOSE: Ensures Record Mode and Transcriptor subscribe to the same physical input stream instead of each owning and replacing a raw MIDI handler.
*/

import { LiveMidiInputController, type MidiDeviceDescriptor } from './LiveMidiInputController'

export interface LiveMidiInputLease {
  readonly controller: LiveMidiInputController
  initialize(): Promise<readonly MidiDeviceDescriptor[]>
  release(): void
}

let sharedController: LiveMidiInputController | null = null
let initialization: Promise<readonly MidiDeviceDescriptor[]> | null = null
let leaseCount = 0

export function acquireLiveMidiInput(): LiveMidiInputLease {
  if (sharedController == null) {
    sharedController = new LiveMidiInputController()
    initialization = null
  }
  const controller = sharedController
  leaseCount += 1
  let released = false

  return {
    controller,
    initialize: () => {
      initialization ??= controller.initialize()
      return initialization
    },
    release: () => {
      if (released) {
        return
      }
      released = true
      leaseCount = Math.max(0, leaseCount - 1)
      if (leaseCount === 0 && sharedController === controller) {
        controller.dispose()
        sharedController = null
        initialization = null
      }
    },
  }
}
