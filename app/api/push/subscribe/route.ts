import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { requireDriver } from '@/lib/server/driver'
import { allowRequest } from '@/lib/server/security'
import { isValidPushSubscription } from '@/lib/server/push-subscription'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`push-subscribe:${driver.id}`, 20, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const payload = (await req.json().catch(() => null)) ?? null
  // Keep older web clients compatible while all new clients send the subscription directly.
  const subscription = payload && typeof payload === 'object' && 'subscription' in payload ? payload.subscription : payload
  if (!isValidPushSubscription(subscription)) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })

  const endpointHash = createHash('md5').update(subscription.endpoint).digest('hex')
  const now = new Date().toISOString()
  const userAgent = String(req.headers.get('user-agent') || '').slice(0, 500)
  const s = getSupabaseAdmin()
  const { data: existing, error: readError } = await s.from('push_subscriptions')
    .select('id')
    .eq('driver_id', driver.id)
    .eq('endpoint_hash', endpointHash)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'Subscription lookup failed' }, { status: 500 })

  const row = {
    driver_id: driver.id,
    subscription,
    endpoint_hash: endpointHash,
    user_agent: userAgent,
    last_seen_at: now,
    disabled_at: null,
    failure_count: 0,
  }
  const mutation = existing
    ? s.from('push_subscriptions').update(row).eq('id', existing.id).eq('driver_id', driver.id)
    : s.from('push_subscriptions').insert(row)
  const { error } = await mutation
  if (error) return NextResponse.json({ error: 'Subscription save failed' }, { status: 500 })

  await s.from('drivers').update({ notification_health: 'ready', notification_checked_at: now }).eq('id', driver.id)
  const { count } = await s.from('push_subscriptions').select('id', { count: 'exact', head: true })
    .eq('driver_id', driver.id).is('disabled_at', null)
  return NextResponse.json({ success: true, devices: count || 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
}
