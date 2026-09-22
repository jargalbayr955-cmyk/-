import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/admin'
import { getPaymentWebhookSecret } from '@/lib/server/payment-webhook'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: { 'Cache-Control': 'no-store' } })
  const secret = getPaymentWebhookSecret()
  if (!secret) return NextResponse.json({ error: 'Холболтын түлхүүр тохируулагдаагүй.' }, { status: 503 })
  return NextResponse.json({ url: new URL('/api/payment/verify', req.url).href, secret }, { headers: { 'Cache-Control': 'no-store' } })
}
