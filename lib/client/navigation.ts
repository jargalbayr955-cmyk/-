'use client'

type ScreenEntry = { path: string; scope: string; value: string; depth: number }
const SCREEN = 'achiltScreen'
const ROUTE = 'achiltRoute'

export function readScreen(scope: string): ScreenEntry | null {
  const entry = window.history.state?.[SCREEN]
  return entry?.path === window.location.pathname && entry.scope === scope && typeof entry.value === 'string' && Number.isInteger(entry.depth) && entry.depth >= 0 ? entry : null
}

export function writeScreen(scope: string, value: string, push = true) {
  const current = readScreen(scope)
  if (current?.value === value) return
  const entry: ScreenEntry = { path: window.location.pathname, scope, value, depth: push ? (current?.depth ?? 0) + 1 : (current?.depth ?? 0) }
  // Preserve Next's router state and the route predecessor on same-page steps.
  window.history[push ? 'pushState' : 'replaceState']({ ...window.history.state, [SCREEN]: entry }, '', window.location.href)
}

export function backScreen(scope: string) {
  if (!readScreen(scope)?.depth) return false
  window.history.back()
  return true
}

export function closeScreen(scope: string) {
  const depth = readScreen(scope)?.depth || 0
  if (depth) window.history.go(-depth)
  return depth > 0
}

export function rememberRoute(path: string, previous: string | null) {
  const current = window.history.state?.[ROUTE]
  if (current?.path === path) return
  window.history.replaceState({ ...window.history.state, [ROUTE]: { path, previous: previous && previous !== path ? previous : null } }, '', window.location.href)
}

export function backInApp(router: { back: () => void; replace: (href: string) => void }, fallback: string) {
  const route = window.history.state?.[ROUTE]
  if (route?.path === window.location.pathname && typeof route.previous === 'string' && route.previous.startsWith('/') && !route.previous.startsWith('//')) router.back()
  else router.replace(fallback)
}
