import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { lat, lng, available } = await req.json().catch(() => ({}))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }
  const update: Record<string, unknown> = { lat, lng }
  if (typeof available === 'boolean') update.available = available
  const { error } = await getSupabaseAdmin().from('drivers').update(update).eq('id', session.sub)
  if (error) return NextResponse.json({ error: 'Location update failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
