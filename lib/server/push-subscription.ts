import 'server-only'

// Only allow the push services supported by the app, never arbitrary server URLs.
export function isValidPushSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== 'object') return false
  const sub = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof sub.endpoint !== 'string' || sub.endpoint.length > 4096) return false
  try {
    const url = new URL(sub.endpoint)
    const host = url.hostname
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
      || host === 'push.apple.com' || host.endsWith('.push.apple.com')
      || host.endsWith('.notify.windows.com')
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false
    if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return false
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys.p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys.auth)) return false
    const publicKey = Buffer.from(sub.keys.p256dh, 'base64url')
    return publicKey.length === 65 && publicKey[0] === 4 && Buffer.from(sub.keys.auth, 'base64url').length === 16
  } catch { return false }
}
