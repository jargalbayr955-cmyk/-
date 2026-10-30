import { NextRequest, NextResponse } from 'next/server'
import { driverHasBlockingWork, driverNeedsOnboarding, driverServiceProfileIsComplete, requireDriver } from '@/lib/server/driver'
import { renewDeviceSession } from '@/lib/server/device-session'

export async function GET(req: NextRequest) {
  try {
    const driver = await requireDriver(req, { allowIncomplete: true })
    if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
    const needsOnboarding = driverNeedsOnboarding(driver)
    let autoStart = false
    if (!needsOnboarding && driver.available && driverServiceProfileIsComplete(driver)) {
      try { autoStart = !(await driverHasBlockingWork(driver.id)) }
      catch { autoStart = false }
    }
    // Session restore must not turn a resting driver back online. The stored
    // available flag is the driver's explicit work/rest choice; a fresh GPS fix
    // remains required before dispatch can consider an available driver online.
    const res = NextResponse.json({ driver, needsOnboarding, autoStart })
    renewDeviceSession(req, res, driver.id, 'driver')
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
