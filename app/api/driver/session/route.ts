import { NextRequest, NextResponse } from 'next/server'
import { driverHasBlockingWork, driverNeedsOnboarding, driverServiceProfileIsComplete, requireDriver } from '@/lib/server/driver'
import { renewDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const driver = await requireDriver(req, { allowIncomplete: true })
    if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
    const needsOnboarding = driverNeedsOnboarding(driver)
    let autoStart = false
    if (!needsOnboarding && driverServiceProfileIsComplete(driver)) {
      try { autoStart = !(await driverHasBlockingWork(driver.id)) }
      catch { autoStart = false }
    }
    if (autoStart && !driver.available) {
      // Persist the intent immediately so order polling cannot flip the client back to idle.
      // Dispatch itself already requires a GPS fix newer than two minutes.
      const { error } = await getSupabaseAdmin().from('drivers')
        .update({ available: true, is_online: false })
        .eq('id', driver.id).eq('active', true).is('deleted_at', null)
      if (error) autoStart = false
    }
    const profile = autoStart ? { ...driver, available: true } : driver
    const res = NextResponse.json({ driver: profile, needsOnboarding, autoStart })
    renewDeviceSession(req, res, driver.id, 'driver')
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
