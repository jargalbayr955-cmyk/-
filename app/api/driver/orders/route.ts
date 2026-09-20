import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { requireDriver } from '@/lib/server/driver'
import { allowRequest } from '@/lib/server/security'

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-orders:${driver.id}`, 12, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const [{ data: invites, error: inviteError }, { data: acceptedOrder, error: acceptedError }] = await Promise.all([
    supabase
      .from('driver_invites')
      .select('order_id,status,expires_at,rank')
      .eq('driver_id', driver.id)
      .in('status', ['active', 'offered'])
      .gt('expires_at', now)
      .order('rank', { ascending: false })
      .limit(30),
    supabase
      .from('orders')
      .select('id,created_at,from_address,to_address,from_lat,from_lng,status,car_type,car_mark,driver_id,driver_name,driver_phone,final_price')
      .eq('driver_id', driver.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (inviteError || acceptedError) return NextResponse.json({ error: 'Захиалга татахад алдаа гарлаа' }, { status: 500 })

  const liveInvites = invites || []
  if (!liveInvites.length) {
    return NextResponse.json({ orders: [], acceptedOrder: acceptedOrder || null, available: driver.available, active: true })
  }

  const orderIds = [...new Set(liveInvites.map(i => i.order_id))]
  const inviteStatusByOrder = new Map(liveInvites.map(i => [i.order_id, i.status]))
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id,created_at,from_address,to_address,from_lat,from_lng,status,car_type,car_mark')
    .in('id', orderIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (ordersError) return NextResponse.json({ error: 'Захиалга татахад алдаа гарлаа' }, { status: 500 })
  const visibleOrders = (orders || []).map(order => ({ ...order, has_offered: inviteStatusByOrder.get(order.id) === 'offered' }))
  return NextResponse.json({ orders: visibleOrders, acceptedOrder: acceptedOrder || null, available: driver.available, active: true })
}
