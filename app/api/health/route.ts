import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { isSessionConfigured } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  const authentication = isSessionConfigured() ? 'ok' : 'error'
  let database = 'ok'
  try {
    const { error } = await getSupabaseAdmin().from('settings').select('key').limit(1)
    if (error) throw error
  } catch {
    database = 'error'
  }
  const ok = database === 'ok' && authentication === 'ok'
  return NextResponse.json({ ok, database, authentication, latency_ms: Date.now() - started }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
