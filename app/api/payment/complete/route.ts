import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { verifySession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return NextResponse.json({ error: 'Missing order' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const [{ data: driver }, { data: order }] = await Promise.all([
    supabase.from('drivers').select('id,phone,name,price').eq('id', session.sub).maybeSingle(),
    supabase.from('orders').select('id,driver_id,status,created_at').eq('id', order_id).maybeSingle(),
  ])
  if (!driver || !order || order.driver_id !== driver.id || !['confirmed','completed'].includes(order.status)) {
    return NextResponse.json({ error: 'Order not available' }, { status: 403 })
  }

  const amount = Number(driver.price || 10000)
  const durationMinutes = Math.max(0, Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000))
  const { data, error } = await supabase.rpc('complete_order_and_issue_payment', {
    p_order_id: order.id,
    p_driver_id: driver.id,
    p_amount: amount,
    p_duration_minutes: durationMinutes,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  const code = Array.isArray(data) ? data[0]?.code : data?.code || data
  return NextResponse.json({ success: true, code, driver_phone: driver.phone, driver_name: driver.name, amount })
}
