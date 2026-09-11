import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-availability:${driver.id}`, 20, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { available } = await req.json().catch(() => ({}))
  if (typeof available !== 'boolean') return NextResponse.json({ error: 'Invalid value' }, { status: 400 })

  if (available) {
    try {
      if (await driverHasBlockingWork(driver.id)) {
        return NextResponse.json({ error: 'Идэвхтэй ажил эсвэл төлбөр хүлээгдэж байгаа үед онлайн болох боломжгүй' }, { status: 409 })
      }
    } catch {
      return NextResponse.json({ error: 'Төлөв шалгахад алдаа гарлаа' }, { status: 500 })
    }
  }

  const { error } = await getSupabaseAdmin()
    .from('drivers')
    .update({ available })
    .eq('id', driver.id)
    .eq('active', true)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ success: true, available })
}
