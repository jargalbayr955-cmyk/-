import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const ALLOWED_KEYS = new Set(['hero_url', 'bank_name', 'bank_account'])

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_admin_session')?.value, 'admin')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key, value } = await req.json().catch(() => ({}))
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
