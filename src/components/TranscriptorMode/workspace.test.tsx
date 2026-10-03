import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTranscriptionWorkspace } from './useTranscriptionWorkspace'
import { TranscriptionEditor } from './TranscriptionEditor'
import { useAppStore, resetStore } from '../../store/store'
import { normalizeTranscriptionSettings } from '../../transcription/settings'
import { readSession } from '../../transcription/session'

beforeEach(() => { localStorage.clear(); resetStore() })
afterEach(() => { cleanup(); resetStore(); vi.unstubAllGlobals() })
const note = { id: 'one', pitch: 60, startMs: 33, endMs: 333, velocity: 100, channel: 0 }

it('restores a stopped take and keeps corrections reversible across settings changes', () => {
  const { result, unmount } = renderHook(useTranscriptionWorkspace)
  act(() => result.current.finish([note], [], 500))
  act(() => result.current.edit([{ ...note, pitch: 64 }]))
  act(() => result.current.changeSettings({ bpm: 90 }))
  act(() => result.current.changeSettings({ title: 'My take', webcamEnabled: true }))
  act(() => result.current.undo())
  expect(useAppStore.getState().transcriptionSettings.bpm).toBe(120)
  expect(useAppStore.getState().transcriptionSettings.title).toBe('My take')
  expect(useAppStore.getState().transcriptionSettings.webcamEnabled).toBe(true)
  act(() => result.current.undo())
  expect(useAppStore.getState().transcriptionNotes[0].pitch).toBe(60)
  act(() => result.current.redo())
  expect(useAppStore.getState().transcriptionNotes[0].pitch).toBe(64)
  expect(readSession()?.originalNotes[0].pitch).toBe(60)
  unmount(); resetStore()
  const restored = renderHook(useTranscriptionWorkspace)
  expect(useAppStore.getState().transcriptionNotes[0].pitch).toBe(64)
  expect(useAppStore.getState().transcriptionSettings.webcamEnabled).toBe(false)
  expect(useAppStore.getState().transcriptionPhase).toBe('stopped')
  expect(restored.result.current.session.durationMs).toBe(500)
})

it('edits selected piano-roll notes with keyboard and exact numerical values', () => {
  const onEdit = vi.fn(); const onUndo = vi.fn(); const onRedo = vi.fn()
  const settings = normalizeTranscriptionSettings(useAppStore.getState().transcriptionSettings)
  render(<TranscriptionEditor notes={[note]} settings={settings} selectedIds={['one']} onSelect={vi.fn()} onEdit={onEdit} onUndo={onUndo} onRedo={onRedo} canUndo canRedo />)
  const button = screen.getByRole('button', { name: /Note C4/ })
  fireEvent.keyDown(button, { key: 'ArrowUp' })
  expect(onEdit).toHaveBeenLastCalledWith([expect.objectContaining({ pitch: 61, startMs: 33 })])
  fireEvent.keyDown(button, { key: 'ArrowRight', shiftKey: true })
  expect(onEdit).toHaveBeenLastCalledWith([expect.objectContaining({ endMs: 458 })])
  fireEvent.change(screen.getByLabelText('Editor timing units'), { target: { value: 'ms' } })
  fireEvent.change(screen.getByLabelText('Selected note startMs'), { target: { value: '1000' } })
  fireEvent.blur(screen.getByLabelText('Selected note startMs'))
  expect(onEdit).toHaveBeenLastCalledWith([expect.objectContaining({ startMs: 1000, endMs: 1300 })])
  fireEvent.click(screen.getByRole('button', { name: 'Quantize selected' }))
  expect(onEdit).toHaveBeenLastCalledWith([expect.objectContaining({ startMs: 0, endMs: 250 })])
  fireEvent.keyDown(button, { key: 'z', ctrlKey: true }); expect(onUndo).toHaveBeenCalledOnce()
  fireEvent.keyDown(button, { key: 'z', ctrlKey: true, shiftKey: true }); expect(onRedo).toHaveBeenCalledOnce()
  fireEvent.keyDown(button, { key: 'Delete' }); expect(onEdit).toHaveBeenLastCalledWith([])
})

it('commits pointer movement and duration changes once, at pointer-up', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const capture = vi.fn()
  Element.prototype.setPointerCapture = capture
  const onEdit = vi.fn()
  render(<TranscriptionEditor notes={[note]} settings={normalizeTranscriptionSettings(useAppStore.getState().transcriptionSettings)} selectedIds={['one']} onSelect={vi.fn()} onEdit={onEdit} onUndo={vi.fn()} onRedo={vi.fn()} canUndo={false} canRedo={false} />)
  const button = screen.getByRole('button', { name: /Note C4/ })
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON() {} })
  fireEvent.pointerDown(button, { button: 0, clientX: 20, clientY: 40 })
  fireEvent.pointerMove(button, { clientX: 50, clientY: 24 })
  expect(onEdit).not.toHaveBeenCalled()
  fireEvent.pointerUp(button, { clientX: 50, clientY: 24 })
  expect(onEdit).toHaveBeenCalledOnce()
  expect(onEdit).toHaveBeenLastCalledWith([expect.objectContaining({ pitch: 61, startMs: 283, endMs: 583 })])
  fireEvent.pointerDown(button, { button: 0, clientX: 99, clientY: 40 })
  fireEvent.pointerMove(button, { clientX: 114, clientY: 40 })
  fireEvent.pointerUp(button, { clientX: 114, clientY: 40 })
  expect(onEdit).toHaveBeenLastCalledWith([expect.objectContaining({ startMs: 33, endMs: 458 })])
})
