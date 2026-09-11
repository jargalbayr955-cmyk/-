import 'server-only'
import { NextRequest } from 'next/server'
import { verifySession } from './security'
import { getSupabaseAdmin } from './supabase-admin'

export type DriverSessionRecord = {
  id: string
  name: string | null
  phone: string
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

export async function requireDriver(req: NextRequest): Promise<DriverSessionRecord | null> {
  const session = verifySession(req.cookies.get('achilt_driver_session')?.value, 'driver')
  if (!session) return null

  const { data, error } = await getSupabaseAdmin()
    .from('drivers')
    .select('id,name,phone,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at')
    .eq('id', session.sub)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return data as DriverSessionRecord
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
