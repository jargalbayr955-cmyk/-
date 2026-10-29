import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'

const HEALTH = new Set(['unknown','ready','permission_default','permission_denied','unsupported','error','native'])

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
  const now = new Date().toISOString()
  const { error } = await getSupabaseAdmin().from('drivers').update({
    last_heartbeat_at: now,
    notification_health: notificationHealth,
    notification_checked_at: now,
    is_online: Boolean(driver.available),
  }).eq('id', driver.id).eq('active', true).is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Heartbeat update failed' }, { status: 500 })
  return NextResponse.json({ ok: true, available: driver.available, server_time: now }, { headers: { 'Cache-Control': 'private, no-store' } })
}
