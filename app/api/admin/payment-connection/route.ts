import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, sameOriginAdminRequest } from '@/lib/server/admin'
import { getPaymentWebhookSecret } from '@/lib/server/payment-webhook'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { normalizeReceivingAccount, readBankSmsConfig, validBankSmsConfig } from '@/lib/server/khan-bank-sms'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: { 'Cache-Control': 'no-store' } })
  const secret = getPaymentWebhookSecret()
  if (!secret) return NextResponse.json({ error: 'Холболтын түлхүүр тохируулагдаагүй.' }, { status: 503 })
  const { data, error } = await getSupabaseAdmin().from('settings').select('key,value').in('key', ['bank_name', 'bank_account', 'bank_sms_config'])
  if (error) return NextResponse.json({ error: 'Тохиргоог ачаалж чадсангүй.' }, { status: 503 })
  const settings = Object.fromEntries((data || []).map(x => [x.key, x.value]))
  const config = readBankSmsConfig(settings.bank_sms_config, settings.bank_account)
  return NextResponse.json({ url: new URL('/api/payment/verify', req.url).href, secret,
    bankName: settings.bank_name || '', bankAccount: settings.bank_account || '',
    sender: config?.sender || '', accountMask: config?.accountMask || '', configured: Boolean(config),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!sameOriginAdminRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.sender !== 'string' || typeof body.accountMask !== 'string') return NextResponse.json({ error: 'SMS илгээгч, дансны загвараа оруулна уу.' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('settings').select('key,value').eq('key', 'bank_account').maybeSingle()
  if (error) return NextResponse.json({ error: 'Тохиргоог ачаалж чадсангүй.' }, { status: 503 })
  const config = { sender: body.sender.trim(), accountMask: body.accountMask.trim(), receivingAccount: normalizeReceivingAccount(data?.value) }
  if (!validBankSmsConfig(config, data?.value)) return NextResponse.json({ error: '«Тохиргоо → Шимтгэл хүлээн авах данс» хэсэгт дансаа хадгална уу. SMS дэх дансны сүүлийн 4 орон тэр данстай таарч, илгээгч хоосон биш байх ёстой.' }, { status: 400 })
  const saved = await supabase.from('settings').upsert({ key: 'bank_sms_config', value: JSON.stringify(config) })
  if (saved.error) return NextResponse.json({ error: 'Хадгалж чадсангүй.' }, { status: 503 })
  return NextResponse.json({ success: true, sender: config.sender, accountMask: config.accountMask }, { headers: { 'Cache-Control': 'no-store' } })
}
