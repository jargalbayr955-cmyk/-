import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, safeEqual } from '@/lib/server/security'
import { getPaymentWebhookSecret, validPaymentReceipt } from '@/lib/server/payment-webhook'
import { parseKhanBankSms, readBankSmsConfig, type BankReceipt } from '@/lib/server/khan-bank-sms'

export async function POST(req: NextRequest) {
  const secret = getPaymentWebhookSecret()
  const provided = req.headers.get('x-webhook-secret') || ''
  if (!secret || !provided || !safeEqual(secret, provided)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`payment-webhook:${getClientIp(req)}`, 120, 60_000))) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const supabase = getSupabaseAdmin()
  const contentType = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!['text/plain', 'application/json'].includes(contentType)) return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
  if (Number(req.headers.get('content-length')) > 2048) return NextResponse.json({ error: 'Receipt too large' }, { status: 413 })
  const text = await req.text().catch(() => null)
  if (text === null) return NextResponse.json({ error: 'Invalid receipt' }, { status: 400 })
  if (text.length > 2048) return NextResponse.json({ error: 'Receipt too large' }, { status: 413 })
  let receipt: BankReceipt | null
  if (contentType === 'text/plain') {
    const sender = req.headers.get('x-sms-sender')?.trim()
    if (!sender) return NextResponse.json({ error: 'Missing SMS sender' }, { status: 400 })
    const settingsResult = await supabase.from('settings').select('key,value').in('key', ['bank_account', 'bank_sms_config'])
    if (settingsResult.error) return NextResponse.json({ error: 'SMS settings unavailable' }, { status: 503 })
    const settings = Object.fromEntries((settingsResult.data || []).map(x => [x.key, x.value]))
    const config = readBankSmsConfig(settings.bank_sms_config, settings.bank_account)
    if (!config) return NextResponse.json({ error: 'Configure the receiving account and bank SMS sender in admin' }, { status: 503 })
    if (sender !== config.sender) return NextResponse.json({ error: 'SMS sender mismatch' }, { status: 403 })
    receipt = parseKhanBankSms(text, sender, config)
    if (!receipt) return NextResponse.json({ error: 'Expected the configured account, incoming MNT amount and exact six-digit Utga' }, { status: 400 })
  } else {
    // Compatibility for existing trusted bank adapters, which must themselves
    // validate the bank sender/account. Never merge fields into a raw SMS receipt.
    let body: unknown
    try { body = JSON.parse(text) } catch { body = null }
    if (!validPaymentReceipt(body) || ['sms', 'message', 'text'].some(key => key in body)) {
      return NextResponse.json({ error: 'Expected code, positive integer amount, currency MNT and direction credit' }, { status: 400 })
    }
    receipt = body
  }
  const { data, error } = await supabase.rpc('confirm_driver_commission', { p_code: receipt.code, p_amount: receipt.amount })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : error.code === 'P0001' ? 409 : 503
    return NextResponse.json({ error: status === 404 ? 'Invalid code' : status === 409 ? 'Payment amount or order mismatch' : 'Payment verification unavailable' }, { status })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
