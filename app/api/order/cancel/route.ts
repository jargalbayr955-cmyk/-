import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireCustomer } from '@/lib/server/customer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`order-cancel:${user.id}`, 12, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) ?? {}
  const orderId = typeof body.order_id === 'string' ? body.order_id : ''
  if (!UUID.test(orderId)) return NextResponse.json({ error: 'Invalid order_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: order, error: lookupError } = await supabase
    .from('orders')
    .select('id,user_id,user_phone,status')
    .eq('id', orderId)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: 'Order lookup failed' }, { status: 503 })
  if (!order || (order.user_id && order.user_id !== user.id) || (!order.user_id && order.user_phone !== user.phone)) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (order.status !== 'pending') {
    return NextResponse.json({ cancelled: false, status: order.status }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: cancelledOrder, error: cancelError } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (cancelError) return NextResponse.json({ error: 'Order cancel failed' }, { status: 503 })
  if (!cancelledOrder) {
    return NextResponse.json({ cancelled: false, status: 'changed' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const [offers, invites] = await Promise.all([
    supabase.from('offers').update({ status: 'declined' }).eq('order_id', orderId).eq('status', 'pending'),
    supabase.from('driver_invites').update({ status: 'rejected' }).eq('order_id', orderId).in('status', ['active', 'offered']),
  ])
  if (offers.error || invites.error) {
    console.warn('order_cancel_cleanup_failed', { order_id: orderId })
  }

  return NextResponse.json({ cancelled: true, status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } })
}
