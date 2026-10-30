import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { clearTrustedDriverDevice } from '@/lib/server/device-session'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req?: NextRequest) {
  let driverId: string | null = null
  if (req) {
    try {
      const driver = await requireDriver(req, { allowIncomplete: true })
      driverId = driver?.id || null
    } catch {
      // Local logout must still succeed even if the database is temporarily unavailable.
    }
  }

  if (driverId) {
    const body = req ? ((await req.json().catch(() => null)) ?? {}) : {}
    const endpoint = typeof body.endpoint === 'string' && /^https:\/\//i.test(body.endpoint) && body.endpoint.length <= 4096
      ? body.endpoint
      : ''
    const now = new Date().toISOString()
    const s = getSupabaseAdmin()
    const driverUpdate = await s.from('drivers')
      .update({
        available: false,
        is_online: false,
        notification_health: 'unknown',
        notification_checked_at: now,
      })
      .eq('id', driverId)
      .is('deleted_at', null)

    if (driverUpdate.error) {
      console.error('[driver/logout] failed to mark driver offline', { code: driverUpdate.error.code })
    }

    if (endpoint) {
      const endpointHash = createHash('md5').update(endpoint).digest('hex')
      const removal = await s.from('push_subscriptions')
        .delete()
        .eq('driver_id', driverId)
        .eq('endpoint_hash', endpointHash)
      if (removal.error) console.warn('[driver/logout] push endpoint cleanup failed', { code: removal.error.code })
    }
  }

  const res = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  res.cookies.set('achilt_driver_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  // Driver logout is an explicit stop-working action, so unlike customer logout it also forgets this device.
  clearTrustedDriverDevice(res)
  return res
}
