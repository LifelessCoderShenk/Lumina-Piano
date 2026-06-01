import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import midiDeviceManager from './MidiDeviceManager'
import { getAppState, resetStore } from '../store/store'

interface MockMidiInput {
  id: string
  name: string
  onmidimessage: ((event: { data: Uint8Array }) => void) | null
}

interface MockMidiAccess {
  inputs: Map<string, MockMidiInput>
  onstatechange: ((event: unknown) => void) | null
}

describe('MidiDeviceManager', () => {
  beforeEach(() => {
    midiDeviceManager.destroy()
    resetStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    midiDeviceManager.destroy()
    resetStore()
    vi.useRealTimers()
    delete (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess
    vi.restoreAllMocks()
  })

  it('sets available=true on init success and available=false on failure', async () => {
    const midiAccess = createMidiAccess([createMidiInput('device-1', 'Keyboard 1')])
    const requestMIDIAccess = vi.fn(async () => midiAccess)
    setRequestMidiAccess(requestMIDIAccess)

    await midiDeviceManager.init()
    expect(getAppState().learnV3.midi.available).toBe(true)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    midiDeviceManager.destroy()
    resetStore()
    setRequestMidiAccess(vi.fn(async () => Promise.reject(new Error('denied'))))

    await midiDeviceManager.init()
    expect(getAppState().learnV3.midi.available).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('getDevices returns the current input device list', async () => {
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([
      createMidiInput('device-1', 'Keyboard 1'),
      createMidiInput('device-2', 'Keyboard 2'),
    ])))

    await midiDeviceManager.init()

    expect(midiDeviceManager.getDevices()).toEqual([
      { id: 'device-1', name: 'Keyboard 1' },
      { id: 'device-2', name: 'Keyboard 2' },
    ])
    expect(getAppState().learnV3.midi.devices).toEqual([
      { id: 'device-1', name: 'Keyboard 1' },
      { id: 'device-2', name: 'Keyboard 2' },
    ])
  })

  it('connect sets the connected device and status', async () => {
    const input = createMidiInput('device-1', 'Keyboard 1')
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([input])))

    await midiDeviceManager.init()
    midiDeviceManager.connect('device-1')

    expect(getAppState().learnV3.midi.connectedDeviceId).toBe('device-1')
    expect(getAppState().learnV3.midi.connectionStatus).toBe('connected')
    expect(input.onmidimessage).toBeTypeOf('function')
  })

  it('disconnect clears the connected device and status', async () => {
    const input = createMidiInput('device-1', 'Keyboard 1')
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([input])))

    await midiDeviceManager.init()
    midiDeviceManager.connect('device-1')
    midiDeviceManager.disconnect()

    expect(getAppState().learnV3.midi.connectedDeviceId).toBeNull()
    expect(getAppState().learnV3.midi.connectionStatus).toBe('disconnected')
    expect(input.onmidimessage).toBeNull()
  })

  it('testConnection resolves on noteOn within the timeout window', async () => {
    const input = createMidiInput('device-1', 'Keyboard 1')
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([input])))

    await midiDeviceManager.init()
    midiDeviceManager.connect('device-1')

    const connectionPromise = midiDeviceManager.testConnection()
    expect(getAppState().learnV3.midi.connectionStatus).toBe('connecting')

    emitMidiMessage(input, [0x90, 60, 100])

    await expect(connectionPromise).resolves.toBeUndefined()
    expect(getAppState().learnV3.midi.connectionStatus).toBe('connected')
  })

  it('testConnection rejects after 10 seconds without a noteOn', async () => {
    const input = createMidiInput('device-1', 'Keyboard 1')
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([input])))

    await midiDeviceManager.init()
    midiDeviceManager.connect('device-1')

    const connectionPromise = midiDeviceManager.testConnection()
    const rejectionExpectation = expect(connectionPromise).rejects.toBe('timeout')
    await vi.advanceTimersByTimeAsync(10_000)

    await rejectionExpectation
    expect(getAppState().learnV3.midi.connectionStatus).toBe('failed')
  })

  it('fires onNoteOn and onNoteOff callbacks for note messages', async () => {
    const input = createMidiInput('device-1', 'Keyboard 1')
    const onNoteOn = vi.fn()
    const onNoteOff = vi.fn()
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([input])))

    await midiDeviceManager.init()
    midiDeviceManager.onNoteOn = onNoteOn
    midiDeviceManager.onNoteOff = onNoteOff
    midiDeviceManager.connect('device-1')

    emitMidiMessage(input, [0x90, 64, 127])
    emitMidiMessage(input, [0x80, 64, 0])
    emitMidiMessage(input, [0x90, 67, 0])

    expect(onNoteOn).toHaveBeenCalledWith(64, 127)
    expect(onNoteOff).toHaveBeenCalledTimes(2)
    expect(onNoteOff).toHaveBeenNthCalledWith(1, 64)
    expect(onNoteOff).toHaveBeenNthCalledWith(2, 67)
  })

  it('disconnects automatically and updates devices on hot-plug removal', async () => {
    const inputA = createMidiInput('device-1', 'Keyboard 1')
    const inputB = createMidiInput('device-2', 'Keyboard 2')
    const midiAccess = createMidiAccess([inputA, inputB])
    setRequestMidiAccess(vi.fn(async () => midiAccess))

    await midiDeviceManager.init()
    midiDeviceManager.connect('device-1')

    midiAccess.inputs.delete('device-1')
    midiAccess.onstatechange?.({ port: inputA })

    expect(getAppState().learnV3.midi.connectedDeviceId).toBeNull()
    expect(getAppState().learnV3.midi.connectionStatus).toBe('disconnected')
    expect(midiDeviceManager.getDevices()).toEqual([
      { id: 'device-2', name: 'Keyboard 2' },
    ])
    expect(getAppState().learnV3.midi.devices).toEqual([
      { id: 'device-2', name: 'Keyboard 2' },
    ])
  })

  it('destroy resets all internal and store state', async () => {
    const input = createMidiInput('device-1', 'Keyboard 1')
    const onNoteOn = vi.fn()
    const onNoteOff = vi.fn()
    setRequestMidiAccess(vi.fn(async () => createMidiAccess([input])))

    await midiDeviceManager.init()
    midiDeviceManager.onNoteOn = onNoteOn
    midiDeviceManager.onNoteOff = onNoteOff
    midiDeviceManager.connect('device-1')

    midiDeviceManager.destroy()

    expect(midiDeviceManager.getDevices()).toEqual([])
    expect(midiDeviceManager.onNoteOn).toBeNull()
    expect(midiDeviceManager.onNoteOff).toBeNull()
    expect(getAppState().learnV3.midi.connectedDeviceId).toBeNull()
    expect(getAppState().learnV3.midi.connectionStatus).toBe('disconnected')
    expect(getAppState().learnV3.midi.available).toBe(false)
    expect(getAppState().learnV3.midi.devices).toEqual([])
  })

  it('treats repeated init calls as a no-op after the first success', async () => {
    const requestMIDIAccess = vi.fn(async () =>
      createMidiAccess([createMidiInput('device-1', 'Keyboard 1')]))
    setRequestMidiAccess(requestMIDIAccess)

    await midiDeviceManager.init()
    await midiDeviceManager.init()

    expect(requestMIDIAccess).toHaveBeenCalledTimes(1)
  })
})

function createMidiInput(id: string, name: string): MockMidiInput {
  return {
    id,
    name,
    onmidimessage: null,
  }
}

function createMidiAccess(inputs: MockMidiInput[]): MockMidiAccess {
  return {
    inputs: new Map(inputs.map((input) => [input.id, input])),
    onstatechange: null,
  }
}

function emitMidiMessage(input: MockMidiInput, data: [number, number, number]): void {
  input.onmidimessage?.({
    data: Uint8Array.from(data),
  })
}

function setRequestMidiAccess(
  implementation: () => Promise<MockMidiAccess>,
): void {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: implementation,
    writable: true,
  })
}
