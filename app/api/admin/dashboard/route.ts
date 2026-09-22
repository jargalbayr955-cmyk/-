import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/admin'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: NextRequest) {
  const access=await requireAdmin(req)
  if(!access.ok) return NextResponse.json({error:access.error},{status:access.status})
  const s=getSupabaseAdmin(); const since=new Date(Date.now()-24*60*60*1000).toISOString()
  const [driversR,activeR,historyR,settingsR,pendingR]=await Promise.all([
    s.from('drivers').select('id,name,phone,car_type,car_number,photo_url,price,available,active,lat,lng,location_updated_at,created_at').is('deleted_at',null).order('created_at',{ascending:false}),
    s.from('orders').select('id,created_at,completed_at,from_address,to_address,driver_id,driver_name,driver_phone,car_type,car_mark,status,final_price,duration_minutes').eq('status','confirmed').order('created_at',{ascending:false}).limit(50),
    s.from('orders').select('id,created_at,completed_at,from_address,to_address,driver_id,driver_name,driver_phone,car_type,car_mark,status,final_price,duration_minutes').eq('status','completed').gte('created_at',since).order('created_at',{ascending:false}).limit(100),
    s.from('settings').select('key,value').in('key',['hero_url','bank_name','bank_account']),
    s.rpc('admin_pending_driver_payments'),
  ])
  if ([driversR,activeR,historyR,settingsR,pendingR].some(result => result.error)) {
    return NextResponse.json({error:'Мэдээлэл татахад алдаа гарлаа. Дахин оролдоно уу.'},{status:503})
  }
  const settings=Object.fromEntries((settingsR.data||[]).map(x=>[x.key,x.value]))
  const pendingPayments=Array.isArray(pendingR.data)?pendingR.data:[]
  return NextResponse.json({drivers:driversR.data||[],activeOrders:activeR.data||[],orders:historyR.data||[],pendingPayments,pendingApprovalCount:Number(pendingPayments[0]?.total_pending||0),heroUrl:settings.hero_url||'',bankName:settings.bank_name||'',bankAccount:settings.bank_account||''},{headers:{'Cache-Control':'no-store'}})
}
