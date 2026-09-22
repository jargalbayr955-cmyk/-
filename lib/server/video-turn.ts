import 'server-only'

export function videoIsConfigured() {
  return Boolean(process.env.CLOUDFLARE_TURN_KEY_ID?.trim() && process.env.CLOUDFLARE_TURN_API_TOKEN?.trim())
}

export async function videoIceServers(): Promise<RTCIceServer[]> {
  if (!videoIsConfigured()) throw new Error('VIDEO_NOT_CONFIGURED')
  const key = process.env.CLOUDFLARE_TURN_KEY_ID!.trim()
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(key)) throw new Error('VIDEO_NOT_CONFIGURED')
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate-ice-servers`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 900 }), cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('VIDEO_PROVIDER_UNAVAILABLE')
  const body = await response.json()
  if (!Array.isArray(body.iceServers)) throw new Error('VIDEO_PROVIDER_UNAVAILABLE')
  const servers: RTCIceServer[] = body.iceServers.map((entry: RTCIceServer) => ({
    urls: (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter((url: string) => typeof url === 'string' && /^(stun|turn|turns):/.test(url) && !/:53(?:\?|$)/.test(url)),
    ...(typeof entry.username === 'string' ? { username: entry.username } : {}),
    ...(typeof entry.credential === 'string' ? { credential: entry.credential } : {}),
  })).filter((entry: RTCIceServer) => entry.urls.length)
  if (!servers.some(server => (server.urls as string[]).some(url => /^turns?:/.test(url)) && server.username && server.credential)) throw new Error('VIDEO_PROVIDER_UNAVAILABLE')
  return servers
}
