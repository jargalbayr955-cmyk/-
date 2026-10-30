import { NextRequest, NextResponse } from 'next/server'
import { driverHasBlockingWork, driverNeedsOnboarding, driverServiceProfileIsComplete, requireDriver, type DriverSessionRecord } from '@/lib/server/driver'
import { clearTrustedDriverDevice, readTrustedDriverDevice, renewDeviceSession, setDeviceSession, setTrustedDriverDevice } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { verifySession } from '@/lib/server/security'

function unauthorized(clearTrust = false) {
  const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  if (clearTrust) clearTrustedDriverDevice(res)
  return res
}

export async function GET(req: NextRequest) {
  try {
    let driver = await requireDriver(req, { allowIncomplete: true })
    let restoredVersion: string | null = null

    if (!driver) {
      const trusted = readTrustedDriverDevice(req)
      if (trusted) {
        if (!trusted.version) return unauthorized(true)
        const { data, error } = await getSupabaseAdmin()
          .from('drivers')
          .select('id,name,phone,service_type,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at,session_version')
          .eq('id', trusted.sub)
          .eq('active', true)
          .is('deleted_at', null)
          .maybeSingle()
        if (error) throw new Error('Trusted driver lookup unavailable')
        if (!data || !data.session_version || data.session_version !== trusted.version) return unauthorized(true)
        const { session_version, ...profile } = data
        driver = profile as DriverSessionRecord
        restoredVersion = session_version
      }
    }

    if (!driver) return unauthorized(false)
    const needsOnboarding = driverNeedsOnboarding(driver)
    const configured = !needsOnboarding && driverServiceProfileIsComplete(driver)
    let blocked = false
    if (configured) {
      try { blocked = await driverHasBlockingWork(driver.id) }
      catch { return NextResponse.json({ error: 'Ажлын төлөв шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control':'private, no-store' } }) }
    }
    const autoStart = configured && !blocked
    const shouldBeAvailable = autoStart
    let profile = driver
    if (configured && driver.available !== shouldBeAvailable) {
      const { error } = await getSupabaseAdmin().from('drivers')
        .update({ available: shouldBeAvailable, is_online: false })
        .eq('id', driver.id).eq('active', true).is('deleted_at', null)
      if (!error) profile = { ...driver, available: shouldBeAvailable }
    }

    const active = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
    const version = restoredVersion || active?.version || null
    const res = NextResponse.json({ driver: profile, needsOnboarding, autoStart, restored_from_device: Boolean(restoredVersion) }, { headers: { 'Cache-Control':'private, no-store' } })
    if (restoredVersion) setDeviceSession(res, driver.id, 'driver', restoredVersion)
    else renewDeviceSession(req, res, driver.id, 'driver')
    setTrustedDriverDevice(res, driver.id, version)
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
