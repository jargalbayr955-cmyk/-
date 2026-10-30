import { NextRequest, NextResponse } from 'next/server'
import { driverRoomProfile, type DriverRoom } from '@/lib/driver-room'
import { driverHasBlockingWork, requireDriver } from '@/lib/server/driver'
import { allowRequest } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const INITIAL_MESSAGE_LIMIT = 120
const INCREMENTAL_MESSAGE_LIMIT = 100

function validIsoDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function roomMemberCount(room: DriverRoom) {
  let query = getSupabaseAdmin()
    .from('drivers')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
    .is('deleted_at', null)
    .eq('service_type', room.serviceType)
  if (room.carType) query = query.eq('car_type', room.carType)
  const { count, error } = await query
  if (error) throw new Error('member_count_failed')
  return count || 0
}

async function unreadCount(driverId: string, roomKey: string, lastReadAt: string | null, now: string) {
  let query = getSupabaseAdmin()
    .from('driver_group_messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_key', roomKey)
    .neq('sender_id', driverId)
    .gt('expires_at', now)
  if (lastReadAt) query = query.gt('created_at', lastReadAt)
  const { count, error } = await query
  if (error) throw new Error('unread_count_failed')
  return count || 0
}

export async function GET(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-group-chat-read:${driver.id}`, 180, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const room = driverRoomProfile(driver.service_type, driver.car_type)
  if (!room) return NextResponse.json({ error: 'Үйлчилгээний чиглэлээ профайл дээр бүрэн сонгоно уу' }, { status: 409 })

  try {
    if (await driverHasBlockingWork(driver.id)) {
      return NextResponse.json({ error: 'Ажил авсан үед жолоочийн чат түр хаалттай', blocked: true }, { status: 409 })
    }
  } catch {
    return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 })
  }

  const summary = req.nextUrl.searchParams.get('summary') === '1'
  const markRead = req.nextUrl.searchParams.get('mark_read') === '1'
  const after = validIsoDate(req.nextUrl.searchParams.get('after'))
  const now = new Date().toISOString()
  const s = getSupabaseAdmin()

  const { data: readRow, error: readError } = await s
    .from('driver_group_chat_reads')
    .select('last_read_at')
    .eq('driver_id', driver.id)
    .eq('room_key', room.key)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'Чатын уншсан төлөв татахад алдаа гарлаа' }, { status: 500 })

  let membersCount: number | null = null
  try {
    if (summary || !after) membersCount = await roomMemberCount(room)
  } catch {
    return NextResponse.json({ error: 'Чатын гишүүдийн мэдээлэл татахад алдаа гарлаа' }, { status: 500 })
  }

  let unread = 0
  try {
    unread = markRead ? 0 : await unreadCount(driver.id, room.key, readRow?.last_read_at || null, now)
  } catch {
    return NextResponse.json({ error: 'Уншаагүй зурвас шалгахад алдаа гарлаа' }, { status: 500 })
  }

  if (summary) {
    return NextResponse.json({
      room: { key: room.key, label: room.label },
      members_count: membersCount,
      unread_count: unread,
      retention_days: 30,
      blocked: false,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  let messageQuery = s
    .from('driver_group_messages')
    .select('id,sender_id,body,created_at')
    .eq('room_key', room.key)
    .gt('expires_at', now)

  if (after) {
    messageQuery = messageQuery
      .gt('created_at', after)
      .order('created_at', { ascending: true })
      .limit(INCREMENTAL_MESSAGE_LIMIT)
  } else {
    messageQuery = messageQuery
      .order('created_at', { ascending: false })
      .limit(INITIAL_MESSAGE_LIMIT)
  }

  const { data: rawRows, error: messageError } = await messageQuery
  if (messageError) return NextResponse.json({ error: 'Group chat татахад алдаа гарлаа' }, { status: 500 })
  const rows = after ? (rawRows || []) : [...(rawRows || [])].reverse()

  const senderIds = [...new Set(rows.map(row => row.sender_id))]
  const names = new Map<string, string>()
  if (senderIds.length) {
    const { data: senders, error: senderError } = await s
      .from('drivers')
      .select('id,name')
      .in('id', senderIds)
    if (senderError) return NextResponse.json({ error: 'Жолоочийн нэр татахад алдаа гарлаа' }, { status: 500 })
    for (const sender of senders || []) names.set(sender.id, String(sender.name || 'Жолооч').trim() || 'Жолооч')
  }

  if (markRead) {
    const { error: markError } = await s.from('driver_group_chat_reads').upsert({
      driver_id: driver.id,
      room_key: room.key,
      last_read_at: now,
    }, { onConflict: 'driver_id,room_key' })
    if (markError) return NextResponse.json({ error: 'Чатын уншсан төлөв хадгалахад алдаа гарлаа' }, { status: 500 })
  }

  const messages = rows.map(row => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    mine: row.sender_id === driver.id,
    sender: { id: row.sender_id, name: names.get(row.sender_id) || 'Жолооч' },
  }))

  return NextResponse.json({
    room: { key: room.key, label: room.label },
    members_count: membersCount,
    unread_count: markRead ? 0 : unread,
    messages,
    retention_days: 30,
    blocked: false,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const driver = await requireDriver(req)
  if (!driver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await allowRequest(`driver-group-chat-send:${driver.id}`, 50, 60_000))) {
    return NextResponse.json({ error: 'Хэт олон зурвас илгээлээ. Түр хүлээнэ үү.' }, { status: 429 })
  }

  const room = driverRoomProfile(driver.service_type, driver.car_type)
  if (!room) return NextResponse.json({ error: 'Үйлчилгээний чиглэлээ профайл дээр бүрэн сонгоно уу' }, { status: 409 })

  try {
    if (await driverHasBlockingWork(driver.id)) {
      return NextResponse.json({ error: 'Ажил авсан үед жолоочийн чат түр хаалттай', blocked: true }, { status: 409 })
    }
  } catch {
    return NextResponse.json({ error: 'Жолоочийн төлөв шалгахад алдаа гарлаа' }, { status: 500 })
  }

  const payload = (await req.json().catch(() => null)) ?? {}
  const body = String(payload.body || '').trim()
  if (!body || body.length > 2000) return NextResponse.json({ error: 'Зурвас 1-2000 тэмдэгт байна' }, { status: 400 })

  const s = getSupabaseAdmin()
  const { data, error } = await s
    .from('driver_group_messages')
    .insert({ room_key: room.key, sender_id: driver.id, body })
    .select('id,sender_id,body,created_at')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Зурвас илгээхэд алдаа гарлаа' }, { status: 500 })

  await s.from('driver_group_chat_reads').upsert({
    driver_id: driver.id,
    room_key: room.key,
    last_read_at: data.created_at,
  }, { onConflict: 'driver_id,room_key' })

  return NextResponse.json({
    message: {
      id: data.id,
      body: data.body,
      created_at: data.created_at,
      mine: true,
      sender: { id: driver.id, name: String(driver.name || 'Жолооч').trim() || 'Жолооч' },
    },
    room: { key: room.key, label: room.label },
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
}
