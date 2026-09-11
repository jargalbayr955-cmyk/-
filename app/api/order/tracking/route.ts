import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { order_id } = await req.json().catch(()=>({}))
  if (!order_id) return NextResponse.json({ error:'Missing order' }, {status:400})
  const s = getSupabaseAdmin()
  const { data: order } = await s.from('orders').select('id,user_id,user_phone,driver_id,driver_name,driver_phone,from_lat,from_lng,from_address,to_address,status,final_price').eq('id',order_id).maybeSingle()
  if (!order || (order.user_id && order.user_id !== user.id) || (!order.user_id && order.user_phone !== user.phone)) return NextResponse.json({ error:'Not found' }, {status:404})
  if (!order.user_id) await s.from('orders').update({user_id:user.id}).eq('id',order.id).is('user_id',null)
  let driver = null
  if (order.driver_id) {
    const { data } = await s.from('drivers').select('id,lat,lng,location_updated_at').eq('id',order.driver_id).maybeSingle()
    driver = data
  }
  return NextResponse.json({ order, driver })
}
