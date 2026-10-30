import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const user = await requireCustomer(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })

    const { data, error } = await getSupabaseAdmin()
      .from('orders')
      .select('id,service_type,car_type,from_address,to_address,created_at,completed_at,final_price')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw new Error('History lookup unavailable')
    return NextResponse.json({ history: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Өмнөх үйлчилгээний мэдээлэл татаж чадсангүй.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
