import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireDriver } from '@/lib/server/driver'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`payment-complete:${driver.id}`, 8, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return NextResponse.json({ error: 'Missing order' }, { status: 400 })

  const s = getSupabaseAdmin()
  const { data: order } = await s
    .from('orders')
    .select('id,driver_id,status,created_at,final_price')
    .eq('id', order_id)
    .maybeSingle()

  if (!order || order.driver_id !== driver.id || !['confirmed', 'completed'].includes(order.status) || !Number(order.final_price)) {
    return NextResponse.json({ error: 'Order not available' }, { status: 403 })
  }

  const amount = Number(order.final_price)
  const duration = Math.max(0, Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000))
  const { data, error } = await s.rpc('complete_order_and_issue_payment', {
    p_order_id: order.id,
    p_driver_id: driver.id,
    p_amount: amount,
    p_duration_minutes: duration,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  const code = Array.isArray(data) ? data[0]?.code : data?.code || data
  return NextResponse.json({ success: true, code, driver_phone: driver.phone, driver_name: driver.name, amount })
}
