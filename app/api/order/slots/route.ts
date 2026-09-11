import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { requireCustomer } from '@/lib/server/customer'
import { notifyOrderInvites } from '@/lib/server/push'

function distanceKm(lat1:number,lng1:number,lat2:number,lng2:number){const R=6371,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dp=(lat2-lat1)*Math.PI/180,dl=(lng2-lng1)*Math.PI/180,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}

export async function POST(req:NextRequest){
 const user=await requireCustomer(req); if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!(await allowRequest(`order-slots:${user.id}`,40,60_000)))return NextResponse.json({error:'Too many requests'},{status:429})
 const {order_id}=await req.json().catch(()=>({})); if(!order_id)return NextResponse.json({error:'Missing order_id'},{status:400})
 const s=getSupabaseAdmin();
 const {data:order}=await s.from('orders').select('id,user_id,user_phone,status,from_lat,from_lng,driver_id,driver_name,final_price,bidding_expires_at,driver_invites_initialized_at').eq('id',order_id).maybeSingle()
 if(!order || (order.user_id && order.user_id!==user.id) || (!order.user_id && order.user_phone!==user.phone))return NextResponse.json({error:'Order not found'},{status:404})
 if(!order.user_id) await s.from('orders').update({user_id:user.id}).eq('id',order.id).is('user_id',null)
 if(order.status!=='pending')return NextResponse.json({order_status:order.status,selected_driver_id:order.driver_id||null,selected_driver_name:order.driver_name||null,final_price:order.final_price||null,slots:[],expired:false})

 const {data:refreshResult,error:refreshError}=await s.rpc('refresh_order_driver_slots',{p_order_id:order_id});
 if(refreshError)return NextResponse.json({error:'Driver refresh failed'},{status:500})
 if(Number(refreshResult?.inserted||0)>0) await notifyOrderInvites(order_id).catch(()=>{})
 const expired=Boolean(refreshResult?.expired)
 const biddingExpiresAt=refreshResult?.bidding_expires_at || order.bidding_expires_at || null

 const {data:allInvites,error:inviteError}=await s.from('driver_invites').select('id,driver_id,rank,status,invited_at,expires_at,offered_at').eq('order_id',order_id).order('rank',{ascending:true}).limit(8)
 if(inviteError)return NextResponse.json({error:'Invite lookup failed'},{status:500})
 const invitedCount=(allInvites||[]).length
 if(expired || !allInvites?.length)return NextResponse.json({order_status:'pending',expired,bidding_expires_at:biddingExpiresAt,invited_count:invitedCount,slots:[]})

 const liveInvites=allInvites.filter(i=>['active','offered'].includes(i.status))
 if(!liveInvites.length)return NextResponse.json({order_status:'pending',expired:false,bidding_expires_at:biddingExpiresAt,invited_count:invitedCount,slots:[]})
 const ids=liveInvites.map(i=>i.driver_id)
 const [{data:drivers},{data:offers}]=await Promise.all([
   s.from('drivers').select('id,name,car_type,lat,lng,location_updated_at').in('id',ids),
   s.from('offers').select('id,driver_id,price,status,driver_lat,driver_lng').eq('order_id',order_id).in('driver_id',ids).eq('status','pending')
 ])
 const dm=new Map((drivers||[]).map(d=>[d.id,d])),om=new Map((offers||[]).map(o=>[o.driver_id,o])); const fl=Number(order.from_lat),fg=Number(order.from_lng)
 const slots=liveInvites.map(inv=>{const d:any=dm.get(inv.driver_id),o:any=om.get(inv.driver_id); const lat=Number(o?.driver_lat??d?.lat),lng=Number(o?.driver_lng??d?.lng),ok=Number.isFinite(lat)&&Number.isFinite(lng)&&Number.isFinite(fl)&&Number.isFinite(fg); return {invite_id:inv.id,driver_id:inv.driver_id,rank:inv.rank,invite_status:o?'offered':inv.status,invited_at:inv.invited_at,expires_at:inv.expires_at,driver_name:o?(d?.name||'Ачигч'):null,car_type:d?.car_type||null,lat:Number.isFinite(lat)?lat:null,lng:Number.isFinite(lng)?lng:null,distance_km:ok?Math.round(distanceKm(fl,fg,lat,lng)*10)/10:null,offer:o?{id:o.id,price:Number(o.price)}:null}})
 return NextResponse.json({order_status:'pending',expired:false,bidding_expires_at:biddingExpiresAt,invited_count:invitedCount,slots})
}
