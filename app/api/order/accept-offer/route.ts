import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireCustomer } from '@/lib/server/customer'
export async function POST(req:NextRequest){
 const user=await requireCustomer(req); if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!(await allowRequest(`accept-offer:${user.id}`,12,60_000)))return NextResponse.json({error:'Too many requests'},{status:429})
 const {order_id,offer_id}=await req.json().catch(()=>({})); if(!order_id||!offer_id)return NextResponse.json({error:'Missing fields'},{status:400})
 const s=getSupabaseAdmin(); const {data:o}=await s.from('orders').select('id,user_id,user_phone,status').eq('id',order_id).maybeSingle(); if(!o || (o.user_id&&o.user_id!==user.id)||(!o.user_id&&o.user_phone!==user.phone))return NextResponse.json({error:'Order not found'},{status:404})
 if(!o.user_id)await s.from('orders').update({user_id:user.id}).eq('id',o.id).is('user_id',null)
 const {data,error}=await s.rpc('accept_offer_atomic',{p_order_id:order_id,p_offer_id:offer_id}); if(error)return NextResponse.json({error:error.message},{status:409}); return NextResponse.json({success:true,result:data})
}
