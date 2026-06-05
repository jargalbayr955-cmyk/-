import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { driver_id, subscription } = await req.json()
  if (!driver_id || !subscription) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  await supabase.from('push_subscriptions').delete().eq('driver_id', driver_id)
  const { error } = await supabase.from('push_subscriptions').insert({ driver_id, subscription })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
