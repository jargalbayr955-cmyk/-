'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sessionDestination, SessionGateMode } from '@/lib/client/session'

export function SessionGate({ mode, children }: { mode: SessionGateMode; children?: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    setState('checking')
    sessionDestination(mode, controller.signal).then(destination => {
      if (cancelled) return
      if (destination) router.replace(destination)
      else setState('ready')
    }).catch(() => { if (!cancelled) setState('error') }).finally(() => clearTimeout(timeout))
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [mode, router, attempt])

  if (state === 'ready') return children
  return <main style={{ minHeight: '100dvh', background: '#0a0a0f', color: 'white', display: 'grid', placeItems: 'center', padding: 24 }}>
    <div style={{ textAlign: 'center' }}>
      <p role={state === 'error' ? 'alert' : 'status'}>{state === 'error' ? 'Холболтоо шалгаад дахин оролдоно уу.' : 'Нэвтрэлтийг шалгаж байна...'}</p>
      {state === 'error' && <button onClick={() => setAttempt(value => value + 1)} style={{ padding: '12px 24px', border: 0, borderRadius: 12, background: '#e8433a', color: 'white', fontWeight: 700 }}>Дахин оролдох</button>}
    </div>
  </main>
}
