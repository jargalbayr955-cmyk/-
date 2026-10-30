import { after, NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'
import { notifyOrderInvites } from '@/lib/server/push'
import { isServiceType, isTowType, normalizeServiceDetails } from '@/lib/service-types'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Нэвтэрнэ үү' }, { status: 401 })
  if (!(await allowRequest(`order-create:${user.id}:${getClientIp(req)}`, 6, 5 * 60_000))) return NextResponse.json({ error: 'Хэт олон захиалга үүсгэлээ' }, { status: 429 })
  const b = (await req.json().catch(() => null)) ?? {}
  const lat = b.from_lat, lng = b.from_lng
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return NextResponse.json({ error: 'Байршил буруу байна' }, { status: 400 })

  const serviceType = b.service_type === undefined ? 'achilt' : b.service_type
  if (!isServiceType(serviceType) || typeof b.from_address !== 'string' || !b.from_address.trim()) {
    return NextResponse.json({ error: 'Үйлчилгээ эсвэл байршлын мэдээлэл буруу байна' }, { status: 400 })
  }

  const isTow = serviceType === 'achilt'
  if (isTow && (typeof b.to_address !== 'string' || !b.to_address.trim() || !isTowType(b.car_type) || typeof b.car_mark !== 'string' || !b.car_mark.trim())) {
    return NextResponse.json({ error: 'Ачилтын мэдээллээ бүрэн оруулна уу' }, { status: 400 })
  }
  if (!isTow && b.car_type != null && b.car_type !== '') {
    return NextResponse.json({ error: 'Үйлчилгээний төрөл зөрсөн байна' }, { status: 400 })
  }
  const serviceDetails = normalizeServiceDetails(serviceType, b.service_details ?? {})
  if (!serviceDetails || (!isTow && Object.keys(serviceDetails).length === 0)) {
    return NextResponse.json({ error: 'Үйлчилгээний ажлын мэдээллээ бүрэн оруулна уу' }, { status: 400 })
  }

  if (b.request_id !== undefined && (typeof b.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.request_id))) return NextResponse.json({ error: 'Захиалгын хүсэлт буруу байна' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().rpc('create_customer_order_atomic', {
    p_customer_id: user.id,
    // Compatibility for already open clients; current forms always supply a stable key.
    p_request_id: b.request_id ?? randomUUID(),
    p_details: {
      service_type: serviceType,
      from_address: b.from_address.trim().slice(0, 500),
      to_address: isTow ? b.to_address.trim().slice(0, 500) : '',
      from_lat: lat,
      from_lng: lng,
      car_type: isTow ? b.car_type : null,
      car_mark: isTow ? b.car_mark.trim().slice(0, 120) : '',
      service_details: serviceDetails,
    },
  })
  if (error || !data?.order) return NextResponse.json({ error: error?.code === '22023' ? 'Захиалгын мэдээлэл өөрчлөгдсөн байна. Дахин шалгана уу.' : 'Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.' }, { status: error?.code === '22023' ? 409 : 503 })
  // A slow push service must not hide the successfully committed order from its owner.
  if (data.created) after(async () => { await notifyOrderInvites(data.order.id).catch(() => {}) })
  return NextResponse.json({ order: data.order }, { headers: { 'Cache-Control': 'no-store' } })
}
