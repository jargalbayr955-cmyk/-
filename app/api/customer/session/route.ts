import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
export async function GET(req: NextRequest) {
  const user = await requireCustomer(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ user })
}
