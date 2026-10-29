import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: NextRequest) {
  let driverId: string | null = null
  try {
    const driver = await requireDriver(req, { allowIncomplete: true })
    driverId = driver?.id || null
  } catch {
    // Local logout must still succeed even if the database is temporarily unavailable.
  }

  if (driverId) {
    const body = (await req.json().catch(() => null)) ?? {}
    const endpoint = typeof body.endpoint === 'string' && /^https:\/\//i.test(body.endpoint) && body.endpoint.length <= 4096
      ? body.endpoint
      : ''
    const now = new Date().toISOString()
    const s = getSupabaseAdmin()
    const cleanup: PromiseLike<unknown>[] = [
      s.from('drivers')
        .update({
          available: false,
          is_online: false,
          notification_health: 'logged_out',
          notification_checked_at: now,
        })
        .eq('id', driverId)
        .is('deleted_at', null),
    ]
    if (endpoint) {
      const endpointHash = createHash('md5').update(endpoint).digest('hex')
      cleanup.push(
        s.from('push_subscriptions')
          .delete()
          .eq('driver_id', driverId)
          .eq('endpoint_hash', endpointHash),
      )
    }
    await Promise.allSettled(cleanup)
  }

  const res = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  res.cookies.set('achilt_driver_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
