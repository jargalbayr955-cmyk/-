import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { clearTrustedCustomerDevice, readTrustedCustomerDevice, renewDeviceSession, setDeviceSession, setTrustedCustomerDevice } from '@/lib/server/device-session'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function unauthorized(clearTrust = false) {
  const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  if (clearTrust) clearTrustedCustomerDevice(res)
  return res
}

export async function GET(req: NextRequest) {
  try {
    let user = await requireCustomer(req)
    let restored = false
    const allowRestore = req.nextUrl.searchParams.get('restore') !== '0'

    if (!user && allowRestore) {
      const trusted = readTrustedCustomerDevice(req)
      if (trusted) {
        const { data, error } = await getSupabaseAdmin()
          .from('users')
          .select('id,phone,active')
          .eq('id', trusted.sub)
          .maybeSingle()
        if (error) throw new Error('Trusted customer lookup unavailable')
        if (!data?.active) return unauthorized(true)
        user = data
        restored = true
      }
    }

    if (!user) return unauthorized(false)
    const res = NextResponse.json({ user, restored_from_device: restored }, { headers: { 'Cache-Control': 'private, no-store' } })
    if (restored) setDeviceSession(res, user.id, 'customer')
    else renewDeviceSession(req, res, user.id, 'customer')
    // Refresh the trusted-device proof whenever a verified customer is seen.
    setTrustedCustomerDevice(res, user.id)
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
