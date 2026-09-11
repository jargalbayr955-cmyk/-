import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { notifyOrderInvites } from '@/lib/server/push'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!secret || !supplied || !safeEqual(secret,supplied)) return NextResponse.json({error:'Unauthorized'},{status:401})
  const s = getSupabaseAdmin()
  const { data: due } = await s.from('driver_invites').select('order_id').eq('status','active').lte('expires_at',new Date().toISOString()).limit(200)
  const orderIds = [...new Set((due||[]).map(x=>x.order_id))]
  let refreshed=0, notified=0
  for (const id of orderIds) {
    const { error } = await s.rpc('refresh_order_driver_slots',{p_order_id:id})
    if (!error) { refreshed++; const r = await notifyOrderInvites(id).catch(()=>({sent:0,invited:0})); notified += r.sent }
  }
  return NextResponse.json({refreshed,notified})
}
