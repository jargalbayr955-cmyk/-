import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function pair(a: string, b: string) {
  return a < b ? [a, b] : [b, a]
}

async function peerRecord(peerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('drivers')
    .select('id,name,service_type,car_type,available')
    .eq('id', peerId)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error('peer_lookup_failed')
  return data
}

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-chat-read:${driver.id}`, 120, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const peerId = req.nextUrl.searchParams.get('peer_id') || ''
  if (!UUID.test(peerId) || peerId === driver.id) return NextResponse.json({ error: 'Жолоочийн мэдээлэл буруу байна' }, { status: 400 })

  try {
    if (await driverHasBlockingWork(driver.id)) {
      return NextResponse.json({ error: 'Ажил авсан үед бусад жолоочийн чат түр хаагдана', blocked: true }, { status: 409 })
    }
  } catch {
    return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 })
  }

  let peer
  try { peer = await peerRecord(peerId) }
  catch { return NextResponse.json({ error: 'Жолоочийн мэдээлэл татахад алдаа гарлаа' }, { status: 500 }) }
  if (!peer) return NextResponse.json({ error: 'Жолооч олдсонгүй' }, { status: 404 })

  const [driverA, driverB] = pair(driver.id, peerId)
  const s = getSupabaseAdmin()
  const { data: thread, error: threadError } = await s
    .from('driver_chat_threads')
    .select('id')
    .eq('driver_a', driverA)
    .eq('driver_b', driverB)
    .maybeSingle()
  if (threadError) return NextResponse.json({ error: 'Чат нээхэд алдаа гарлаа' }, { status: 500 })

  let canSend = true
  try { canSend = !(await driverHasBlockingWork(peerId)) }
  catch { return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 }) }

  if (!thread) {
    return NextResponse.json({
      peer: { ...peer, name: String(peer.name || 'Жолооч').trim() || 'Жолооч' },
      messages: [],
      can_send: canSend,
      blocked_reason: canSend ? null : 'Тухайн жолооч одоо ажилтай байна',
      retention_days: 30,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const now = new Date().toISOString()
  const { data: rows, error: messageError } = await s
    .from('driver_chat_messages')
    .select('id,sender_id,recipient_id,body,created_at,read_at')
    .eq('thread_id', thread.id)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(300)
  if (messageError) return NextResponse.json({ error: 'Зурвас татахад алдаа гарлаа' }, { status: 500 })

  const unreadIds = (rows || []).filter(row => row.recipient_id === driver.id && !row.read_at).map(row => row.id)
  if (unreadIds.length) {
    await s.from('driver_chat_messages').update({ read_at: now }).in('id', unreadIds).eq('recipient_id', driver.id)
  }

  const messages = (rows || []).reverse().map(row => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    mine: row.sender_id === driver.id,
    read_at: row.sender_id === driver.id ? row.read_at : (row.read_at || now),
  }))

  return NextResponse.json({
    peer: { ...peer, name: String(peer.name || 'Жолооч').trim() || 'Жолооч' },
    messages,
    can_send: canSend,
    blocked_reason: canSend ? null : 'Тухайн жолооч одоо ажилтай байна',
    retention_days: 30,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-chat-send:${driver.id}`, 40, 60_000))) {
    return NextResponse.json({ error: 'Хэт олон зурвас илгээлээ. Түр хүлээнэ үү.' }, { status: 429 })
  }

  const payload = (await req.json().catch(() => null)) ?? {}
  const peerId = String(payload.peer_id || '')
  const body = String(payload.body || '').trim()
  if (!UUID.test(peerId) || peerId === driver.id) return NextResponse.json({ error: 'Жолоочийн мэдээлэл буруу байна' }, { status: 400 })
  if (!body || body.length > 2000) return NextResponse.json({ error: 'Зурвас 1-2000 тэмдэгт байна' }, { status: 400 })

  try {
    if (await driverHasBlockingWork(driver.id)) {
      return NextResponse.json({ error: 'Ажил авсан үед зөвхөн хэрэглэгчтэй холбогдоно. Жолоочийн чат түр хаалттай.', blocked: true }, { status: 409 })
    }
    const peer = await peerRecord(peerId)
    if (!peer) return NextResponse.json({ error: 'Жолооч олдсонгүй' }, { status: 404 })
    if (await driverHasBlockingWork(peerId)) {
      return NextResponse.json({ error: 'Тухайн жолооч одоо ажилтай байна. Чат түр хаалттай.' }, { status: 409 })
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'peer_lookup_failed') return NextResponse.json({ error: 'Жолоочийн мэдээлэл татахад алдаа гарлаа' }, { status: 500 })
    return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('send_driver_chat_message', {
    p_sender: driver.id,
    p_peer: peerId,
    p_body: body,
  })
  if (error) {
    if (/driver_busy/i.test(error.message || '')) return NextResponse.json({ error: 'Жолооч ажилтай болсон тул чат түр хаагдлаа' }, { status: 409 })
    return NextResponse.json({ error: 'Зурвас илгээхэд алдаа гарлаа' }, { status: 500 })
  }

  return NextResponse.json({ message: { ...data, mine: true, read_at: null } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
}
