'use client'

import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CUSTOMER_SESSION_EVENT, CUSTOMER_SESSION_STORAGE_KEY, CustomerIdentity, readSession, SessionGateMode } from '@/lib/client/session'
import { DriverAppLink } from './driver-app-link'

const CustomerContext = createContext<CustomerIdentity | null>(null)
export function useCustomerIdentity() {
  const user = useContext(CustomerContext)
  if (!user) throw new Error('Customer identity requires a verified session')
  return user
}

export function SessionGate({ mode, children }: { mode: SessionGateMode; children?: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [user, setUser] = useState<CustomerIdentity | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let generation = 0
    let controller: AbortController | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const check = async (block = false) => {
      const current = ++generation
      controller?.abort()
      clearTimeout(timeout)
      controller = new AbortController()
      const activeController = controller
      timeout = setTimeout(() => activeController.abort(), 10_000)
      if (block) setState('checking')
      try {
        const result = await readSession(mode, activeController.signal)
        if (cancelled || current !== generation) return
        setUser(result.user)
        if (result.destination) {
          setState('checking')
          router.replace(result.destination)
        } else setState('ready')
      } catch {
        if (!cancelled && current === generation) setState('error')
      } finally {
        if (current === generation) clearTimeout(timeout)
      }
    }
    const onChange = () => { void check(true) }
    const onStorage = (event: StorageEvent) => { if (event.key === CUSTOMER_SESSION_STORAGE_KEY) onChange() }
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onChange() }
    window.addEventListener(CUSTOMER_SESSION_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    let channel: BroadcastChannel | undefined
    try { channel = new BroadcastChannel(CUSTOMER_SESSION_EVENT); channel.onmessage = onChange } catch {}
    void check(true)
    return () => {
      cancelled = true
      controller?.abort()
      clearTimeout(timeout)
      channel?.close()
      window.removeEventListener(CUSTOMER_SESSION_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mode, router, attempt])

  if (state === 'ready') return <CustomerContext.Provider key={user?.id || 'guest'} value={user}>{children}</CustomerContext.Provider>
  return <main className="auth-shell">
    <div className="session-status">
      <p role={state === 'error' ? 'alert' : 'status'}>{state === 'error' ? 'Нэвтрэлтийг шалгаж чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.' : 'Нэвтрэлтийг шалгаж байна...'}</p>
      {state === 'error' && <button className="auth-submit" onClick={() => setAttempt(value => value + 1)}>Дахин оролдох</button>}
      <DriverAppLink />
    </div>
  </main>
}
