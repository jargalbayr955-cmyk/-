import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { normalizeMnPhone } from '@/lib/server/security'
import { requireAdmin, sameOriginAdminRequest } from '@/lib/server/admin'

export async function POST(req:NextRequest){
 const access=await requireAdmin(req); if(!access.ok)return NextResponse.json({error:access.error},{status:access.status})
 if(!sameOriginAdminRequest(req))return NextResponse.json({error:'Forbidden'},{status:403})
 const {action,driver,id,order_id}=(await req.json().catch(() => null)) ?? {}; const s=getSupabaseAdmin()
 if(action==='add'){
  const phone=normalizeMnPhone(driver?.phone); if(!phone)return NextResponse.json({error:'Утасны дугаар буруу'},{status:400})
  const pin=String(driver?.pin||crypto.randomInt(100000,1000000)); if(!/^\d{4,8}$/.test(pin))return NextResponse.json({error:'PIN буруу'},{status:400})
  const {data:newId,error}=await s.rpc('admin_create_driver_secure',{p_phone:phone,p_name:String(driver?.name||'Шинэ жолооч').slice(0,100),p_pin:pin,p_car_type:driver?.car_type||null})
  if(error)return NextResponse.json({error:error.message},{status:409}); return NextResponse.json({success:true,id:newId,pin})
 }
 if(action==='toggle'){
  if(!id)return NextResponse.json({error:'ID required'},{status:400}); const {data:d}=await s.from('drivers').select('active').eq('id',id).maybeSingle(); if(!d)return NextResponse.json({error:'Not found'},{status:404})
  const next=!d.active; const {error}=await s.from('drivers').update({active:next,available:false}).eq('id',id); if(error)return NextResponse.json({error:'Update failed'},{status:500}); return NextResponse.json({success:true,active:next})
 }
 if(action==='delete'){
  if(!id)return NextResponse.json({error:'ID required'},{status:400}); const {error}=await s.from('drivers').update({active:false,available:false,deleted_at:new Date().toISOString()}).eq('id',id); if(error)return NextResponse.json({error:'Delete failed'},{status:500}); return NextResponse.json({success:true})
 }
 if(action==='reset_pin'){
  if(!id)return NextResponse.json({error:'ID required'},{status:400}); const pin=String(crypto.randomInt(100000,1000000)); const {error}=await s.rpc('set_driver_pin_secure',{p_driver_id:id,p_pin:pin}); if(error)return NextResponse.json({error:'PIN reset failed'},{status:500}); return NextResponse.json({success:true,pin})
 }
 if(action==='release_payment'){
  if(!sameOriginAdminRequest(req))return NextResponse.json({error:'Forbidden'},{status:403})
  if(typeof order_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order_id))return NextResponse.json({error:'Захиалгын дугаар буруу байна.'},{status:400})
  const {data,error}=await s.rpc('admin_approve_driver_payment',{
   p_order_id:order_id,p_session_version:access.credential.session_version,
  })
  if(error)return NextResponse.json({error:error.code==='42501'?'Админаар дахин нэвтэрнэ үү.':'Зөвшөөрөл хадгалагдсангүй. Мэдээллээ шинэчлээд дахин оролдоно уу.'},{status:error.code==='42501'?401:409})
  return NextResponse.json({success:true,...data},{headers:{'Cache-Control':'no-store'}})
 }
 return NextResponse.json({error:'Unknown action'},{status:400})
}
