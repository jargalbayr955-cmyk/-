import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'
import { notifyOrderInvites } from '@/lib/server/push'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Нэвтэрнэ үү' }, { status: 401 })
  if (!(await allowRequest(`order-retry:${user.id}:${getClientIp(req)}`, 6, 10*60_000))) {
    return NextResponse.json({ error: 'Хэт олон дахин хайлт хийлээ. Түр хүлээнэ үү.' }, { status: 429 })
  }
  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return NextResponse.json({ error: 'Захиалга олдсонгүй' }, { status: 400 })
  const s = getSupabaseAdmin()
  const { data: old } = await s.from('orders')
    .select('id,user_id,user_phone,status,from_address,to_address,from_lat,from_lng,car_type,car_mark,bidding_expires_at')
    .eq('id', order_id).maybeSingle()
  if (!old || (old.user_id && old.user_id !== user.id) || (!old.user_id && old.user_phone !== user.phone)) {
    return NextResponse.json({ error: 'Захиалга олдсонгүй' }, { status: 404 })
  }
  if (old.status !== 'pending') return NextResponse.json({ error: 'Энэ захиалга аль хэдийн сонгогдсон' }, { status: 409 })
  if (!old.bidding_expires_at || Date.now() < new Date(old.bidding_expires_at).getTime()) {
    return NextResponse.json({ error: '10 минутын хайлтын хугацаа хараахан дуусаагүй байна' }, { status: 409 })
  }
  const { data, error } = await s.from('orders').insert({
    user_id: user.id, user_phone: user.phone,
    from_address: old.from_address, to_address: old.to_address,
    from_lat: old.from_lat, from_lng: old.from_lng,
    car_type: old.car_type, car_mark: old.car_mark, status: 'pending'
  }).select('id,status,created_at').single()
  if (error || !data) return NextResponse.json({ error: 'Дахин хайлт эхлүүлэхэд алдаа гарлаа' }, { status: 500 })
  const { data: initResult, error: initError } = await s.rpc('refresh_order_driver_slots', { p_order_id: data.id })
  if (initError) return NextResponse.json({ error: 'Ойрын жолооч хайхад алдаа гарлаа' }, { status: 500 })
  await notifyOrderInvites(data.id).catch(()=>{})
  return NextResponse.json({ order: data, bidding_expires_at: initResult?.bidding_expires_at || null, invited_count: Number(initResult?.active_slots || 0) })
}
