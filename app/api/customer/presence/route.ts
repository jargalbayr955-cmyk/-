import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function sameOrigin(req: NextRequest) {
  return req.headers.get('origin') === req.nextUrl.origin && req.headers.get('sec-fetch-site') !== 'cross-site'
}

function validCoordinate(value: unknown, min: number, max: number) {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let customer
  try { customer = await requireCustomer(req) }
  catch { return NextResponse.json({ error: 'Presence unavailable' }, { status: 503 }) }
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) ?? {}
  const hasLat = body.lat !== undefined && body.lat !== null
  const hasLng = body.lng !== undefined && body.lng !== null
  if (hasLat !== hasLng) return NextResponse.json({ error: 'Invalid location' }, { status: 400 })

  const now = new Date().toISOString()
  const update: Record<string, string | number> = { last_seen_at: now }
  if (hasLat && hasLng) {
    const lat = validCoordinate(body.lat, -90, 90)
    const lng = validCoordinate(body.lng, -180, 180)
    if (lat == null || lng == null) return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
    update.lat = lat
    update.lng = lng
    update.location_updated_at = now
  }

  const { error } = await getSupabaseAdmin().from('users').update(update).eq('id', customer.id).eq('active', true)
  if (error) return NextResponse.json({ error: 'Presence unavailable' }, { status: 503 })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
