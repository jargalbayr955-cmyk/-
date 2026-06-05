import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import * as webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:admin@achilt.mn',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { order_id, from_address, to_address, car_type, car_mark } = await req.json()

  const carLabel = car_type === 'butten' ? 'Бүтэн ачигч' : car_type === 'chiregch' ? 'Чирэгч' : car_type

  // Бүх жолоочийн subscription авах
  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const payload = JSON.stringify({
    title: '🚛 Шинэ захиалга ирлээ!',
    body: `${carLabel}${car_mark ? ` · ${car_mark}` : ''} — ${from_address}`,
    url: '/driver'
  })

  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload)
      sent++
    } catch (err: any) {
      if (err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }

  return NextResponse.json({ sent })
}
