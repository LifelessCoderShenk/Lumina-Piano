import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSampledPiano } from './renderSampledPiano'

vi.mock('./pianoSamples', () => ({ PIANO_ATTACK_SECONDS: 0.01, PIANO_RELEASE_SECONDS: 0.5, PIANO_SAMPLE_URLS: { C4: '/C4.mp3', A4: '/A4.mp3' } }))
const sources: any[] = []
const gains: any[] = []
const rendered = {} as AudioBuffer
const decode = vi.fn(async () => ({}))
const render = vi.fn(async () => rendered)
const fetchSample = vi.fn()
const connect = function (this: unknown, target: unknown) { return target }
const makeContext = vi.fn()
beforeEach(() => {
  sources.length = 0; gains.length = 0
  vi.clearAllMocks()
  fetchSample.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
  vi.stubGlobal('fetch', fetchSample)
  vi.stubGlobal('OfflineAudioContext', class {
    destination = {}
    decodeAudioData = decode
    startRendering = render
    constructor(...args: unknown[]) { makeContext(...args) }
    createDynamicsCompressor() { return { connect } }
    createGain() {
      const node = { connect, gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } }
      gains.push(node); return node
    }
    createBufferSource() {
      const node = { connect, buffer: null, playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn() }
      sources.push(node); return node
    }
  })
})
afterEach(() => vi.unstubAllGlobals())
describe('sampled transcription piano', () => {
  it('keeps repeated strikes separate and holds each voice through its pedal end', async () => {
    const notes = [
      { pitch: 60, velocity: 127, startMs: 0, endMs: 2000 },
      { pitch: 60, velocity: 64, startMs: 500, endMs: 2500 },
    ]
    expect(await renderSampledPiano(notes)).toBe(rendered)
    expect(fetchSample).toHaveBeenCalledTimes(1)
    expect(fetchSample).toHaveBeenCalledWith('/C4.mp3')
    expect(sources).toHaveLength(2)
    expect(sources[0].stop).toHaveBeenCalledWith(2.5)
    expect(sources[1].start).toHaveBeenCalledWith(0.5)
    expect(sources[1].stop).toHaveBeenCalledWith(3)
    expect(gains[2].gain.setValueAtTime).toHaveBeenCalledWith(64 / 127, 2.5)
    expect(makeContext).toHaveBeenCalledWith(2, 3.5 * 44100, 44100)
  })
  it('transposes the nearest sample and honors the requested video duration and volume', async () => {
    await renderSampledPiano([{ pitch: 70, velocity: 100, startMs: 1000, endMs: 1100 }], 5, 0.5)
    expect(fetchSample).toHaveBeenCalledWith('/A4.mp3')
    expect(sources[0].playbackRate.value).toBeCloseTo(2 ** (1 / 12))
    expect(makeContext).toHaveBeenCalledWith(2, 5 * 44100, 44100)
    expect(gains[0].gain.value).toBe(0.1)
  })
  it('reports a missing sample and allows a fresh retry', async () => {
    fetchSample.mockResolvedValueOnce({ ok: false, status: 404 })
    const notes = [{ pitch: 60, velocity: 90, startMs: 0, endMs: 1000 }]
    await expect(renderSampledPiano(notes)).rejects.toThrow('Piano samples could not be loaded')
    expect(render).not.toHaveBeenCalled()
    await expect(renderSampledPiano(notes)).resolves.toBe(rendered)
  })
  it('renders an empty silent timeline without loading samples', async () => {
    await renderSampledPiano([], 4)
    expect(fetchSample).not.toHaveBeenCalled()
    expect(sources).toHaveLength(0)
    expect(makeContext).toHaveBeenCalledWith(2, 4 * 44100, 44100)
  })
})
