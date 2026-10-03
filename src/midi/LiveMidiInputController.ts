/*
INPUT: Browser Web MIDI access and raw MIDIMessageEvent packets.
OUTPUT: A single normalized subscription stream for selected live MIDI input devices.
PURPOSE: Prevents UI modes from competing over input.onmidimessage while exposing note-on/off data to recording, keyboard feedback, and transcription consumers.
*/

export interface MidiDeviceDescriptor {
  readonly id: string
  readonly name: string
}

export interface LiveMidiEvent {
  readonly type: 'noteon' | 'noteoff'
  readonly pitch: number
  readonly velocity: number
  readonly channel: number
  readonly timestampMs: number
}

export interface MidiMessageEventLike {
  readonly data: Uint8Array | readonly number[]
  readonly timeStamp?: number
}

export interface LiveMidiControlEvent {
  readonly type: 'controlchange'
  readonly controller: number
  readonly value: number
  readonly channel: number
  readonly timestampMs: number
}
export type LiveMidiInputEvent = LiveMidiEvent | LiveMidiControlEvent

export interface MidiInputLike {
  readonly id: string
  readonly name?: string | null
  // `any` intentionally mirrors the browser's bivariant event-handler slot
  // so native MIDIInput instances and lightweight test doubles interoperate.
  onmidimessage: ((event: any) => any) | null
}

export interface MidiAccessLike {
  readonly inputs: {
    get(id: string): MidiInputLike | undefined
    values(): IterableIterator<MidiInputLike>
    has?(id: string): boolean
  }
  onstatechange: (() => void) | null
}

export type MidiAccessRequester = () => Promise<MidiAccessLike>

export class LiveMidiInputController {
  private access: MidiAccessLike | null = null
  private selectedInput: MidiInputLike | null = null
  private selectedDeviceId: string | null = null
  private readonly listeners = new Set<(event: LiveMidiEvent) => void>()
  private readonly controlListeners = new Set<(event: LiveMidiControlEvent) => void>()
  private readonly deviceListeners = new Set<(devices: readonly MidiDeviceDescriptor[]) => void>()

  public constructor(
    private readonly requestAccess: MidiAccessRequester = requestBrowserMidiAccess,
    private readonly now: () => number = () => performance.now(),
  ) {}

  async initialize(): Promise<readonly MidiDeviceDescriptor[]> {
    this.access = await this.requestAccess()
    this.access.onstatechange = () => {
      if (this.selectedDeviceId != null && !this.hasInput(this.selectedDeviceId)) {
        this.detachSelectedInput()
      }
      this.emitDevices()
    }
    const devices = this.devices()
    this.emitDevices(devices)
    return devices
  }

  devices(): readonly MidiDeviceDescriptor[] {
    return [...(this.access?.inputs.values() ?? [])].map((input) => ({
      id: input.id,
      name: input.name?.trim() || 'MIDI input',
    }))
  }

  selectDevice(deviceId: string | null): boolean {
    this.detachSelectedInput()
    if (deviceId == null) {
      return true
    }
    const input = this.access?.inputs.get(deviceId)
    if (input == null) {
      return false
    }
    this.selectedDeviceId = deviceId
    this.selectedInput = input
    input.onmidimessage = this.handleMessage
    return true
  }

  selectedDevice(): string | null {
    return this.selectedDeviceId
  }

  subscribe(listener: (event: LiveMidiEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeDevices(listener: (devices: readonly MidiDeviceDescriptor[]) => void): () => void {
    this.deviceListeners.add(listener)
    listener(this.devices())
    return () => this.deviceListeners.delete(listener)
  }

  dispose(): void {
    this.detachSelectedInput()
    if (this.access != null) {
      this.access.onstatechange = null
    }
    this.access = null
    this.listeners.clear()
    this.controlListeners.clear()
    this.deviceListeners.clear()
  }

  private readonly handleMessage = (event: unknown): void => {
    const midiEvent = event as MidiMessageEventLike
    const bytes = midiEvent.data
    if (bytes.length < 3) {
      return
    }
    const command = bytes[0] & 0xf0
    const channel = bytes[0] & 0x0f
    const pitch = bytes[1]
    const velocity = bytes[2]
    if (pitch > 127 || velocity > 127 || pitch < 0 || velocity < 0) return
    if (command === 0xb0) {
      const controlEvent: LiveMidiControlEvent = { type: 'controlchange', controller: pitch, value: velocity, channel, timestampMs: Number.isFinite(midiEvent.timeStamp) ? midiEvent.timeStamp as number : this.now() }
      for (const listener of this.controlListeners) listener(controlEvent)
      return
    }
    const type = command === 0x90 && velocity > 0
      ? 'noteon'
      : (command === 0x80 || (command === 0x90 && velocity === 0) ? 'noteoff' : null)
    if (type == null || pitch < 0 || pitch > 127) {
      return
    }
    const liveEvent: LiveMidiEvent = {
      channel,
      pitch,
      timestampMs: Number.isFinite(midiEvent.timeStamp) ? midiEvent.timeStamp as number : this.now(),
      type,
      velocity,
    }
    for (const listener of this.listeners) {
      listener(liveEvent)
    }
  }

  private detachSelectedInput(): void {
    if (this.selectedInput?.onmidimessage === this.handleMessage) {
      this.selectedInput.onmidimessage = null
    }
    this.selectedInput = null
    this.selectedDeviceId = null
  }

  subscribeControls(listener: (event: LiveMidiControlEvent) => void): () => void {
    this.controlListeners.add(listener)
    return () => { this.controlListeners.delete(listener) }
  }

  private hasInput(deviceId: string): boolean {
    return this.access?.inputs.has?.(deviceId) ?? this.access?.inputs.get(deviceId) != null
  }

  private emitDevices(devices = this.devices()): void {
    for (const listener of this.deviceListeners) {
      listener(devices)
    }
  }
}

async function requestBrowserMidiAccess(): Promise<MidiAccessLike> {
  const midiNavigator = navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> }
  if (typeof midiNavigator.requestMIDIAccess !== 'function') {
    throw new Error('Web MIDI is not available in this browser.')
  }
  // DOM's MIDIInput callback has a `this` parameter that is inconveniently
  // invariant under strict structural typing. The controller only uses the
  // small, verified subset declared above.
  return (await midiNavigator.requestMIDIAccess()) as unknown as MidiAccessLike
}
