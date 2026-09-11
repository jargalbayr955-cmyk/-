import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { verifySession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { subscription } = await req.json().catch(() => ({}))
  if (!subscription?.endpoint) return NextResponse.json({ error: 'Missing subscription' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  await supabase.from('push_subscriptions').delete().eq('driver_id', session.sub)
  const { error } = await supabase.from('push_subscriptions').insert({ driver_id: session.sub, subscription })
  if (error) return NextResponse.json({ error: 'Subscription failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
