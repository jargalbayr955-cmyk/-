import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { notifyOrderInvites } from '@/lib/server/push'
export async function POST(req:NextRequest){
 const user=await requireCustomer(req); if(!user)return NextResponse.json({error:'Unauthorized'},{status:401}); if(!(await allowRequest(`push:${user.id}`,20,60_000)))return NextResponse.json({error:'Rate limited'},{status:429})
 const {order_id}=await req.json().catch(()=>({})); if(!order_id)return NextResponse.json({error:'Missing order'},{status:400}); const {data:o}=await getSupabaseAdmin().from('orders').select('id,user_id,user_phone').eq('id',order_id).maybeSingle(); if(!o||(o.user_id&&o.user_id!==user.id)||(!o.user_id&&o.user_phone!==user.phone))return NextResponse.json({error:'Not found'},{status:404})
 const r=await notifyOrderInvites(order_id); return NextResponse.json(r)
}
