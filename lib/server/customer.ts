import 'server-only'
import { NextRequest } from 'next/server'
import { verifySession } from './security'
import { getSupabaseAdmin } from './supabase-admin'

export async function requireCustomer(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_customer_session')?.value, 'customer')
  if (!session) return null
  const { data, error } = await getSupabaseAdmin().from('users').select('id,phone,active').eq('id', session.sub).maybeSingle()
  if (error) throw new Error('Customer session lookup unavailable')
  if (!data?.active) return null
  return data
}
