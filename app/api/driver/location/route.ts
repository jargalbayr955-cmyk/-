import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'
import { serviceProfileIsComplete } from '@/lib/service-types'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-location:${driver.id}`, 12, 60_000))) {
    return NextResponse.json({ error: 'Too many location updates' }, { status: 429 })
  }

  const { lat, lng } = (await req.json().catch(() => null)) ?? {}
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }
  if (!serviceProfileIsComplete(driver.service_type, driver.car_type)) {
    return NextResponse.json({ error: 'Профайл хэсэгт үйлчилгээний төрлөө бүрэн сонгоно уу' }, { status: 409 })
  }

  let blocked = false
  try { blocked = await driverHasBlockingWork(driver.id) }
  catch { return NextResponse.json({ error: 'Driver work state unavailable' }, { status: 503 }) }

  const now = new Date().toISOString()
  const update = {
    lat: latitude,
    lng: longitude,
    location_updated_at: now,
    last_heartbeat_at: now,
    // There is no manual rest mode anymore. A driver is dispatch-available whenever
    // there is no active trip or unpaid commission; GPS continues to update either way.
    ...(blocked ? {} : { available: true }),
    is_online: !blocked,
  }

  const { error } = await getSupabaseAdmin()
    .from('drivers')
    .update(update)
    .eq('id', driver.id)
    .eq('active', true)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Location update failed' }, { status: 500 })
  return NextResponse.json({ success: true, available: blocked ? false : true, location_updated_at: now })
}
