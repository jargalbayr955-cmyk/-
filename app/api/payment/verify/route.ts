import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest, getClientIp, safeEqual } from '@/lib/server/security'
import { getPaymentWebhookSecrets, validPaymentReceipt } from '@/lib/server/payment-webhook'
import { parseKhanBankSms, readBankSmsConfig, type BankReceipt } from '@/lib/server/khan-bank-sms'

function registrationError(error: { code?: string } | null, legacy = false) {
  const status = error?.code === 'P0002' ? 404 : error?.code === '22023' ? 400 : error?.code === 'P0001' ? 409 : 503
  return NextResponse.json({ error: status === 404 ? (legacy ? 'Invalid registration reference' : 'Registration code not found') : status === 409 ? 'Payment amount or reference mismatch' : 'Payment verification unavailable' }, { status })
}

function commissionError(error: { code?: string } | null) {
  const status = error?.code === 'P0002' ? 404 : error?.code === '22023' ? 400 : error?.code === 'P0001' ? 409 : 503
  return NextResponse.json({ error: status === 404 ? 'Invalid code' : status === 409 ? 'Payment amount or reference mismatch' : 'Payment verification unavailable' }, { status })
}

export async function POST(req: NextRequest) {
  const secrets = getPaymentWebhookSecrets()
  const provided = req.headers.get('x-webhook-secret') || ''
  if (!provided || secrets.length === 0 || !secrets.some(secret => safeEqual(secret, provided))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const settingsResult = await supabase.from('settings').select('key,value').in('key', ['bank_account', 'bank_sms_config', 'payment_auto_verify_enabled'])
    if (settingsResult.error) return NextResponse.json({ error: 'SMS settings unavailable' }, { status: 503 })
    const settings = Object.fromEntries((settingsResult.data || []).map(x => [x.key, x.value]))
    const config = readBankSmsConfig(settings.bank_sms_config, settings.bank_account)
    if (!config) return NextResponse.json({ error: 'Configure the receiving account and bank SMS sender in admin' }, { status: 503 })
    if (sender !== config.sender) return NextResponse.json({ error: 'SMS sender mismatch' }, { status: 403 })
    receipt = parseKhanBankSms(text, sender, config)
    if (!receipt) return NextResponse.json({ error: 'Expected the configured account, incoming MNT amount and exact six- or eight-digit Utga' }, { status: 400 })
    if (settings.payment_auto_verify_enabled === 'false') return NextResponse.json({ error: 'Automatic payment verification is disabled by admin' }, { status: 423 })
  } else {
    let body: unknown
    try { body = JSON.parse(text) } catch { body = null }
    if (!validPaymentReceipt(body) || ['sms', 'message', 'text'].some(key => key in body)) {
      return NextResponse.json({ error: 'Expected six/eight-digit code, positive integer amount, currency MNT and direction credit' }, { status: 400 })
    }
    receipt = body
  }

  if (/^0\d{5}$/.test(receipt.code)) {
    const registration = await supabase.rpc('confirm_driver_registration_payment_by_code', { p_code: receipt.code, p_amount: receipt.amount })
    if (registration.error) return registrationError(registration.error)
    return NextResponse.json(registration.data, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (/^[1-9]\d{5}$/.test(receipt.code)) {
    const commission = await supabase.rpc('confirm_driver_commission', { p_code: receipt.code, p_amount: receipt.amount })
    if (commission.error) return commissionError(commission.error)
    return NextResponse.json(commission.data, { headers: { 'Cache-Control': 'no-store' } })
  }

  const legacyRegistration = await supabase.rpc('confirm_driver_registration_payment', { p_phone: `+976${receipt.code}`, p_amount: receipt.amount })
  if (legacyRegistration.error) return registrationError(legacyRegistration.error, true)
  return NextResponse.json(legacyRegistration.data, { headers: { 'Cache-Control': 'no-store' } })
}
