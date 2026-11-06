import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const read = vi.hoisted(() => vi.fn())
const write = vi.hoisted(() => vi.fn(async () => undefined))
const apply = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('./recoveryStorage', () => ({ readRecovery: read, writeRecovery: write }))
vi.mock('./luminaProject', () => ({ applyLuminaProjectDocument: apply, createLuminaProjectDocument: vi.fn() }))
import { ProjectRecovery } from './ProjectRecovery'
import { resetStore, useAppStore } from '../store/store'
beforeEach(() => {
  resetStore(); vi.clearAllMocks()
  vi.stubGlobal('indexedDB', {})
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('offers recovery and restores only after an explicit choice', async () => {
  const document = { name: 'Evening take' }
  read.mockResolvedValue(document)
  render(<ProjectRecovery />)
  await screen.findByRole('button', { name: 'Restore' })
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
  await waitFor(() => expect(apply).toHaveBeenCalledWith(document))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull())
})
it('retains the recovery copy when restoring fails', async () => {
  read.mockResolvedValue({ name: 'Evening take' })
  apply.mockRejectedValueOnce(new Error('Samples unavailable'))
  render(<ProjectRecovery />)
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Samples unavailable')
  expect(write).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy()
})
it('does not overwrite a corrupt or unreadable recovery', async () => {
  read.mockRejectedValue(new Error('Corrupt data'))
  render(<ProjectRecovery />)
  expect((await screen.findByRole('alert')).textContent).toContain('untouched')
  expect(write).not.toHaveBeenCalled()
})
it('does not replace a currently open project with recovered work', async () => {
  read.mockResolvedValue({ name: 'Evening take' })
  useAppStore.setState({ projectData: { tracks: [], totalTicks: 0, ticksPerQuarter: 480, tempoMap: [], timeSignatures: [] } })
  render(<ProjectRecovery />)
  const button = await screen.findByRole('button', { name: 'Restore' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  expect(apply).not.toHaveBeenCalled()
})
