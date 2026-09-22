import { after, NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireCustomer } from '@/lib/server/customer'
import { notifySelectedDriver } from '@/lib/server/push'

export async function POST(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`accept-offer:${user.id}`, 12, 60_000))) return NextResponse.json({ error: 'Түр хүлээгээд дахин оролдоно уу.' }, { status: 429 })
  const { order_id, offer_id } = (await req.json().catch(() => null)) ?? {}
  if (!order_id || !offer_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const s = getSupabaseAdmin()
  const { data: order, error: lookupError } = await s.from('orders').select('id,user_id,user_phone,status,driver_id,final_price').eq('id', order_id).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Захиалга шалгаж чадсангүй.' }, { status: 503 })
  if (!order || (order.user_id && order.user_id !== user.id) || (!order.user_id && order.user_phone !== user.phone)) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!order.user_id) await s.from('orders').update({ user_id: user.id }).eq('id', order.id).is('user_id', null)
  // A lost response can be retried without selecting again or sending another push.
  const existingSelection = async () => {
    const { data: accepted, error } = await s.from('offers').select('id,driver_id,price').eq('id', offer_id).eq('order_id', order_id).eq('status', 'accepted').maybeSingle()
    return !error && accepted ? { order_id, offer_id, driver_id: accepted.driver_id, price: Number(accepted.price) } : null
  }
  if (order.status === 'confirmed') {
    const result = await existingSelection()
    if (result) return NextResponse.json({ success: true, result }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const { data, error } = await s.rpc('accept_offer_atomic', { p_order_id: order_id, p_offer_id: offer_id })
  if (error) {
    // Concurrent duplicates may have waited on the same order lock.
    if (error.message === 'Order already selected') {
      const result = await existingSelection()
      if (result) return NextResponse.json({ success: true, result }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: error.message === 'Bidding expired' ? 'Хайлтын хугацаа дууссан байна.' : 'Энэ жолоочийг сонгох боломжгүй болсон байна. Саналуудыг дахин шалгана уу.' }, { status: 409 })
  }
  // Notify only after the database has committed the selection.
  after(async () => { await notifySelectedDriver(order_id).catch(() => console.warn('Selection push failed')) })
  return NextResponse.json({ success: true, result: data }, { headers: { 'Cache-Control': 'no-store' } })
}
