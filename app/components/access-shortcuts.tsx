'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'

function useTapShortcut(requiredTaps: number, destination: string) {
  const router = useRouter()
  const taps = useRef({ count: 0, last: 0 })
  return () => {
    const now = Date.now()
    taps.current.count = now - taps.current.last <= 1800 ? taps.current.count + 1 : 1
    taps.current.last = now
    if (taps.current.count >= requiredTaps) {
      taps.current.count = 0
      router.push(destination)
    }
  }
}

export function BrandAccess({ className = 'brand-mark' }: { className?: string }) {
  const openDriver = useTapShortcut(3, '/driver')
  return <button type="button" className={className} aria-label="Ачилт" onClick={openDriver}>А</button>
}

export function AdminAccess() {
  const openAdmin = useTapShortcut(5, '/admin')
  return <button type="button" className="availability-pill" onClick={openAdmin}>
    <span className="availability-dot" aria-hidden="true" />24/7
  </button>
}
