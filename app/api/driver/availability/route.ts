import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { available } = await req.json().catch(() => ({}))
  if (typeof available !== 'boolean') return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
  const { error } = await getSupabaseAdmin().from('drivers').update({ available }).eq('id', session.sub)
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
