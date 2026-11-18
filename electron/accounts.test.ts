// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), signOut: vi.fn(), createClient: vi.fn(),
  encryption: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn(), write: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => 'test-user-data' },
  safeStorage: { isAsyncEncryptionAvailable: mocks.encryption, encryptStringAsync: mocks.encrypt, decryptStringAsync: mocks.decrypt },
  shell: { openExternal: vi.fn() },
}))
vi.mock('./atomicWrite', () => ({ atomicWrite: mocks.write }))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), readFile: vi.fn(), rm: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser, signOut: mocks.signOut } })
})

it('returns only the verified email, never session tokens or metadata', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'tester@example.com', user_metadata: { plan: 'lifetime' } } }, error: null })
  const { desktopAccount } = await import('./accounts')
  expect(await desktopAccount()).toEqual({ email: 'tester@example.com' })
})

it('does not trust a user record when server verification fails', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'tester@example.com' } }, error: new Error('Invalid token') })
  const { desktopAccount } = await import('./accounts')
  expect(await desktopAccount()).toEqual({ email: null })
})

it('refuses to begin sign-in when secure OS storage is unavailable', async () => {
  mocks.encryption.mockResolvedValue(false)
  const { desktopSignIn } = await import('./accounts')
  await expect(desktopSignIn()).rejects.toThrow('Secure account storage is unavailable')
  expect(mocks.createClient).not.toHaveBeenCalled()
})
