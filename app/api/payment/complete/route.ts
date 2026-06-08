import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  const { driver_id, order_id, amount } = await req.json()
  if (!driver_id || !amount) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  let code = generateCode()
  for (let i = 0; i < 10; i++) {
    const { data: existing } = await supabase.from('payment_codes').select('id').eq('code', code).single()
    if (!existing) break
    code = generateCode()
  }

  const { error } = await supabase.from('payment_codes').insert({ driver_id, order_id, code, amount, used: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: driver } = await supabase.from('drivers').select('phone, name').eq('id', driver_id).single()

  return NextResponse.json({ success: true, code, driver_phone: driver?.phone, driver_name: driver?.name, amount })
}
