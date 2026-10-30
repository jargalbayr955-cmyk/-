import { NextRequest, NextResponse } from 'next/server'
import { driverHasBlockingWork, driverNeedsOnboarding, driverServiceProfileIsComplete, requireDriver } from '@/lib/server/driver'
import { renewDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const driver = await requireDriver(req, { allowIncomplete: true })
    if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
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
    // There is no manual rest state: an eligible configured driver is always work-enabled.
    // Active work or unpaid commission remains a dispatch block while GPS/push can keep running.
    const res = NextResponse.json({ driver: profile, needsOnboarding, autoStart })
    renewDeviceSession(req, res, driver.id, 'driver')
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
