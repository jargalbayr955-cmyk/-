import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, sameOriginAdminRequest } from '@/lib/server/admin'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { normalizeReceivingAccount } from '@/lib/server/khan-bank-sms'

const ALLOWED_KEYS = new Set(['hero_url', 'bank_name', 'bank_account'])

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!sameOriginAdminRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Тохиргооны утга буруу байна.' }, { status: 400 })
  const { key, value } = body
  if (key === 'bank_details') {
    if (!value || typeof value.bank_name !== 'string' || !value.bank_name.trim() || value.bank_name.length > 100 || !normalizeReceivingAccount(value.bank_account)) {
      return NextResponse.json({ error: 'Банкны нэр, бүтэн дансны дугаар эсвэл MN-ээр эхэлсэн IBAN-аа шалгана уу.' }, { status: 400 })
    }
    // One database statement: the bank name/account cannot be partially saved.
    const { error } = await getSupabaseAdmin().from('settings').upsert([
      { key: 'bank_name', value: value.bank_name.trim() },
      { key: 'bank_account', value: normalizeReceivingAccount(value.bank_account) },
    ])
    if (error) return NextResponse.json({ error: 'Данс хадгалагдсангүй. Дахин оролдоно уу.' }, { status: 503 })
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!ALLOWED_KEYS.has(String(key))) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  const v = String(value || '').trim().slice(0, 1000)
  if (key === 'hero_url' && v && !/^https:\/\//i.test(v)) {
    return NextResponse.json({ error: 'Image URL must use HTTPS' }, { status: 400 })
  }
  if (key === 'bank_name' && v.length > 100) return NextResponse.json({ error: 'Bank name too long' }, { status: 400 })
  if (key === 'bank_account' && v.length > 100) return NextResponse.json({ error: 'Account too long' }, { status: 400 })

  const { error } = await getSupabaseAdmin().from('settings').upsert({ key, value: v })
  if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
