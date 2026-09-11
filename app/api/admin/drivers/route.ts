import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { verifySession, normalizeMnPhone } from '@/lib/server/security'

export async function POST(req:NextRequest){
 const session=verifySession(req.cookies.get('achilt_admin_session')?.value,'admin'); if(!session)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {action,driver,id,order_id}=await req.json().catch(()=>({})); const s=getSupabaseAdmin()
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
  if(!order_id)return NextResponse.json({error:'Order required'},{status:400})
  const {data:o}=await s.from('orders').select('id,driver_id,status').eq('id',order_id).maybeSingle()
  if(!o?.driver_id||o.status!=='completed')return NextResponse.json({error:'Order unavailable'},{status:409})
  const {data:payment}=await s.from('payment_codes').select('id').eq('order_id',o.id).eq('driver_id',o.driver_id).eq('used',false).order('id',{ascending:false}).limit(1).maybeSingle()
  if(payment){
   const {error}=await s.rpc('confirm_payment_atomic',{p_payment_id:payment.id})
   if(error)return NextResponse.json({error:'Payment release failed'},{status:500})
  } else {
   const {error}=await s.from('drivers').update({available:true}).eq('id',o.driver_id).eq('active',true).is('deleted_at',null)
   if(error)return NextResponse.json({error:'Driver release failed'},{status:500})
  }
  return NextResponse.json({success:true})
 }
 return NextResponse.json({error:'Unknown action'},{status:400})
}
