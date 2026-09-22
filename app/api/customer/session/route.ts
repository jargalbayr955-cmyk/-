import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { renewDeviceSession } from '@/lib/server/device-session'
export async function GET(req: NextRequest) {
  try {
    const user = await requireCustomer(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
    const res = NextResponse.json({ user })
    renewDeviceSession(req, res, user.id, 'customer')
    return res
  } catch {
    return NextResponse.json({ error: 'Нэвтрэлт шалгах боломжгүй байна. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
