import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, safeEqual } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  const provided = req.headers.get('x-webhook-secret') || ''
  if (!secret || !provided || !safeEqual(secret, provided)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`payment-webhook:${getClientIp(req)}`, 120, 60_000))) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const smsText = String(body.sms || body.message || body.text || '')
  const utga = smsText.match(/[Uu]tga[:\s]*(\d{6})/)
  const plain = smsText.match(/\b(\d{6})\b/)
  const code = (utga || plain)?.[1]
  if (!code) return NextResponse.json({ error: 'Code not found' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: payment } = await supabase.from('payment_codes').select('id,driver_id,amount,used').eq('code', code).eq('used', false).maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Invalid or used code' }, { status: 404 })

  const { error } = await supabase.rpc('confirm_payment_atomic', { p_payment_id: payment.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ success: true, driver_id: payment.driver_id, amount: payment.amount })
}
