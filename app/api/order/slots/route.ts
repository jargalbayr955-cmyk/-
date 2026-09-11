import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const p1 = lat1 * Math.PI / 180
  const p2 = lat2 * Math.PI / 180
  const dp = (lat2 - lat1) * Math.PI / 180
  const dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!allowRequest(`order-slots:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id,status,from_lat,from_lng,driver_id,driver_name,driver_phone,final_price')
    .eq('id', order_id)
    .maybeSingle()

  if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  if (order.status !== 'pending') {
    return NextResponse.json({
      order_status: order.status,
      selected_driver_id: order.driver_id || null,
      selected_driver_name: order.driver_name || null,
      final_price: order.final_price || null,
      slots: [],
    })
  }

  const { data: refreshResult, error: refreshError } = await supabase.rpc('refresh_order_driver_slots', { p_order_id: order_id })
  if (refreshError) return NextResponse.json({ error: refreshError.message }, { status: 500 })

  const { data: invites, error: inviteError } = await supabase
    .from('driver_invites')
    .select('id,driver_id,rank,status,invited_at,expires_at,offered_at')
    .eq('order_id', order_id)
    .in('status', ['active', 'offered'])
    .order('rank', { ascending: true })
    .limit(5)

  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })
  if (!invites?.length) return NextResponse.json({ order_status: 'pending', new_invites: Number(refreshResult?.inserted || 0), slots: [] })

  const driverIds = invites.map(i => i.driver_id)
  const [{ data: drivers }, { data: offers }] = await Promise.all([
    supabase.from('drivers').select('id,name,car_type,lat,lng').in('id', driverIds),
    supabase.from('offers').select('id,driver_id,price,status,driver_lat,driver_lng').eq('order_id', order_id).in('driver_id', driverIds).eq('status', 'pending'),
  ])

  const driverById = new Map((drivers || []).map(d => [d.id, d]))
  const offerByDriver = new Map((offers || []).map(o => [o.driver_id, o]))
  const fromLat = Number(order.from_lat)
  const fromLng = Number(order.from_lng)

  const slots = invites.map(invite => {
    const driver = driverById.get(invite.driver_id) as any
    const offer = offerByDriver.get(invite.driver_id) as any
    const lat = Number(offer?.driver_lat ?? driver?.lat)
    const lng = Number(offer?.driver_lng ?? driver?.lng)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(fromLat) && Number.isFinite(fromLng)
    return {
      invite_id: invite.id,
      driver_id: invite.driver_id,
      rank: invite.rank,
      invite_status: offer ? 'offered' : invite.status,
      invited_at: invite.invited_at,
      expires_at: invite.expires_at,
      driver_name: offer ? driver?.name || 'Ачигч' : null,
      car_type: driver?.car_type || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      distance_km: hasCoords ? Math.round(distanceKm(fromLat, fromLng, lat, lng) * 10) / 10 : null,
      offer: offer ? { id: offer.id, price: Number(offer.price) } : null,
    }
  })

  return NextResponse.json({ order_status: 'pending', new_invites: Number(refreshResult?.inserted || 0), slots })
}
