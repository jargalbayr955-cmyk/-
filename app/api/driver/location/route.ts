import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-location:${driver.id}`, 12, 60_000))) {
    return NextResponse.json({ error: 'Too many location updates' }, { status: 429 })
  }

  const { lat, lng, available } = await req.json().catch(() => ({}))
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    lat: latitude,
    lng: longitude,
    location_updated_at: new Date().toISOString(),
  }

  if (available === true) {
    try {
      if (!(await driverHasBlockingWork(driver.id))) update.available = true
    } catch {
      return NextResponse.json({ error: 'Driver state check failed' }, { status: 500 })
    }
  } else if (available === false) {
    update.available = false
  }

  const { error } = await getSupabaseAdmin()
    .from('drivers')
    .update(update)
    .eq('id', driver.id)
    .eq('active', true)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Location update failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
