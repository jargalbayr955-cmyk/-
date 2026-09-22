import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`order-tracking:${user.id}`, 40, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const { order_id } = await req.json().catch(()=>({}))
  if (!order_id) return NextResponse.json({ error:'Missing order' }, {status:400})
  const s = getSupabaseAdmin()
  const { data: order, error: orderError } = await s.from('orders').select('id,user_id,user_phone,driver_id,driver_name,driver_phone,from_lat,from_lng,from_address,to_address,status,final_price').eq('id',order_id).maybeSingle()
  if (orderError) return NextResponse.json({ error: 'Захиалга татаж чадсангүй.' }, { status: 503 })
  if (!order || (order.user_id && order.user_id !== user.id) || (!order.user_id && order.user_phone !== user.phone)) return NextResponse.json({ error:'Not found' }, {status:404})
  if (!order.user_id) await s.from('orders').update({user_id:user.id}).eq('id',order.id).is('user_id',null)
  let driver = null
  if (order.driver_id && ['confirmed', 'completed'].includes(order.status)) {
    const { data, error } = await s.from('drivers').select('id,name,photo_url,car_number,car_type,lat,lng,location_updated_at').eq('id',order.driver_id).maybeSingle()
    if (error) return NextResponse.json({ error: 'Жолоочийн мэдээлэл татаж чадсангүй.' }, { status: 503 })
    driver = data
    // Finished trips must not grant ongoing access to the driver's location.
    if (driver && order.status !== 'confirmed') driver = { ...driver, lat: null, lng: null, location_updated_at: null }
  }
  if (!['confirmed', 'completed'].includes(order.status)) order.driver_phone = null
  return NextResponse.json({ order, driver }, { headers: { 'Cache-Control': 'no-store' } })
}
