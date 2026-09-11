'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IndexPage() {
  const router = useRouter()
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [driverRes, customerRes] = await Promise.all([
          fetch('/api/driver/session', { cache:'no-store' }),
          fetch('/api/customer/session', { cache:'no-store' }),
        ])
        if (cancelled) return
        if (driverRes.ok) return router.replace('/driver')
        if (customerRes.ok) return router.replace('/home')
        localStorage.removeItem('driver_session')
        localStorage.removeItem('user')
        router.replace('/register')
      } catch { if (!cancelled) router.replace('/register') }
    })()
    return () => { cancelled = true }
  }, [router])
  return <div style={{minHeight:'100vh', background:'#0a0a0f'}}/>
}
