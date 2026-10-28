import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { DEVICE_SESSION_TTL_SECONDS, signSession, verifySession } from './security'

type DeviceRole = 'customer' | 'driver'
const RENEW_AFTER_SECONDS = 60 * 60 * 24
const CUSTOMER_TRUST_COOKIE = 'achilt_customer_trust'

export function setDeviceSession(res: NextResponse, id: string, role: DeviceRole, version?: string | null) {
  res.headers.set('Cache-Control', 'private, no-store')
  res.cookies.set(`achilt_${role}_session`, signSession(id, role, version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_SESSION_TTL_SECONDS,
  })
}

export function setTrustedCustomerDevice(res: NextResponse, id: string) {
  res.headers.set('Cache-Control', 'private, no-store')
  res.cookies.set(CUSTOMER_TRUST_COOKIE, signSession(id, 'customer'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_SESSION_TTL_SECONDS,
  })
}

export function readTrustedCustomerDevice(req: NextRequest) {
  return verifySession(req.cookies.get(CUSTOMER_TRUST_COOKIE)?.value, 'customer')
}

// Call only after confirming that the account still exists and is active.
export function renewDeviceSession(req: NextRequest, res: NextResponse, id: string, role: DeviceRole) {
  res.headers.set('Cache-Control', 'private, no-store')
  const session = verifySession(req.cookies.get(`achilt_${role}_session`)?.value, role)
  if (session?.sub === id && session.exp - Math.floor(Date.now() / 1000) <= DEVICE_SESSION_TTL_SECONDS - RENEW_AFTER_SECONDS) {
    setDeviceSession(res, id, role, session.version)
  }
}
