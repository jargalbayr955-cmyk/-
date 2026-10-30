import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'
import { driverRoomProfile } from '@/lib/driver-room'

const MAP_WINDOW_MS = 30 * 60_000
const FRESH_WINDOW_MS = 2 * 60_000

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-peers:${driver.id}`, 60, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    if (await driverHasBlockingWork(driver.id)) {
      return NextResponse.json({ peers: [], blocked: true }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
  } catch {
    return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 })
  }

  const room = driverRoomProfile(driver.service_type, driver.car_type)
  if (!room) {
    return NextResponse.json({ peers: [], blocked: false, room: null }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const cutoff = new Date(Date.now() - MAP_WINDOW_MS).toISOString()
  let query = getSupabaseAdmin()
    .from('drivers')
    .select('id,name,service_type,car_type,available,lat,lng,location_updated_at')
    .eq('active', true)
    .is('deleted_at', null)
    .neq('id', driver.id)
    .eq('service_type', room.serviceType)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .gte('location_updated_at', cutoff)
    .order('name', { ascending: true })
    .limit(300)
  if (room.carType) query = query.eq('car_type', room.carType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Жолоочдын байршил татахад алдаа гарлаа' }, { status: 500 })

  const now = Date.now()
  const peers = (data || []).map(peer => ({
    id: peer.id,
    name: String(peer.name || 'Жолооч').trim() || 'Жолооч',
    service_type: peer.service_type,
    car_type: peer.car_type,
    available: Boolean(peer.available),
    lat: Number(peer.lat),
    lng: Number(peer.lng),
    location_updated_at: peer.location_updated_at,
    fresh: peer.location_updated_at ? now - new Date(peer.location_updated_at).getTime() <= FRESH_WINDOW_MS : false,
  }))

  return NextResponse.json({
    peers,
    blocked: false,
    room: { key: room.key, label: room.label },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
