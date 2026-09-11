import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!allowRequest(`accept-offer:${ip}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const { order_id, offer_id } = await req.json().catch(() => ({}))
  if (!order_id || !offer_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().rpc('accept_offer_atomic', { p_order_id: order_id, p_offer_id: offer_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ success: true, result: data })
}
