import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'
import { serviceProfileIsComplete } from '@/lib/service-types'

const FRESH_LOCATION_MS = 2 * 60_000

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-availability:${driver.id}`, 20, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { available } = (await req.json().catch(() => null)) ?? {}
  if (typeof available !== 'boolean') return NextResponse.json({ error: 'Invalid value' }, { status: 400 })

  if (available) {
    if (!serviceProfileIsComplete(driver.service_type, driver.car_type)) {
      return NextResponse.json({ error: 'Профайл хэсэгт үйлчилгээний төрлөө бүрэн сонгоно уу' }, { status: 409 })
    }
    const locationFresh = driver.location_updated_at && Number.isFinite(Number(driver.lat)) && Number.isFinite(Number(driver.lng))
      && Date.now() - new Date(driver.location_updated_at).getTime() <= FRESH_LOCATION_MS
    if (!locationFresh) return NextResponse.json({ error: 'Онлайн болохын өмнө шинэ GPS байршил шаардлагатай' }, { status: 409 })
    try {
      if (await driverHasBlockingWork(driver.id)) {
        return NextResponse.json({ error: 'Идэвхтэй ажил эсвэл төлбөр хүлээгдэж байгаа үед онлайн болох боломжгүй' }, { status: 409 })
      }
    } catch {
      return NextResponse.json({ error: 'Төлөв шалгахад алдаа гарлаа' }, { status: 500 })
    }
  }

  const now = new Date().toISOString()
  const { error } = await getSupabaseAdmin()
    .from('drivers')
    .update({ available, is_online: available, last_heartbeat_at: now })
    .eq('id', driver.id)
    .eq('active', true)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ success: true, available })
}
