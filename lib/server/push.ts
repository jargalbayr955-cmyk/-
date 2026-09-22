import 'server-only'
import * as webpush from 'web-push'
import { getSupabaseAdmin } from './supabase-admin'
import { isValidPushSubscription } from './push-subscription'

export async function notifySelectedDriver(orderId: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0 }
  const s = getSupabaseAdmin()
  const { data: order } = await s.from('orders').select('id,driver_id,status').eq('id', orderId).maybeSingle()
  if (order?.status !== 'confirmed' || !order.driver_id) return { sent: 0 }
  const { data: subscriptions } = await s.from('push_subscriptions').select('id,driver_id,subscription').eq('driver_id', order.driver_id)
  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)
  // Contact details are restored on the authenticated page, never sent to the lock screen.
  const payload = JSON.stringify({ type: 'ORDER_SELECTED', tag: `selected-${order.id}`, title: 'Таны саналыг сонголоо', body: 'Захиалгаа нээж хэрэглэгчтэй холбогдоно уу.', url: '/driver' })
  let sent = 0
  await Promise.allSettled((subscriptions || []).map(async sub => {
    if (!isValidPushSubscription(sub.subscription)) return
    try { await webpush.sendNotification(sub.subscription, payload, { timeout: 5000, TTL: 120 }); sent++ }
    catch (error: any) {
      if ([404, 410].includes(error?.statusCode)) await s.from('push_subscriptions').delete().eq('id', sub.id)
      else console.warn('Selection push delivery failed', { status: error?.statusCode || 'network' })
    }
  }))
  return { sent }
}

export async function notifyOrderInvites(orderId: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0, invited: 0 }
  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)
  const s = getSupabaseAdmin()
  const { data: order } = await s.from('orders').select('id,from_address,car_type,car_mark,status').eq('id',orderId).maybeSingle()
  if (!order || order.status !== 'pending') return { sent: 0, invited: 0 }
  const { data: invites } = await s.from('driver_invites').select('id,driver_id').eq('order_id',orderId).eq('status','active').gt('expires_at',new Date().toISOString()).is('notified_at',null).limit(8)
  if (!invites?.length) return { sent: 0, invited: 0 }
  const ids = invites.map(i=>i.driver_id)
  const { data: subs } = await s.from('push_subscriptions').select('id,driver_id,subscription').in('driver_id',ids)
  const carLabel = order.car_type === 'butten' ? 'Бүтэн ачигч' : order.car_type === 'chiregch' ? 'Чирэгч' : order.car_type
  const payload = JSON.stringify({ title:'🚛 Танд шинэ захиалга ирлээ!', body:`${carLabel}${order.car_mark ? ` · ${order.car_mark}` : ''} — ${order.from_address}`, url:'/driver' })
  let sent=0
  const deliveredDrivers = new Set<string>()
  await Promise.allSettled((subs||[]).map(async sub=>{
    if (!isValidPushSubscription(sub.subscription)) return
    try {
      await webpush.sendNotification(sub.subscription,payload,{timeout:5000,TTL:60})
      sent++; deliveredDrivers.add(sub.driver_id)
    }
    catch(err:any){
      if([404,410].includes(err?.statusCode)) await s.from('push_subscriptions').delete().eq('id',sub.id)
      else console.warn('Push delivery failed', {status:err?.statusCode || 'network'})
    }
  }))
  const deliveredIds = invites.filter(i=>deliveredDrivers.has(i.driver_id)).map(i=>i.id)
  if (deliveredIds.length) await s.from('driver_invites').update({notified_at:new Date().toISOString()}).in('id',deliveredIds)
  return { sent, invited: invites.length }
}
