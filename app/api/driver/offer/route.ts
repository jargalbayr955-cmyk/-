import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireDriver } from '@/lib/server/driver'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-offer:${driver.id}`, 20, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) ?? {}
  const orderId = typeof body.order_id === 'string' ? body.order_id : ''
  const price = Number(body.price)
  const lat = Number(body.driver_lat)
  const lng = Number(body.driver_lng)

  if (!orderId || typeof body.price !== 'number' || !Number.isInteger(price) || price <= 0 || price > 10_000_000) {
    return NextResponse.json({ error: 'Үнийн санал буруу байна' }, { status: 400 })
  }
  if (!driver.available) return NextResponse.json({ error: 'Жолооч идэвхгүй байна' }, { status: 403 })
  if (!['butten', 'chiregch'].includes(driver.car_type || '')) return NextResponse.json({ error: 'Профайл хэсэгт машины төрлөө сонгоно уу' }, { status: 409 })

  const { data, error } = await getSupabaseAdmin().rpc('submit_driver_offer_atomic', {
    p_order_id: orderId,
    p_driver_id: driver.id,
    p_price: Math.round(price),
    p_driver_lat: body.driver_lat != null && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    p_driver_lng: body.driver_lng != null && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null,
  })

  if (error) {
    const message = error.message || ''
    if (/expired|Invite unavailable/i.test(message)) return NextResponse.json({ error: 'Энэ захиалгын санал өгөх хугацаа дууссан' }, { status: 409 })
    if (/Order unavailable/i.test(message)) return NextResponse.json({ error: 'Захиалга аль хэдийн сонгогдсон' }, { status: 409 })
    if (/busy|unavailable/i.test(message)) return NextResponse.json({ error: 'Одоогоор санал өгөх боломжгүй байна' }, { status: 409 })
    return NextResponse.json({ error: 'Санал хадгалахад алдаа гарлаа' }, { status: 500 })
  }

  return NextResponse.json({ success: true, offer: data })
}
