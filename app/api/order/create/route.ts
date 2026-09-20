import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'
import { notifyOrderInvites } from '@/lib/server/push'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Нэвтэрнэ үү' }, { status: 401 })
  if (!(await allowRequest(`order-create:${user.id}:${getClientIp(req)}`, 6, 5*60_000))) return NextResponse.json({ error: 'Хэт олон захиалга үүсгэлээ' }, { status: 429 })
  const b = await req.json().catch(() => ({}))
  const lat = Number(b.from_lat), lng = Number(b.from_lng)
  if (b.from_lat == null || b.from_lng == null || b.from_lat === '' || b.from_lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return NextResponse.json({ error: 'Байршил буруу байна' }, { status: 400 })
  if (!String(b.from_address || '').trim() || !String(b.to_address || '').trim() || !['butten','chiregch'].includes(String(b.car_type))) return NextResponse.json({ error: 'Мэдээллээ бүрэн оруулна уу' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('orders').insert({
    user_id: user.id, user_phone: user.phone,
    from_address: String(b.from_address).slice(0,500), to_address: String(b.to_address).slice(0,500),
    from_lat: lat, from_lng: lng, car_type: b.car_type, car_mark: String(b.car_mark || '').slice(0,120), status:'pending'
  }).select('id,status,created_at').single()
  if (error || !data) return NextResponse.json({ error: 'Захиалга үүсгэхэд алдаа гарлаа' }, { status: 500 })
  await supabase.rpc('refresh_order_driver_slots', { p_order_id: data.id })
  await notifyOrderInvites(data.id).catch(()=>{})
  return NextResponse.json({ order: data })
}
