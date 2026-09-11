import { NextRequest, NextResponse } from 'next/server'
import { requireDriver } from '@/lib/server/driver'

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ driver })
}
