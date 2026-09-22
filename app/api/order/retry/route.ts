import { after, NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'
import { notifyOrderInvites } from '@/lib/server/push'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Нэвтэрнэ үү' }, { status: 401 })
  if (!(await allowRequest(`order-retry:${user.id}:${getClientIp(req)}`, 6, 10 * 60_000))) {
    return NextResponse.json({ error: 'Хэт олон дахин хайлт хийлээ. Түр хүлээнэ үү.' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  if (typeof body?.order_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.order_id)) {
    return NextResponse.json({ error: 'Захиалга олдсонгүй' }, { status: 400 })
  }
  const { data, error } = await getSupabaseAdmin().rpc('retry_customer_order_atomic', {
    p_order_id: body.order_id, p_customer_id: user.id, p_customer_phone: user.phone,
  })
  if (error || !data?.order?.id) {
    if (error?.message === 'Order not found') return NextResponse.json({ error: 'Захиалга олдсонгүй' }, { status: 404 })
    if (error?.message === 'Order already selected') return NextResponse.json({ error: 'Энэ захиалга аль хэдийн сонгогдсон' }, { status: 409 })
    if (error?.message === 'Bidding still active') return NextResponse.json({ error: '10 минутын хайлтын хугацаа хараахан дуусаагүй байна' }, { status: 409 })
    console.error('order_retry_failed', { code: error?.code })
    return NextResponse.json({ error: 'Дахин хайлт эхлүүлэхэд алдаа гарлаа. Түр хүлээгээд оролдоно уу.' }, { status: 503 })
  }
  if (data.created) after(async () => { await notifyOrderInvites(data.order.id).catch(() => console.warn('Retry push failed')) })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
