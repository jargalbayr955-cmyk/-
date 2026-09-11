import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const price = Number(body.price)
  if (!body.order_id || !Number.isFinite(price) || price <= 0 || price > 10_000_000) {
    return NextResponse.json({ error: 'Invalid offer' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const [{ data: driver }, { data: order }] = await Promise.all([
    supabase.from('drivers').select('id,name,phone,car_type,available,lat,lng').eq('id', session.sub).maybeSingle(),
    supabase.from('orders').select('id,status,car_type').eq('id', body.order_id).maybeSingle(),
  ])
  if (!driver || !driver.available) return NextResponse.json({ error: 'Жолооч идэвхгүй байна' }, { status: 403 })
  if (!order || order.status !== 'pending') return NextResponse.json({ error: 'Захиалга боломжгүй болсон' }, { status: 409 })
  if (order.car_type && driver.car_type && order.car_type !== driver.car_type) return NextResponse.json({ error: 'Машины төрөл тохирохгүй' }, { status: 403 })

  // Only one of the customer's current five invited drivers may quote.
  const { data: invite } = await supabase
    .from('driver_invites')
    .select('id,status,expires_at')
    .eq('order_id', order.id)
    .eq('driver_id', driver.id)
    .in('status', ['active', 'offered'])
    .maybeSingle()
  const inviteLive = invite && (invite.status === 'offered' || new Date(invite.expires_at).getTime() > Date.now())
  if (!inviteLive) return NextResponse.json({ error: 'Энэ захиалгын үнийн санал өгөх хугацаа дууссан' }, { status: 403 })

  const { error } = await supabase.from('offers').upsert({
    order_id: order.id,
    driver_id: driver.id,
    driver_name: driver.name,
    driver_phone: driver.phone,
    car_type: driver.car_type,
    price: Math.round(price),
    status: 'pending',
    driver_lat: Number.isFinite(body.driver_lat) ? body.driver_lat : driver.lat,
    driver_lng: Number.isFinite(body.driver_lng) ? body.driver_lng : driver.lng,
  }, { onConflict: 'order_id,driver_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('driver_invites').update({
    status: 'offered',
    offered_at: new Date().toISOString(),
  }).eq('id', invite.id)

  return NextResponse.json({ success: true })
}
