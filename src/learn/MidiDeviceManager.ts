import { useAppStore } from '../store/store'
import type { MidiConnectionStatus, MidiDeviceInfo } from '../store/store'

export interface MidiDeviceInfo {
  id: string
  name: string
}

interface MidiInputLike {
  id: string
  name?: string | null
  onmidimessage: ((event: MidiMessageEventLike) => void) | null
}

interface MidiInputCollectionLike {
  get(id: string): MidiInputLike | undefined
  values(): IterableIterator<MidiInputLike>
}

interface MidiAccessLike {
  inputs: MidiInputCollectionLike
  onstatechange: ((event: unknown) => void) | null
}

interface MidiMessageEventLike {
  data?: ArrayLike<number> | null
}

type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: () => Promise<MidiAccessLike>
}

const CONNECTION_TIMEOUT_MS = 10_000

export class MidiDeviceManager {
  onNoteOn: ((pitch: number, velocity: number) => void) | null = null
  onNoteOff: ((pitch: number) => void) | null = null

  private initialized = false
  private midiAccess: MidiAccessLike | null = null
  private devices: MidiDeviceInfo[] = []
  private currentInput: MidiInputLike | null = null
  private connectedDeviceId: string | null = null
  private connectionTestTimer: ReturnType<typeof setTimeout> | null = null
  private connectionTestResolve: (() => void) | null = null
  private connectionTestReject: ((reason: 'timeout') => void) | null = null

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    const midiNavigator = globalThis.navigator as NavigatorWithMidi | undefined
    if (midiNavigator == null || typeof midiNavigator.requestMIDIAccess !== 'function') {
      useAppStore.getState().setMidiAvailable(false)
      return
    }

    try {
      this.midiAccess = await midiNavigator.requestMIDIAccess()
      this.initialized = true
      useAppStore.getState().setMidiAvailable(true)
      this.refreshDevices()
      this.midiAccess.onstatechange = this.handleStateChange
    } catch (error: unknown) {
      useAppStore.getState().setMidiAvailable(false)
      console.warn('Web MIDI API is unavailable.', error)
    }
  }

  getDevices(): MidiDeviceInfo[] {
    return this.devices.map((device) => ({ ...device }))
  }

  connect(deviceId: string): void {
    if (typeof deviceId !== 'string' || deviceId.length === 0) {
      return
    }

    this.disconnect()

    const input = this.midiAccess?.inputs.get(deviceId)
    if (input == null) {
      return
    }

    this.currentInput = input
    this.connectedDeviceId = deviceId
    input.onmidimessage = this.handleMidiMessage

    const state = useAppStore.getState()
    state.setConnectedDevice(deviceId)
    state.setConnectionStatus('connected')
  }

  disconnect(): void {
    if (this.currentInput != null) {
      this.currentInput.onmidimessage = null
    }

    this.clearPendingConnectionTest()
    this.currentInput = null
    this.connectedDeviceId = null

    const state = useAppStore.getState()
    state.setConnectedDevice(null)
    state.setConnectionStatus('disconnected')
  }

  testConnection(): Promise<void> {
    const state = useAppStore.getState()
    state.setConnectionStatus('connecting')

    if (this.currentInput == null) {
      state.setConnectionStatus('failed')
      return Promise.reject('timeout' as const)
    }

    this.clearPendingConnectionTest()

    return new Promise<void>((resolve, reject) => {
      this.connectionTestResolve = () => {
        this.clearPendingConnectionTest()
        useAppStore.getState().setConnectionStatus('connected')
        resolve()
      }
      this.connectionTestReject = (reason) => {
        this.clearPendingConnectionTest()
        useAppStore.getState().setConnectionStatus('failed')
        reject(reason)
      }
      this.connectionTestTimer = globalThis.setTimeout(() => {
        this.connectionTestReject?.('timeout')
      }, CONNECTION_TIMEOUT_MS)
    })
  }

  destroy(): void {
    this.clearPendingConnectionTest()

    if (this.midiAccess != null) {
      this.midiAccess.onstatechange = null
    }

    this.disconnect()
    this.devices = []
    this.midiAccess = null
    this.onNoteOn = null
    this.onNoteOff = null
    this.initialized = false

    const state = useAppStore.getState()
    state.setMidiDevices([])
    state.setMidiAvailable(false)
  }

  private readonly handleStateChange = () => {
    this.refreshDevices()

    if (
      this.connectedDeviceId != null &&
      this.midiAccess?.inputs.get(this.connectedDeviceId) == null
    ) {
      this.disconnect()
    }
  }

  private readonly handleMidiMessage = (event: MidiMessageEventLike) => {
    const data = event.data == null ? [] : Array.from(event.data)
    const status = data[0] ?? 0
    const pitch = data[1] ?? 0
    const velocity = data[2] ?? 0
    const messageType = status & 0xf0

    if (messageType === 0x90 && velocity > 0) {
      this.connectionTestResolve?.()
      this.onNoteOn?.(pitch, velocity)
      return
    }

    if (messageType === 0x80 || (messageType === 0x90 && velocity === 0)) {
      this.onNoteOff?.(pitch)
    }
  }

  private refreshDevices(): void {
    const inputs = this.midiAccess == null
      ? []
      : Array.from(this.midiAccess.inputs.values())

    this.devices = inputs.map((input) => ({
      id: input.id,
      name: input.name?.trim() || 'Unknown MIDI Device',
    }))

    useAppStore.getState().setMidiDevices(this.getDevices())
  }

  private clearPendingConnectionTest(): void {
    if (this.connectionTestTimer != null) {
      clearTimeout(this.connectionTestTimer)
      this.connectionTestTimer = null
    }

    this.connectionTestResolve = null
    this.connectionTestReject = null
  }
}

const midiDeviceManager = new MidiDeviceManager()

export default midiDeviceManager
