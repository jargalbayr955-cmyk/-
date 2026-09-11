import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().from('settings').select('key,value').in('key', ['hero_url'])
  if (error) return NextResponse.json({ hero_url: '' })
  const settings = Object.fromEntries((data || []).map(x => [x.key, x.value]))
  return NextResponse.json({ hero_url: settings.hero_url || '' }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
