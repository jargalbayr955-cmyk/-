import { NextRequest, NextResponse } from 'next/server'
import * as webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  if (!allowRequest(`push:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return NextResponse.json({ error: 'Missing order' }, { status: 400 })

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return NextResponse.json({ sent: 0, warning: 'Push not configured' })
  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)

  const supabase = getSupabaseAdmin()
  const { data: order } = await supabase
    .from('orders')
    .select('id,from_address,car_type,car_mark,status')
    .eq('id', order_id)
    .maybeSingle()

  if (!order || order.status !== 'pending') return NextResponse.json({ sent: 0 })

  // Make sure the nearest-five pool exists before notifying.
  await supabase.rpc('refresh_order_driver_slots', { p_order_id: order_id })

  const { data: invites } = await supabase
    .from('driver_invites')
    .select('id,driver_id')
    .eq('order_id', order_id)
    .in('status', ['active', 'offered'])
    .is('notified_at', null)
    .limit(5)

  if (!invites?.length) return NextResponse.json({ sent: 0 })

  const driverIds = invites.map(i => i.driver_id)
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id,driver_id,subscription')
    .in('driver_id', driverIds)

  if (!subs?.length) {
    await supabase.from('driver_invites').update({ notified_at: new Date().toISOString() }).in('id', invites.map(i => i.id))
    return NextResponse.json({ sent: 0 })
  }

  const carLabel = order.car_type === 'butten' ? 'Бүтэн ачигч' : order.car_type === 'chiregch' ? 'Чирэгч' : order.car_type
  const payload = JSON.stringify({
    title: '🚛 Танд шинэ захиалга ирлээ!',
    body: `${carLabel}${order.car_mark ? ` · ${order.car_mark}` : ''} — ${order.from_address}`,
    url: '/driver',
  })

  let sent = 0
  const notifiedDriverIds = new Set<string>()
  await Promise.allSettled(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub.subscription, payload)
      sent += 1
      notifiedDriverIds.add(sub.driver_id)
    } catch (err: any) {
      if ([404, 410].includes(err?.statusCode)) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }))

  // Mark the invite as notified even if the device has no subscription; otherwise it would retry forever.
  await supabase
    .from('driver_invites')
    .update({ notified_at: new Date().toISOString() })
    .in('id', invites.map(i => i.id))

  return NextResponse.json({ sent, invited: invites.length, notified_drivers: notifiedDriverIds.size })
}
