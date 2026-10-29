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

  const { order_id } = (await req.json().catch(() => null)) ?? {}
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

  const { data: commissionSetting, error: commissionSettingError } = await s
    .from('settings')
    .select('value')
    .eq('key', 'driver_commission_enabled')
    .maybeSingle()
  if (commissionSettingError) return NextResponse.json({ error: 'Төлбөрийн горим шалгахад алдаа гарлаа.' }, { status: 503 })

  const commissionEnabled = commissionSetting?.value !== 'false'
  const duration = Math.max(0, Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000))

  // Temporary launch mode: finish the trip and immediately release the driver.
  // No payment code or commission debt is created while the setting is disabled.
  if (!commissionEnabled) {
    const { data, error } = await s.rpc('complete_order_without_commission', {
      p_order_id: order.id,
      p_driver_id: driver.id,
      p_duration_minutes: duration,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    const completion = Array.isArray(data) ? data[0] : data
    if (!completion?.success) return NextResponse.json({ error: 'Захиалга дуусгаж чадсангүй. Дахин оролдоно уу.' }, { status: 503 })
    return NextResponse.json({
      success: true,
      paid: true,
      payment_required: false,
      available: Boolean(completion.available),
      fare_amount: Number(completion.fare_amount ?? order.final_price),
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // A completed and paid trip must never create a new debt on a retry.
  if (order.status === 'completed') {
    const { data: payment, error: paymentError } = await s.from('payment_codes')
      .select('code,amount,fare_amount,used').eq('order_id', order.id).eq('driver_id', driver.id)
      .order('id', { ascending: false }).limit(1).maybeSingle()
    if (paymentError) return NextResponse.json({ error: 'Payment lookup unavailable' }, { status: 503 })
    if (!payment) return NextResponse.json({ error: 'Төлбөрийн мэдээлэл олдсонгүй. Админтай холбогдоно уу.' }, { status: 409 })
    return NextResponse.json({ success: true, code: payment.code, amount: Number(payment.amount), fare_amount: Number(payment.fare_amount ?? order.final_price), paid: payment.used }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await s.rpc('complete_order_and_issue_commission', {
    p_order_id: order.id,
    p_driver_id: driver.id,
    p_duration_minutes: duration,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  const payment = Array.isArray(data) ? data[0] : data
  if (!payment?.code || !Number.isFinite(Number(payment.amount))) return NextResponse.json({ error: 'Төлбөрийн мэдээллийг шинэчлээд дахин оролдоно уу.' }, { status: 503 })
  return NextResponse.json({ success: true, code: payment.code, driver_phone: driver.phone, driver_name: driver.name,
    amount: Number(payment.amount), fare_amount: Number(payment.fare_amount), paid: payment.paid }, { headers: { 'Cache-Control': 'no-store' } })
}
