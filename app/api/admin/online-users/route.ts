import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/admin'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const onlineSince = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const locationSince = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data, error } = await getSupabaseAdmin().from('users')
    .select('id,phone,lat,lng,last_seen_at,location_updated_at')
    .eq('active', true)
    .gte('last_seen_at', onlineSince)
    .gte('location_updated_at', locationSince)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('last_seen_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: 'Онлайн хэрэглэгчдийн байршлыг татаж чадсангүй.' }, { status: 503 })
  return NextResponse.json({ users: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}
