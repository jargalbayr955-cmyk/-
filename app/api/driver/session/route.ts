import { NextRequest, NextResponse } from 'next/server'
import { driverHasBlockingWork, driverNeedsOnboarding, driverServiceProfileIsComplete, requireDriver } from '@/lib/server/driver'
import { renewDeviceSession } from '@/lib/server/device-session'

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
    // `available: true` here starts the client GPS watcher. The database is not made
    // available until /api/driver/location receives a fresh valid coordinate.
    const profile = autoStart ? { ...driver, available: true } : driver
    const res = NextResponse.json({ driver: profile, needsOnboarding, autoStart })
    renewDeviceSession(req, res, driver.id, 'driver')
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
