import 'server-only'
import * as webpush from 'web-push'
import { getSupabaseAdmin } from './supabase-admin'

export async function notifyOrderInvites(orderId: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0, invited: 0 }
  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)
  const s = getSupabaseAdmin()
  const { data: order } = await s.from('orders').select('id,from_address,car_type,car_mark,status').eq('id',orderId).maybeSingle()
  if (!order || order.status !== 'pending') return { sent: 0, invited: 0 }
  const { data: invites } = await s.from('driver_invites').select('id,driver_id').eq('order_id',orderId).eq('status','active').is('notified_at',null).limit(8)
  if (!invites?.length) return { sent: 0, invited: 0 }
  const ids = invites.map(i=>i.driver_id)
  const { data: subs } = await s.from('push_subscriptions').select('id,driver_id,subscription').in('driver_id',ids)
  const carLabel = order.car_type === 'butten' ? 'Бүтэн ачигч' : order.car_type === 'chiregch' ? 'Чирэгч' : order.car_type
  const payload = JSON.stringify({ title:'🚛 Танд шинэ захиалга ирлээ!', body:`${carLabel}${order.car_mark ? ` · ${order.car_mark}` : ''} — ${order.from_address}`, url:'/driver' })
  let sent=0
  await Promise.allSettled((subs||[]).map(async sub=>{
    try { await webpush.sendNotification(sub.subscription,payload); sent++ }
    catch(err:any){ if([404,410].includes(err?.statusCode)) await s.from('push_subscriptions').delete().eq('id',sub.id) }
  }))
  await s.from('driver_invites').update({notified_at:new Date().toISOString()}).in('id',invites.map(i=>i.id))
  return { sent, invited: invites.length }
}
