import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountControl } from './AccountControl'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup(email: string | null = null) {
  const account = {
    status: vi.fn().mockResolvedValue({ email }),
    signIn: vi.fn().mockResolvedValue({ email: 'pianist@example.com' }),
    signOut: vi.fn().mockResolvedValue({ email: null }),
  }
  vi.stubGlobal('electronAPI', { account })
  return account
}
it('opens account details without signing the user out', async () => {
  const account = setup('pianist@example.com')
  render(<AccountControl />)
  fireEvent.click(await screen.findByText('Trial · Account'))
  expect(screen.getByText('pianist@example.com')).toBeTruthy()
  expect(account.signOut).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByText('Trial · Sign in')
  expect(account.signOut).toHaveBeenCalledOnce()
})
it('signs in through the explicit Google action', async () => {
  const account = setup()
  render(<AccountControl />)
  fireEvent.click(await screen.findByText('Trial · Sign in'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await screen.findByText('Trial · Account')
  expect(account.signIn).toHaveBeenCalledOnce()
})
it('shows a retryable status failure without discarding a later verified account', async () => {
  const account = setup('pianist@example.com')
  account.status.mockRejectedValueOnce(new Error('Offline'))
  render(<AccountControl />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByText('Trial · Sign in'))
  fireEvent.click(screen.getByRole('button', { name: 'Retry status' }))
  await screen.findByText('Trial · Account')
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
it('closes with Escape and returns focus to the account control', async () => {
  setup()
  render(<AccountControl />)
  const trigger = await screen.findByText('Trial · Sign in')
  fireEvent.click(trigger)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Continue with Google' }), { key: 'Escape' })
  expect(trigger.closest('details')?.open).toBe(false)
  expect(document.activeElement).toBe(trigger)
})
