import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireDriver } from '@/lib/server/driver'
import { isValidPushSubscription } from '@/lib/server/push-subscription'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`push-subscribe:${driver.id}`, 10, 60_000))) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  const { subscription } = (await req.json().catch(() => null)) ?? {}
  if (!isValidPushSubscription(subscription)) return NextResponse.json({ error: 'Invalid or unsupported push subscription' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data: existing, error: lookupError } = await supabase.from('push_subscriptions').select('id').eq('driver_id', driver.id).limit(1).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Subscription lookup failed' }, { status: 503 })
  const { error } = existing
    ? await supabase.from('push_subscriptions').update({ subscription }).eq('id', existing.id).eq('driver_id', driver.id)
    : await supabase.from('push_subscriptions').insert({ driver_id: driver.id, subscription })
  if (error) return NextResponse.json({ error: 'Subscription failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
