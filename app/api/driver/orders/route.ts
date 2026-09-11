import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { data: invites, error } = await supabase
    .from('driver_invites')
    .select('order_id,status,expires_at,rank')
    .eq('driver_id', session.sub)
    .in('status', ['active', 'offered'])
    .order('rank', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const liveInvites = (invites || []).filter(i => i.status === 'offered' || i.expires_at > now)
  if (!liveInvites.length) return NextResponse.json({ orders: [] })

  const orderIds = [...new Set(liveInvites.map(i => i.order_id))]
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id,created_at,from_address,to_address,from_lat,from_lng,status,car_type,car_mark')
    .in('id', orderIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 })
  return NextResponse.json({ orders: orders || [] })
}
