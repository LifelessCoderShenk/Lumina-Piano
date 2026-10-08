/*
INPUT: LiveMidiInputController and an in-memory Web MIDI input fixture.
OUTPUT: Lifecycle and normalized note message coverage for the shared MIDI stream.
PURPOSE: Ensures mode consumers subscribe safely without replacing each other's raw input handler.
*/

import { describe, expect, it, vi } from 'vitest'

import { LiveMidiInputController, type MidiInputLike } from './LiveMidiInputController'

function createInput(id = 'keyboard'): MidiInputLike {
  return { id, name: 'Studio Keyboard', onmidimessage: null }
}

describe('LiveMidiInputController', () => {
  it('routes sustain messages separately while retaining their source timestamps', async () => {
    const input = createInput()
    const controller = new LiveMidiInputController(async () => ({ inputs: new Map([[input.id, input]]), onstatechange: null }))
    const notes = vi.fn(); const controls = vi.fn()
    controller.subscribe(notes); const unsubscribe = controller.subscribeControls(controls)
    await controller.initialize(); controller.selectDevice(input.id)
    input.onmidimessage?.({ data: new Uint8Array([0xb2, 64, 127]), timeStamp: 125.5 })
    expect(controls).toHaveBeenCalledWith({ type: 'controlchange', controller: 64, value: 127, channel: 2, timestampMs: 125.5 })
    expect(notes).not.toHaveBeenCalled()
    unsubscribe(); input.onmidimessage?.({ data: new Uint8Array([0xb2, 64, 0]) })
    expect(controls).toHaveBeenCalledOnce(); controller.dispose()
  })
  it('normalizes note-on/off, supports multiple subscribers, and releases its handler', async () => {
    const input = createInput()
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null }
    const controller = new LiveMidiInputController(async () => access, () => 999)
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = controller.subscribe(first)
    controller.subscribe(second)

    await controller.initialize()
    expect(controller.devices()).toEqual([{ id: 'keyboard', name: 'Studio Keyboard' }])
    expect(controller.selectDevice('keyboard')).toBe(true)
    input.onmidimessage?.({ data: new Uint8Array([0x92, 60, 96]), timeStamp: 100 })
    unsubscribe()
    input.onmidimessage?.({ data: new Uint8Array([0x92, 60, 0]) })

    expect(first).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'noteon', pitch: 60, channel: 2, velocity: 96 }))
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'noteoff', timestampMs: 999 }))
    controller.dispose()
    expect(input.onmidimessage).toBeNull()
  })

  it('does not leak a handler when switching devices', async () => {
    const first = createInput('first')
    const second = createInput('second')
    const controller = new LiveMidiInputController(async () => ({
      inputs: new Map([[first.id, first], [second.id, second]]),
      onstatechange: null,
    }))
    await controller.initialize()
    controller.selectDevice('first')
    controller.selectDevice('second')

    expect(first.onmidimessage).toBeNull()
    expect(second.onmidimessage).toBeTypeOf('function')
  })

  it('reports input lifecycle changes through the shared device stream', async () => {
    const input = createInput()
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null as (() => void) | null }
    const controller = new LiveMidiInputController(async () => access)
    const devices = vi.fn()

    controller.subscribeDevices(devices)
    await controller.initialize()
    access.inputs.clear()
    access.onstatechange?.()

    expect(devices).toHaveBeenLastCalledWith([])
    controller.dispose()
  })
})
