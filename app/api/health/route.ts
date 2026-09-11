import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  try {
    const { error } = await getSupabaseAdmin().from('settings').select('key').limit(1)
    if (error) throw error
    return NextResponse.json({ ok: true, database: 'ok', latency_ms: Date.now() - started }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ ok: false, database: 'error' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
