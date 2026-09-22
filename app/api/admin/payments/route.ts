import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/admin'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: { 'Cache-Control': 'no-store' } })
  const search = (req.nextUrl.searchParams.get('q') || '').trim()
  const offsetText = req.nextUrl.searchParams.get('offset') || '0'
  const offset = Number(offsetText)
  if (search.length > 40 || !/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    return NextResponse.json({ error: 'Улсын дугаар эсвэл утасны дугаараа шалгана уу.' }, { status: 400 })
  }
  const { data, error } = await getSupabaseAdmin().rpc('admin_search_driver_payments', { p_search: search, p_offset: offset })
  if (error || !data || !Array.isArray(data.payments)) {
    return NextResponse.json({ error: 'Хүлээгдэж буй төлбөрийг татаж чадсангүй. Дахин оролдоно уу.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
