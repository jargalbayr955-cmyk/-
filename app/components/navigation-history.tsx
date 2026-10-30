'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { rememberRoute } from '@/lib/client/navigation'

const BACK_BOUNDARY = 'achiltBackBoundary'

export function NavigationHistory() {
  const path = usePathname()
  const router = useRouter()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    rememberRoute(path, previous.current)
    previous.current = path
  }, [path])

  useEffect(() => {
    if (path !== '/driver' && path !== '/current') return
    const current = window.history.state || {}
    const boundary = current?.[BACK_BOUNDARY]
    if (boundary?.path !== path || boundary?.phase !== 'content') {
      // Preserve Next router state. The hidden entry gives mobile/PWA Back a safe
      // in-app destination after all same-page sub-screens have been unwound.
      window.history.replaceState({ ...current, [BACK_BOUNDARY]: { path, phase:'entry' } }, '', window.location.href)
      window.history.pushState({ ...current, [BACK_BOUNDARY]: { path, phase:'content' } }, '', window.location.href)
    }
    const onPop = () => {
      const value = window.history.state?.[BACK_BOUNDARY]
      if (value?.path === path && value?.phase === 'entry') router.replace('/start')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [path, router])

  return null
}
