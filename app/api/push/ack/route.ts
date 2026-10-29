import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`push-ack:${driver.id}`, 120, 60_000))) {
    return NextResponse.json({ error: 'Too many acknowledgements' }, { status: 429 })
  }
  const body = (await req.json().catch(() => null)) ?? {}
  const deliveryId = String(body.delivery_id || '')
  if (!UUID.test(deliveryId)) return NextResponse.json({ error: 'Invalid delivery' }, { status: 400 })

  const now = new Date().toISOString()
  const s = getSupabaseAdmin()
  const { data, error } = await s.from('driver_push_deliveries')
    .update({ acked_at: now })
    .eq('id', deliveryId)
    .eq('driver_id', driver.id)
    .is('acked_at', null)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Acknowledgement failed' }, { status: 500 })
  if (!data) return NextResponse.json({ ok: true, duplicate: true })

  await s.from('drivers').update({ notification_health: 'ready', notification_checked_at: now }).eq('id', driver.id)
  return NextResponse.json({ ok: true, acked_at: now }, { headers: { 'Cache-Control': 'private, no-store' } })
}
