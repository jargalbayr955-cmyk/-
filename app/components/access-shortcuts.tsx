'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function BrandAccess({ className = 'brand-mark' }: { className?: string }) {
  const router = useRouter()
  const taps = useRef({ count: 0, last: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressing = useRef(false)
  const suppressClick = useRef(false)
  const startPoint = useRef<{ x: number; y: number } | null>(null)

  const endPress = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    pressing.current = false
    startPoint.current = null
  }, [])

  const cancelPress = useCallback(() => {
    const wasPressing = pressing.current
    endPress()
    // Touch browsers can emit pointerleave after pointerup; keep that short tap.
    if (wasPressing) {
      suppressClick.current = true
      taps.current.count = 0
    }
  }, [endPress])

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState !== 'visible') cancelPress() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', cancelPress)
    return () => {
      cancelPress()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', cancelPress)
    }
  }, [cancelPress])

  const startPress = () => {
    if (pressing.current) return
    pressing.current = true
    suppressClick.current = false
    timer.current = setTimeout(() => {
      timer.current = null
      suppressClick.current = true
      taps.current.count = 0
      router.push('/admin')
    }, 5000)
  }

  const click = () => {
    if (suppressClick.current) { suppressClick.current = false; return }
    const now = Date.now()
    taps.current.count = now - taps.current.last <= 1800 ? taps.current.count + 1 : 1
    taps.current.last = now
    if (taps.current.count === 3) {
      taps.current.count = 0
      router.push('/driver')
    }
  }

  return <button
    type="button"
    className={`${className} brand-access`}
    aria-label="Ачилт"
    onClick={click}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      startPress()
      startPoint.current = { x: event.clientX, y: event.clientY }
    }}
    onPointerMove={event => {
      const point = startPoint.current
      if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 12) cancelPress()
    }}
    onPointerUp={event => { if (event.isPrimary) endPress() }}
    onPointerCancel={cancelPress}
    onPointerLeave={cancelPress}
    onBlur={cancelPress}
    onContextMenu={event => event.preventDefault()}
    onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      if (!event.repeat) startPress()
    }}
    onKeyUp={event => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      if (!pressing.current) return
      endPress()
      click()
    }}
  >А</button>
}
