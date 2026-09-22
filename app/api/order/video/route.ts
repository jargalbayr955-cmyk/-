import { NextRequest, NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/server/customer'
import { requireDriver } from '@/lib/server/driver'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { videoIceServers, videoIsConfigured } from '@/lib/server/video-turn'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if ((origin && origin !== req.nextUrl.origin) || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Forbidden' }, 403)
  try {
    const text = await req.text()
    if (text.length > 80_000) return reply({ error: 'Хүсэлт хэт том байна.' }, 413)
    let body
    try { body = JSON.parse(text) } catch { return reply({ error: 'Хүсэлт буруу байна.' }, 400) }
    if (!body || typeof body !== 'object' || !['customer', 'driver'].includes(body.role) || !uuid.test(body.order_id) || !uuid.test(body.instance_id) || !['state', 'prepare', 'start', 'answer', 'end', 'decline'].includes(body.action)) return reply({ error: 'Хүсэлт буруу байна.' }, 400)
    if (['start', 'answer', 'end', 'decline'].includes(body.action) && !uuid.test(body.call_id)) return reply({ error: 'Дуудлага буруу байна.' }, 400)
    if (['start', 'answer'].includes(body.action) && (typeof body.sdp !== 'string' || body.sdp.length > 65_536 || !body.sdp.startsWith('v=0') || !body.sdp.includes('m=audio'))) return reply({ error: 'Дуудлагын холболт буруу байна.' }, 400)
    const actor = body.role === 'customer' ? await requireCustomer(req) : await requireDriver(req)
    if (!actor) return reply({ error: 'Дахин нэвтэрнэ үү.' }, 401)
    const frequent = body.action === 'state'
    if (!(await allowRequest(`video:${body.role}:${actor.id}:${frequent ? 'poll' : 'action'}`, frequent ? 60 : 16, 60_000))) return reply({ error: 'Түр хүлээгээд дахин оролдоно уу.' }, 429)
    // The service-only transaction checks the order, account, role and device ownership again.
    const { data, error } = await getSupabaseAdmin().rpc('manage_order_video_call', {
      p_order_id: body.order_id, p_actor_id: actor.id, p_role: body.role, p_instance: body.instance_id,
      p_action: body.action === 'prepare' ? 'state' : body.action, p_call_id: body.call_id || null,
      p_sdp: ['start', 'answer'].includes(body.action) ? body.sdp : null,
      p_enabled: videoIsConfigured(),
    })
    if (error) {
      if (/Not allowed|Order unavailable/.test(error.message)) return reply({ error: 'Видео дуудлага зөвхөн холбогдсон захиалгын хоёр талд нээлттэй.', code: 'ORDER_UNAVAILABLE' }, 403)
      if (/Call busy|Other device|Call unavailable/.test(error.message)) return reply({ error: 'Дуудлага өөр төхөөрөмж дээр нээлттэй эсвэл дууссан байна.', code: 'CALL_CONFLICT' }, 409)
      if (/Video disabled/.test(error.message)) return reply({ error: 'Видео дуудлагын үйлчилгээ хараахан тохируулагдаагүй байна. Утсаар холбогдоно уу.', code: 'VIDEO_NOT_CONFIGURED' }, 503)
      console.warn('video_call_database_unavailable', { code: error.code })
      return reply({ error: 'Дуудлагын холболтыг шалгаж чадсангүй.' }, 503)
    }
    if (body.action === 'prepare') {
      if (!videoIsConfigured()) return reply({ error: 'Видео дуудлагын үйлчилгээ хараахан тохируулагдаагүй байна. Утсаар холбогдоно уу.', code: 'VIDEO_NOT_CONFIGURED' }, 503)
      return reply({ ...data, ready: true, iceServers: await videoIceServers() })
    }
    return reply({ ...data, ready: videoIsConfigured() })
  } catch {
    // Never log SDP, temporary TURN credentials, provider tokens or account cookies.
    return reply({ error: 'Видео дуудлага түр боломжгүй байна. Утсаар холбогдоно уу.' }, 503)
  }
}
