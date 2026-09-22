'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { rememberRoute } from '@/lib/client/navigation'

export function NavigationHistory() {
  const path = usePathname()
  const previous = useRef<string | null>(null)
  useEffect(() => {
    rememberRoute(path, previous.current)
    previous.current = path
  }, [path])
  return null
}
