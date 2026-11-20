import { createServer } from 'node:http'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage, shell } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { atomicWrite } from './atomicWrite'

// Public staging credentials. No service-role or Google secret belongs in the app.
const url = 'https://sijaebntazfvxnrcykyx.supabase.co'
const key = 'sb_publishable_BW8fwV_Szqx_nIshgk4j1g_Rfu74-Dy'
const callback = 'http://127.0.0.1:43821/auth/callback'
let pending: Promise<{ email: string | null }> | null = null
let client: ReturnType<typeof createClient> | null = null

function accountClient() {
  if (client) return client
  const directory = path.join(app.getPath('userData'), 'account')
  const file = (name: string) => path.join(directory, `${Buffer.from(name).toString('hex')}.bin`)
  client = createClient(url, key, {
    auth: {
      flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: false,
      storage: {
        async getItem(name) {
          try { return (await safeStorage.decryptStringAsync(await readFile(file(name)))).result }
          catch { return null }
        },
        async setItem(name, value) {
          if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Secure account storage is unavailable.')
          await mkdir(directory, { recursive: true })
          await atomicWrite(file(name), await safeStorage.encryptStringAsync(value))
        },
        async removeItem(name) { await rm(file(name), { force: true }) },
      },
    },
  })
  return client
}

export async function desktopAccount() {
  const { data, error } = await accountClient().auth.getUser()
  if (error && error.name !== 'AuthSessionMissingError') throw new Error('Could not verify your account. Check your connection and try again.')
  return { email: data.user?.email ?? null }
}

export async function desktopSignOut() {
  if (pending) throw new Error('Finish or wait for the current sign-in to expire before signing out.')
  const { error } = await accountClient().auth.signOut({ scope: 'local' })
  if (error) throw new Error('Could not sign out. Please try again.')
  return { email: null }
}

export function desktopSignIn() {
  if (pending) return pending
  pending = signIn().finally(() => { pending = null })
  return pending
}

async function signIn(): Promise<{ email: string | null }> {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Secure account storage is unavailable.')
  const supabase = accountClient()
  return new Promise((resolve, reject) => {
    let exchanging = false
    let finished = false
    const finish = (error?: Error, email?: string | null) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      server.close()
      if (error) reject(error)
      else resolve({ email: email ?? null })
    }
    const server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      const incoming = new URL(request.url || '/', callback)
      if (request.method !== 'GET' || request.headers.host !== '127.0.0.1:43821' || incoming.pathname !== '/auth/callback') {
        response.writeHead(404).end('Not found'); return
      }
      const code = incoming.searchParams.get('code')
      if (!code || code.length > 4096 || exchanging || finished) {
        response.writeHead(400).end('Sign-in was not completed. Return to Lumina and try again.'); return
      }
      exchanging = true
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw new Error('The sign-in link expired or could not be verified.')
        const account = await desktopAccount()
        if (!account.email) throw new Error('Could not verify this account.')
        response.end('Signed in. You can close this tab and return to Lumina Piano.')
        finish(undefined, account.email)
      } catch {
        response.writeHead(400).end('Could not verify sign-in. Return to Lumina and try again.')
        finish(new Error('Could not verify sign-in. Please try again.'))
      }
    })
    const timeout = setTimeout(() => finish(new Error('Sign-in timed out. Please try again.')), 180_000)
    server.on('error', () => finish(new Error('The sign-in callback port is unavailable. Close other Lumina sign-in windows and retry.')))
    server.listen(43821, '127.0.0.1', async () => {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google', options: { redirectTo: callback, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
        })
        if (error || !data.url) throw new Error('Google sign-in is unavailable.')
        if (finished) return
        const destination = new URL(data.url)
        if (destination.origin !== url || destination.pathname !== '/auth/v1/authorize') throw new Error('Invalid sign-in destination.')
        await shell.openExternal(destination.href)
      } catch { finish(new Error('Could not open Google sign-in. Check your connection and retry.')) }
    })
  })
}
