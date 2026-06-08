import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const smsText = body.sms || body.message || body.text || ''
  const codeMatch = smsText.match(/\b(\d{6})\b/)
  if (!codeMatch) return NextResponse.json({ error: 'Code not found' }, { status: 400 })

  const code = codeMatch[1]
  const { data: payment } = await supabase
    .from('payment_codes')
    .select()
    .eq('code', code)
    .eq('used', false)
    .single()

  if (!payment) return NextResponse.json({ error: 'Invalid or used code' }, { status: 404 })

  await supabase.from('payment_codes').update({ used: true }).eq('id', payment.id)
  await supabase.from('drivers').update({ available: true }).eq('id', payment.driver_id)

  return NextResponse.json({ success: true, driver_id: payment.driver_id, amount: payment.amount })
}
