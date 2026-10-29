import 'server-only'
import { NextRequest } from 'next/server'
import { verifySession } from './security'
import { getSupabaseAdmin } from './supabase-admin'
import { serviceProfileIsComplete } from '@/lib/service-types'

export type DriverSessionRecord = {
  id: string
  name: string | null
  phone: string
  service_type: string
  car_type: string | null
  car_number: string | null
  photo_url: string | null
  price: number | null
  available: boolean
  active: boolean
  lat: number | null
  lng: number | null
  location_updated_at: string | null
}

export function driverNeedsOnboarding(driver: Pick<DriverSessionRecord, 'name' | 'car_number'>) {
  const name = String(driver.name || '').trim()
  const carNumber = String(driver.car_number || '').trim()
  return !name || name === 'Шинэ жолооч' || !carNumber
}

export function driverServiceProfileIsComplete(driver: Pick<DriverSessionRecord, 'service_type' | 'car_type'>) {
  return serviceProfileIsComplete(driver.service_type, driver.car_type)
}

type DriverAccessOptions = { allowIncomplete?: boolean }

export async function requireDriver(req: NextRequest, options: DriverAccessOptions = {}): Promise<DriverSessionRecord | null> {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return null

  const { data, error } = await getSupabaseAdmin()
    .from('drivers')
    .select('id,name,phone,service_type,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at,session_version')
    .eq('id', session.sub)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error('Driver session lookup unavailable')
  if (!data || (data.session_version ?? null) !== (session.version ?? null)) return null
  const { session_version: _version, ...driver } = data
  if (!options.allowIncomplete && driverNeedsOnboarding(driver)) return null
  return driver as DriverSessionRecord
}

export async function driverHasBlockingWork(driverId: string) {
  const s = getSupabaseAdmin()
  const [{ count: activeCount, error: activeError }, { count: unpaidCount, error: unpaidError }] = await Promise.all([
    s.from('orders').select('id', { count: 'exact', head: true }).eq('driver_id', driverId).eq('status', 'confirmed'),
    s.from('payment_codes').select('id', { count: 'exact', head: true }).eq('driver_id', driverId).eq('used', false),
  ])
  if (activeError || unpaidError) throw new Error('Could not verify driver work state')
  return (activeCount || 0) > 0 || (unpaidCount || 0) > 0
}
