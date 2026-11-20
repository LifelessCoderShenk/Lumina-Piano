import React, { useEffect, useRef, useState } from 'react'
import styles from './AccountControl.module.css'

export function AccountControl() {
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState<'checking' | 'signingIn' | 'signingOut' | null>('checking')
  const [message, setMessage] = useState('')
  const panel = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    const account = window.electronAPI?.account
    if (!account) { setBusy(null); return }
    account.status().then(value => { if (active) setEmail(value.email) })
      .catch(() => { if (active) setMessage('Could not check your account. Try again when connected.') })
      .finally(() => { if (active) setBusy(null) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) panel.current.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  async function act(action: 'status' | 'signIn' | 'signOut') {
    const account = window.electronAPI?.account
    if (!account) { setMessage('Open the desktop app to sign in.'); return }
    setBusy(action === 'status' ? 'checking' : action === 'signIn' ? 'signingIn' : 'signingOut')
    setMessage('')
    try { setEmail((await account[action]()).email) }
    catch (error) {
      setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not update your account. Please try again.')
    } finally { setBusy(null) }
  }

  return <details ref={panel} className={styles.account} onKeyDown={event => {
    if (event.key === 'Escape' && panel.current) {
      panel.current.open = false
      trigger.current?.focus()
    }
  }}>
    <summary ref={trigger} className={styles.trigger}>
      {busy === 'checking' ? 'Checking account…' : email ? 'Trial · Account' : 'Trial · Sign in'}
    </summary>
    <div className={styles.panel}>
      <h2>Account</h2>
      <p className={styles.email}>{email ?? 'Sign in with your website account.'}</p>
      <div className={styles.trial}><strong>Free trial · No time limit</strong><span>Exports include the Lumina watermark.</span></div>
      {busy && <p role="status">{busy === 'signingIn' ? 'Finish signing in through your browser.' : busy === 'signingOut' ? 'Signing out…' : 'Checking your account…'}</p>}
      {message && <p role="alert">{message}</p>}
      <div className={styles.actions}>
        <button disabled={!!busy} onClick={() => void act(email ? 'signOut' : 'signIn')}>{email ? 'Sign out' : 'Continue with Google'}</button>
        {message && <button disabled={!!busy} onClick={() => void act('status')}>Retry status</button>}
      </div>
    </div>
  </details>
}
