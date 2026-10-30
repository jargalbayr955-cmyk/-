'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const KEY = 'achiltBackBoundary'

/**
 * Adds one same-route boundary entry behind an app root. Sub-screens can push their
 * own history entries normally; after they unwind, the next hardware Back lands on
 * the boundary and is routed to the requested in-app entry instead of leaving the PWA/browser.
 */
export function useAppBackBoundary(fallback: string) {
  const router = useRouter()
  useEffect(() => {
    const state = window.history.state || {}
    if (state?.[KEY] !== 'content') {
      window.history.replaceState({ ...state, [KEY]: 'entry' }, '', window.location.href)
      window.history.pushState({ ...state, [KEY]: 'content' }, '', window.location.href)
    }
    const onPop = () => {
      if (window.history.state?.[KEY] === 'entry') router.replace(fallback)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [fallback, router])
}
