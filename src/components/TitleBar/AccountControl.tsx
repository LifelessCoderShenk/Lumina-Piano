import React, { useEffect, useState } from 'react'

export function AccountControl() {
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    window.electronAPI?.account?.status().then(value => { if (active) setEmail(value.email) }).catch(() => undefined)
    return () => { active = false }
  }, [])
  async function act() {
    const account = window.electronAPI?.account
    if (!account) { setMessage('Account sign-in requires the desktop app.'); return }
    setBusy(true)
    setMessage('')
    try {
      const result = await (email ? account.signOut() : account.signIn())
      setEmail(result.email)
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Sign-in failed. Please try again.')
    } finally { setBusy(false) }
  }
  return <div style={{ position: 'relative', zIndex: 2, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
    <button onClick={() => void act()} disabled={busy} title={email ? `${email} — sign out` : 'Sign in with Google'}
      style={{ background: 'transparent', color: '#c4ccd8', border: '1px solid #ffffff20', borderRadius: 12, padding: '3px 12px', fontSize: 12 }}>
      {busy ? 'Complete sign-in in your browser…' : email ? 'Trial · Sign out' : 'Trial · Sign in'}
    </button>
    {message && <div role="alert" style={{ position: 'absolute', right: 0, top: 32, width: 320, padding: 14, background: '#17171b', color: '#f5f5f7', border: '1px solid #444', borderRadius: 8 }}>
      {message} <button onClick={() => setMessage('')} aria-label="Dismiss account message">×</button>
    </div>}
  </div>
}
