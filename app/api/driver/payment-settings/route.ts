import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().from('settings').select('key,value').in('key', ['bank_name', 'bank_account'])
  if (error) return NextResponse.json({ error: 'Settings unavailable' }, { status: 500 })
  const settings = Object.fromEntries((data || []).map(x => [x.key, x.value]))
  return NextResponse.json({ bank_name: settings.bank_name || '', bank_account: settings.bank_account || '', automatic_confirmation: false, approval_required: true }, { headers: { 'Cache-Control': 'no-store' } })
}
