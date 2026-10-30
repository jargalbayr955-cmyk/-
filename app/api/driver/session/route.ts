import { NextRequest, NextResponse } from 'next/server'
import { driverNeedsOnboarding, driverServiceProfileIsComplete, requireDriver } from '@/lib/server/driver'
import { renewDeviceSession } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const driver = await requireDriver(req, { allowIncomplete: true })
    if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
    const needsOnboarding = driverNeedsOnboarding(driver)
    const autoStart = !needsOnboarding && driverServiceProfileIsComplete(driver)
    let profile = driver
    if (autoStart && !driver.available) {
      const { error } = await getSupabaseAdmin().from('drivers')
        .update({ available: true, is_online: false })
        .eq('id', driver.id).eq('active', true).is('deleted_at', null)
      if (!error) profile = { ...driver, available: true }
    }
    // A signed-in, fully configured driver stays work-enabled. Dispatch still requires
    // fresh GPS and independently blocks drivers with an active trip or unpaid commission.
    const res = NextResponse.json({ driver: profile, needsOnboarding, autoStart })
    renewDeviceSession(req, res, driver.id, 'driver')
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
