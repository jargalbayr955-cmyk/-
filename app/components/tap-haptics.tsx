'use client'

import { useEffect } from 'react'

type AlertWindow = Window & {
  webkitAudioContext?: typeof AudioContext
  __achiltOfferAlertContext?: AudioContext
}

function primeOfferAlertAudio() {
  const view = window as AlertWindow
  const Ctx = window.AudioContext || view.webkitAudioContext
  if (!Ctx) return
  if (!view.__achiltOfferAlertContext || view.__achiltOfferAlertContext.state === 'closed') {
    view.__achiltOfferAlertContext = new Ctx()
  }
  if (view.__achiltOfferAlertContext.state === 'suspended') {
    void view.__achiltOfferAlertContext.resume().catch(() => {})
  }
}

export function TapHaptics() {
  useEffect(() => {
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      const target = event.target instanceof Element ? event.target : null
      const control = target?.closest('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], select') as HTMLElement | null
      if (!control || control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return
      primeOfferAlertAudio()
      if (typeof navigator.vibrate === 'function') navigator.vibrate(10)
    }

    document.addEventListener('pointerup', onPointerUp, true)
    return () => document.removeEventListener('pointerup', onPointerUp, true)
  }, [])

  return null
}
