'use client'

// Older Android browsers support AbortController but lack AbortSignal.any/timeout.
// Keep the deadline alive until the response body is consumed, then dispose it.
export function createRequestSignal(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    parent?.removeEventListener('abort', abort)
  }
  const abort = () => { controller.abort(); dispose() }
  if (parent?.aborted) abort()
  else {
    parent?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(abort, timeoutMs)
  }
  return { signal: controller.signal, dispose }
}
