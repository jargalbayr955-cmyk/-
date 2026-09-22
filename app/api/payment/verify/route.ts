import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, safeEqual } from '@/lib/server/security'
import { getPaymentWebhookSecret, validPaymentReceipt } from '@/lib/server/payment-webhook'

export async function POST(req: NextRequest) {
  const secret = getPaymentWebhookSecret()
  const provided = req.headers.get('x-webhook-secret') || ''
  if (!secret || !provided || !safeEqual(secret, provided)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`payment-webhook:${getClientIp(req)}`, 120, 60_000))) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  // The trusted bank adapter must send a verified incoming transaction. Raw SMS
  // is ambiguous (balance, account digits and outgoing transfers are not proof).
  const body = await req.json().catch(() => null)
  if (!validPaymentReceipt(body)) {
    return NextResponse.json({ error: 'Expected code, positive integer amount, currency MNT and direction credit' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('confirm_driver_commission', { p_code: body.code, p_amount: body.amount })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : error.code === 'P0001' ? 409 : 503
    return NextResponse.json({ error: status === 404 ? 'Invalid code' : status === 409 ? 'Payment amount or order mismatch' : 'Payment verification unavailable' }, { status })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
