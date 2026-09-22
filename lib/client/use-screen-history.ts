'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { backScreen, closeScreen, readScreen, writeScreen } from './navigation'

export function useScreenHistory<T extends string>(scope: string, initial: T, valid: (value: string) => value is T) {
  const [screen, setScreen] = useState<T>(initial)
  const validate = useRef(valid)
  useEffect(() => { validate.current = valid }, [valid])
  useEffect(() => {
    const path = window.location.pathname
    const restore = () => {
      if (window.location.pathname !== path) return
      const saved = readScreen(scope)
      setScreen(saved && validate.current(saved.value) ? saved.value : initial)
    }
    if (!readScreen(scope)) writeScreen(scope, initial, false)
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [scope, initial])
  const navigate = useCallback((next: T, replace = false) => {
    writeScreen(scope, next, !replace)
    setScreen(next)
  }, [scope])
  const back = useCallback(() => backScreen(scope), [scope])
  const close = useCallback(() => {
    if (!closeScreen(scope)) navigate(initial, true)
  }, [scope, initial, navigate])
  return { screen, navigate, back, close }
}
