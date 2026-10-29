import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { allowRequest } from '@/lib/server/security'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-chat-threads:${driver.id}`, 60, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    if (await driverHasBlockingWork(driver.id)) {
      return NextResponse.json({ threads: [], unread_total: 0, blocked: true }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
  } catch {
    return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 })
  }

  const s = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
  const { data: threads, error } = await s
    .from('driver_chat_threads')
    .select('id,driver_a,driver_b,last_message_body,last_sender_id,last_message_at')
    .or(`driver_a.eq.${driver.id},driver_b.eq.${driver.id}`)
    .gte('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Чатын жагсаалт татахад алдаа гарлаа' }, { status: 500 })
  if (!threads?.length) return NextResponse.json({ threads: [], unread_total: 0, blocked: false }, { headers: { 'Cache-Control': 'private, no-store' } })

  const peerIds = [...new Set(threads.map(thread => thread.driver_a === driver.id ? thread.driver_b : thread.driver_a))]
  const threadIds = threads.map(thread => thread.id)
  const [{ data: peers, error: peerError }, { data: unreadRows, error: unreadError }] = await Promise.all([
    s.from('drivers')
      .select('id,name,service_type,car_type,available')
      .in('id', peerIds)
      .eq('active', true)
      .is('deleted_at', null),
    s.from('driver_chat_messages')
      .select('thread_id')
      .in('thread_id', threadIds)
      .eq('recipient_id', driver.id)
      .is('read_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(2000),
  ])

  if (peerError || unreadError) return NextResponse.json({ error: 'Чатын жагсаалт шинэчлэхэд алдаа гарлаа' }, { status: 500 })

  const peerById = new Map((peers || []).map(peer => [peer.id, peer]))
  const unreadByThread = new Map<string, number>()
  for (const row of unreadRows || []) unreadByThread.set(row.thread_id, (unreadByThread.get(row.thread_id) || 0) + 1)

  const result = threads.flatMap(thread => {
    const peerId = thread.driver_a === driver.id ? thread.driver_b : thread.driver_a
    const peer = peerById.get(peerId)
    if (!peer) return []
    return [{
      id: thread.id,
      peer: {
        id: peer.id,
        name: String(peer.name || 'Жолооч').trim() || 'Жолооч',
        service_type: peer.service_type,
        car_type: peer.car_type,
        available: Boolean(peer.available),
      },
      last_message_body: thread.last_message_body || '',
      last_message_at: thread.last_message_at,
      last_message_mine: thread.last_sender_id === driver.id,
      unread_count: unreadByThread.get(thread.id) || 0,
    }]
  })

  const unreadTotal = result.reduce((sum, thread) => sum + thread.unread_count, 0)
  return NextResponse.json({ threads: result, unread_total: unreadTotal, blocked: false }, { headers: { 'Cache-Control': 'private, no-store' } })
}
