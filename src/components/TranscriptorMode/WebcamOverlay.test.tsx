import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { WebcamOverlay } from './WebcamOverlay'

class TestResizeObserver { observe() {} disconnect() {} }

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 500, x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 500, toJSON: () => ({}) })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('drags from anywhere on the camera frame and keeps the pointer captured', () => {
  const onChange = vi.fn()
  render(<div><WebcamOverlay label="Piano camera" stream={null} overlay={{ x: .1, y: .2, width: .3, crop: 0, mirror: false }} onChange={onChange} /></div>)
  const frame = screen.getByRole('button', { name: 'Move Piano camera' }).parentElement!
  fireEvent.pointerDown(frame, { button: 0, clientX: 100, clientY: 100, pointerId: 7 })
  fireEvent.pointerMove(frame, { clientX: 200, clientY: 150, pointerId: 7 })
  const moved = onChange.mock.lastCall![0]
  expect(moved.x).toBeCloseTo(.2); expect(moved.y).toBeCloseTo(.3); expect(moved.width).toBe(.3)
  fireEvent.pointerUp(frame, { pointerId: 7 })
})

it('resizes without starting a move gesture', () => {
  const onChange = vi.fn()
  render(<div><WebcamOverlay label="Face camera" stream={null} overlay={{ x: .1, y: .2, width: .3, crop: 0, mirror: false }} onChange={onChange} /></div>)
  const resize = screen.getByRole('button', { name: 'Resize Face camera' })
  const frame = resize.parentElement!
  fireEvent.pointerDown(resize, { button: 0, clientX: 100, clientY: 100, pointerId: 8 })
  fireEvent.pointerMove(frame, { clientX: 200, clientY: 100, pointerId: 8 })
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ x: .1, width: .4 }))
})

it('renders a piano camera as a full-width strip with an adjustable crop focus', () => {
  render(<div><WebcamOverlay label="Piano camera" stream={null} overlay={{ x: 0, y: .7, width: 1, height: .3, crop: .2, cropX: .5, cropY: .75, mirror: false }} onChange={vi.fn()} /></div>)
  const frame = screen.getByRole('button', { name: 'Move Piano camera' }).parentElement!
  const video = frame.querySelector('video')!
  expect(frame.style.width).toBe('1000px')
  expect(frame.style.height).toBe('150px')
  expect(frame.style.top).toBe('350px')
  expect(video.style.objectPosition).toBe('50% 75%')
  expect(video.style.transformOrigin).toBe('50% 75%')
})
