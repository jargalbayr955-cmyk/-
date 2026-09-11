import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await getSupabaseAdmin().from('drivers').select('id,name,phone,car_type,price,available,lat,lng').eq('id', session.sub).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ driver: data })
}
