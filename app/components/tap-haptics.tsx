'use client'

import { useEffect } from 'react'

export function TapHaptics() {
  useEffect(() => {
    if (typeof navigator.vibrate !== 'function') return

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      const target = event.target instanceof Element ? event.target : null
      const control = target?.closest('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], select') as HTMLElement | null
      if (!control || control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return
      navigator.vibrate(10)
    }

    document.addEventListener('pointerup', onPointerUp, true)
    return () => document.removeEventListener('pointerup', onPointerUp, true)
  }, [])

  return null
}
