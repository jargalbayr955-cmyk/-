import 'server-only'
import * as webpush from 'web-push'
import { getSupabaseAdmin } from './supabase-admin'
import { isValidPushSubscription } from './push-subscription'
import { driverServiceLabel } from '@/lib/service-types'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type PushKind = 'order_invite' | 'order_selected' | 'driver_chat'
type PushSubscriptionRow = {
  id: string
  driver_id: string
  subscription: unknown
  failure_count?: number | null
}

async function createDelivery(s: ReturnType<typeof getSupabaseAdmin>, driverId: string, kind: PushKind, orderId?: string | null) {
  const { data, error } = await s.from('driver_push_deliveries').insert({
    driver_id: driverId,
    order_id: orderId || null,
    kind,
    last_sent_at: new Date().toISOString(),
    attempt_count: 1,
    expires_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  }).select('id').single()
  if (error) {
    console.warn('Push delivery tracking unavailable', { kind, code: error.code })
    return null
  }
  return data?.id || null
}

async function sendWithRetry(
  s: ReturnType<typeof getSupabaseAdmin>,
  sub: PushSubscriptionRow,
  payload: string,
  options: { timeout: number; TTL: number; urgency: 'high' | 'normal' },
) {
  if (!isValidPushSubscription(sub.subscription)) return false
  let lastError: any = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await webpush.sendNotification(sub.subscription, payload, options)
      await s.from('push_subscriptions').update({
        last_success_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        failure_count: 0,
        disabled_at: null,
      }).eq('id', sub.id)
      return true
    } catch (error: any) {
      lastError = error
      if ([404, 410].includes(error?.statusCode)) {
        await s.from('push_subscriptions').delete().eq('id', sub.id)
        return false
      }
      if ([400, 401, 403].includes(error?.statusCode) || attempt === 3) break
      await sleep(180 * attempt)
    }
  }
  await s.from('push_subscriptions').update({
    last_failure_at: new Date().toISOString(),
    failure_count: Number(sub.failure_count || 0) + 1,
  }).eq('id', sub.id)
  console.warn('Push delivery failed after retry', { status: lastError?.statusCode || 'network' })
  return false
}

async function activeSubscriptions(s: ReturnType<typeof getSupabaseAdmin>, driverIds: string[]) {
  if (!driverIds.length) return [] as PushSubscriptionRow[]
  const { data } = await s.from('push_subscriptions')
    .select('id,driver_id,subscription,failure_count')
    .in('driver_id', driverIds)
    .is('disabled_at', null)
  return (data || []) as PushSubscriptionRow[]
}

export async function notifySelectedDriver(orderId: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0 }
  const s = getSupabaseAdmin()
  const { data: order } = await s.from('orders').select('id,driver_id,status').eq('id', orderId).maybeSingle()
  if (order?.status !== 'confirmed' || !order.driver_id) return { sent: 0 }
  const subscriptions = await activeSubscriptions(s, [order.driver_id])
  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)
  const deliveryId = await createDelivery(s, order.driver_id, 'order_selected', order.id)
  // Contact details are restored on the authenticated page, never sent to the lock screen.
  const payload = JSON.stringify({
    type: 'ORDER_SELECTED', delivery_id: deliveryId, order_id: order.id,
    tag: `selected-${order.id}`, title: 'Таны саналыг сонголоо',
    body: 'Захиалгаа нээж хэрэглэгчтэй холбогдоно уу.', url: '/driver',
  })
  let sent = 0
  await Promise.allSettled(subscriptions.map(async sub => {
    if (await sendWithRetry(s, sub, payload, { timeout: 5000, TTL: 180, urgency: 'high' })) sent++
  }))
  return { sent, delivery_id: deliveryId }
}

export async function notifyDriverChat(driverId: string, senderName: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0 }
  const s = getSupabaseAdmin()
  const { data: recipient } = await s.from('drivers').select('id,active,deleted_at').eq('id', driverId).maybeSingle()
  if (!recipient?.active || recipient.deleted_at) return { sent: 0 }
  const subscriptions = await activeSubscriptions(s, [driverId])
  if (!subscriptions.length) return { sent: 0 }

  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)
  const safeName = String(senderName || 'Жолооч').trim().slice(0, 80) || 'Жолооч'
  const deliveryId = await createDelivery(s, driverId, 'driver_chat')
  // Do not expose the message body on the lock screen; the authenticated chat loads it after opening.
  const payload = JSON.stringify({
    type: 'DRIVER_CHAT', delivery_id: deliveryId,
    tag: `driver-chat-${driverId}`,
    title: 'Ачилт · Шинэ зурвас',
    body: `${safeName}-ээс шинэ зурвас ирлээ.`,
    url: '/driver',
  })
  let sent = 0
  await Promise.allSettled(subscriptions.map(async sub => {
    if (await sendWithRetry(s, sub, payload, { timeout: 3500, TTL: 3600, urgency: 'normal' })) sent++
  }))
  return { sent, delivery_id: deliveryId }
}

export async function notifyOrderInvites(orderId: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { sent: 0, invited: 0 }
  webpush.setVapidDetails('mailto:admin@achilt.mn', publicKey, privateKey)
  const s = getSupabaseAdmin()
  const { data: order } = await s.from('orders').select('id,from_address,service_type,car_type,car_mark,status').eq('id',orderId).maybeSingle()
  if (!order || order.status !== 'pending') return { sent: 0, invited: 0 }
  const { data: invites } = await s.from('driver_invites').select('id,driver_id').eq('order_id',orderId).eq('status','active').gt('expires_at',new Date().toISOString()).is('notified_at',null).limit(8)
  if (!invites?.length) return { sent: 0, invited: 0 }
  const ids = [...new Set(invites.map(i => i.driver_id))]
  const subs = await activeSubscriptions(s, ids)
  const subsByDriver = new Map<string, PushSubscriptionRow[]>()
  for (const sub of subs) subsByDriver.set(sub.driver_id, [...(subsByDriver.get(sub.driver_id) || []), sub])

  const service = driverServiceLabel(order.service_type, order.car_type)
  const detail = order.service_type === 'achilt' && order.car_mark ? ` · ${order.car_mark}` : ''
  let sent = 0
  const deliveredDrivers = new Set<string>()
  await Promise.allSettled(ids.map(async driverId => {
    const deliveryId = await createDelivery(s, driverId, 'order_invite', order.id)
    const payload = JSON.stringify({
      type: 'ORDER_INVITE', delivery_id: deliveryId, order_id: order.id,
      tag: `order-${order.id}`, title:'🚛 Танд шинэ захиалга ирлээ!',
      body:`${service}${detail} — ${order.from_address}`, url:'/driver',
    })
    const results = await Promise.all((subsByDriver.get(driverId) || []).map(sub =>
      sendWithRetry(s, sub, payload, { timeout: 5000, TTL: 120, urgency: 'high' })
    ))
    const delivered = results.filter(Boolean).length
    sent += delivered
    if (delivered) deliveredDrivers.add(driverId)
  }))
  const deliveredIds = invites.filter(i => deliveredDrivers.has(i.driver_id)).map(i => i.id)
  if (deliveredIds.length) await s.from('driver_invites').update({notified_at:new Date().toISOString()}).in('id',deliveredIds)
  return { sent, invited: invites.length }
}
