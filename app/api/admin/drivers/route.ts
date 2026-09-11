import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { verifySession } from '@/lib/server/security'

export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get('achilt_admin_session')?.value, 'admin')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, driver, id } = await req.json().catch(() => ({}))
  const supabaseAdmin = getSupabaseAdmin()

  if (action === 'add') {
    if (!driver?.phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })
    const payload = {
      phone: String(driver.phone).trim(),
      pin: String(driver.pin || '0000').slice(0, 12),
      name: String(driver.name || 'Шинэ жолооч').slice(0, 100),
      car_type: driver.car_type || null,
      price: Number.isFinite(Number(driver.price)) ? Number(driver.price) : 0,
      available: false,
    }
    const { data, error } = await supabaseAdmin.from('drivers').insert(payload).select('id,name,phone,car_type,price,available,lat,lng').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'delete') {
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const { error } = await supabaseAdmin.from('drivers').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'toggle') {
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const { data: d } = await supabaseAdmin.from('drivers').select('available').eq('id', id).single()
    const next = !d?.available
    const { error } = await supabaseAdmin.from('drivers').update({ available: next }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (next) await supabaseAdmin.from('payment_codes').update({ used: true }).eq('driver_id', id).eq('used', false)
    return NextResponse.json({ success: true, available: next })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
