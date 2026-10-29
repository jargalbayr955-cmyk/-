import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'

const HEALTH = new Set(['unknown','ready','permission_default','permission_denied','unsupported','error','native'])
const FRESH_LOCATION_MS = 2 * 60_000

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-heartbeat:${driver.id}`, 8, 60_000))) {
    return NextResponse.json({ error: 'Too many heartbeats' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) ?? {}
  const notificationHealth = typeof body.notification_health === 'string' && HEALTH.has(body.notification_health)
    ? body.notification_health
    : 'unknown'
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const locationTime = driver.location_updated_at ? new Date(driver.location_updated_at).getTime() : NaN
  const freshLocation = Number.isFinite(locationTime) && nowDate.getTime() - locationTime <= FRESH_LOCATION_MS
    && Number.isFinite(Number(driver.lat)) && Number.isFinite(Number(driver.lng))
  const online = Boolean(driver.available && freshLocation)
  const { error } = await getSupabaseAdmin().from('drivers').update({
    last_heartbeat_at: now,
    notification_health: notificationHealth,
    notification_checked_at: now,
    is_online: online,
  }).eq('id', driver.id).eq('active', true).is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Heartbeat update failed' }, { status: 500 })
  return NextResponse.json({ ok: true, available: driver.available, online, server_time: now }, { headers: { 'Cache-Control': 'private, no-store' } })
}
