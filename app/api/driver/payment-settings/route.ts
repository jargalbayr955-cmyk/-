import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { getPaymentWebhookSecret } from '@/lib/server/payment-webhook'

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().from('settings').select('key,value').in('key', ['bank_name', 'bank_account'])
  if (error) return NextResponse.json({ error: 'Settings unavailable' }, { status: 500 })
  const settings = Object.fromEntries((data || []).map(x => [x.key, x.value]))
  return NextResponse.json({ bank_name: settings.bank_name || '', bank_account: settings.bank_account || '',
    automatic_confirmation: Boolean(getPaymentWebhookSecret() && settings.bank_name && settings.bank_account), approval_required: false,
    commission_percent: 5, rounding_step: 500 }, { headers: { 'Cache-Control': 'no-store' } })
}
