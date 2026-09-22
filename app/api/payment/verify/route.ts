import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, safeEqual } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  const provided = req.headers.get('x-webhook-secret') || ''
  if (!secret || !provided || !safeEqual(secret, provided)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`payment-webhook:${getClientIp(req)}`, 120, 60_000))) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  // The trusted bank adapter must send a verified incoming transaction. Raw SMS
  // is ambiguous (balance, account digits and outgoing transfers are not proof).
  const body = await req.json().catch(() => null)
  if (!body || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)
    || typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0
    || body.currency !== 'MNT' || body.direction !== 'credit') {
    return NextResponse.json({ error: 'Expected code, positive integer amount, currency MNT and direction credit' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: payment, error: lookupError } = await supabase.from('payment_codes').select('id,driver_id,amount,used').eq('code', body.code).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Payment lookup unavailable' }, { status: 503 })
  if (!payment) return NextResponse.json({ error: 'Invalid code' }, { status: 404 })
  if (Number(payment.amount) !== body.amount) return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 409 })
  if (payment.used) return NextResponse.json({ success: true, already_confirmed: true })

  // Even a matching bank receipt cannot grant access. An administrator must
  // explicitly approve the completed job from the authenticated dashboard.
  return NextResponse.json({ error: 'Админы зөвшөөрөл шаардлагатай.', code: 'ADMIN_APPROVAL_REQUIRED', approval_required: true }, { status: 409 })
}
