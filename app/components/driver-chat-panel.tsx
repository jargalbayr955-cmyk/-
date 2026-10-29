'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { driverServiceLabel } from '@/lib/service-types'

export type DriverPeer = {
  id: string
  name: string
  service_type: string | null
  car_type: string | null
  available: boolean
  lat: number
  lng: number
  location_updated_at: string | null
  fresh: boolean
}

type Thread = {
  id: string
  peer: { id: string; name: string; service_type: string | null; car_type: string | null; available: boolean }
  last_message_body: string
  last_message_at: string
  last_message_mine: boolean
  unread_count: number
}

type Message = { id: string; body: string; created_at: string; mine: boolean; read_at: string | null }

const timeText = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('mn-MN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

const dateText = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('mn-MN', { month: 'short', day: 'numeric' }).format(date)
}

export function DriverChatPanel({ peers, open, peerId, onClose, onPeerChange, onUnreadChange }: {
  peers: DriverPeer[]
  open: boolean
  peerId: string | null
  onClose: () => void
  onPeerChange: (id: string | null) => void
  onUnreadChange: (count: number) => void
}) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [canSend, setCanSend] = useState(true)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)
  const [selfBlocked, setSelfBlocked] = useState(false)
  const bottom = useRef<HTMLDivElement | null>(null)

  const refreshThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/driver/chat/threads', { cache: 'no-store' })
      if (response.status === 401) return
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Чат шинэчлэхэд алдаа гарлаа')
      setThreads(Array.isArray(body.threads) ? body.threads : [])
      setSelfBlocked(Boolean(body.blocked))
      onUnreadChange(Number(body.unread_total) || 0)
    } catch (cause) {
      if (open) setError(cause instanceof Error ? cause.message : 'Чат шинэчлэхэд алдаа гарлаа')
    }
  }, [onUnreadChange, open])

  useEffect(() => {
    void refreshThreads()
    const timer = window.setInterval(() => void refreshThreads(), open ? 5_000 : 15_000)
    return () => window.clearInterval(timer)
  }, [open, refreshThreads])

  const refreshMessages = useCallback(async (showLoading = false) => {
    if (!open || !peerId) return
    if (showLoading) setLoading(true)
    try {
      const response = await fetch(`/api/driver/chat/messages?peer_id=${encodeURIComponent(peerId)}`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (response.status === 409 && body.blocked) {
        setSelfBlocked(true); setMessages([]); setError(body.error || 'Чат түр хаалттай'); return
      }
      if (!response.ok) throw new Error(body.error || 'Зурвас татахад алдаа гарлаа')
      setMessages(Array.isArray(body.messages) ? body.messages : [])
      setCanSend(body.can_send !== false)
      setBlockedReason(body.blocked_reason || null)
      setError('')
      void refreshThreads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Зурвас татахад алдаа гарлаа')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [open, peerId, refreshThreads])

  useEffect(() => {
    setMessages([]); setDraft(''); setError(''); setCanSend(true); setBlockedReason(null)
    if (!open || !peerId) return
    void refreshMessages(true)
    const timer = window.setInterval(() => void refreshMessages(false), 3_000)
    return () => window.clearInterval(timer)
  }, [open, peerId, refreshMessages])

  useEffect(() => {
    if (open && peerId) bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, open, peerId])

  const threadByPeer = useMemo(() => new Map(threads.map(thread => [thread.peer.id, thread])), [threads])
  const currentPeer = useMemo(() => {
    if (!peerId) return null
    return peers.find(peer => peer.id === peerId) || threadByPeer.get(peerId)?.peer || null
  }, [peerId, peers, threadByPeer])

  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return threads
    return threads.filter(thread => thread.peer.name.toLowerCase().includes(query))
  }, [search, threads])

  const newPeers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return peers
      .filter(peer => !threadByPeer.has(peer.id))
      .filter(peer => !query || peer.name.toLowerCase().includes(query))
      .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name, 'mn'))
  }, [peers, search, threadByPeer])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!peerId || !text || sending || !canSend || selfBlocked) return
    setSending(true); setError('')
    try {
      const response = await fetch('/api/driver/chat/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer_id: peerId, body: text }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Зурвас илгээхэд алдаа гарлаа')
      if (body.message) setMessages(previous => [...previous, body.message])
      setDraft('')
      void refreshThreads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Зурвас илгээхэд алдаа гарлаа')
      void refreshMessages(false)
    } finally { setSending(false) }
  }

  if (!open) return null

  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:1400, background:'rgba(0,0,0,.55)', display:'flex', justifyContent:'flex-end' }}>
    <section role="dialog" aria-modal="true" aria-label="Жолоочийн чат" style={{ width:'min(100vw,430px)', height:'100dvh', background:'#0b0d11', borderLeft:'1px solid rgba(255,255,255,.1)', color:'#fff', display:'flex', flexDirection:'column', boxShadow:'-18px 0 60px rgba(0,0,0,.45)' }}>
      <header style={{ minHeight:68, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,.08)', background:'#101319' }}>
        {peerId && <button type="button" onClick={() => onPeerChange(null)} aria-label="Чатын жагсаалт руу буцах" style={iconButton}>←</button>}
        <div style={{ minWidth:0, flex:1 }}>
          <strong style={{ display:'block', fontSize:17, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentPeer ? currentPeer.name : 'Жолоочийн чат'}</strong>
          <span style={{ display:'block', marginTop:2, color:'#8e99a8', fontSize:12 }}>
            {currentPeer ? driverServiceLabel(currentPeer.service_type, currentPeer.car_type) : 'Зурвас 30 хоног хадгалагдана'}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Чат хаах" style={iconButton}>×</button>
      </header>

      {!peerId ? <>
        <div style={{ padding:'12px 14px 8px' }}>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Жолооч хайх" aria-label="Жолооч хайх" style={searchInput} />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'4px 10px 18px' }}>
          {selfBlocked && <div style={notice}>Ажил авсан үед жолоочийн чат түр хаагдана. Одоо зөвхөн хэрэглэгчтэй холбогдоно.</div>}
          {!selfBlocked && visibleThreads.length > 0 && <p style={sectionLabel}>ЯРИАНУУД</p>}
          {!selfBlocked && visibleThreads.map(thread => <button key={thread.id} type="button" onClick={() => onPeerChange(thread.peer.id)} style={rowButton}>
            <Avatar name={thread.peer.name} online={thread.peer.available} />
            <span style={{ flex:1, minWidth:0, textAlign:'left' }}>
              <span style={{ display:'flex', justifyContent:'space-between', gap:8 }}><strong style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{thread.peer.name}</strong><small style={{ color:'#77808c', flex:'0 0 auto' }}>{dateText(thread.last_message_at)}</small></span>
              <span style={{ display:'block', color:thread.unread_count ? '#fff' : '#8b95a3', fontWeight:thread.unread_count ? 800 : 500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:4, fontSize:13 }}>{thread.last_message_mine ? 'Та: ' : ''}{thread.last_message_body}</span>
            </span>
            {thread.unread_count > 0 && <span style={badge}>{thread.unread_count > 99 ? '99+' : thread.unread_count}</span>}
          </button>)}
          {!selfBlocked && newPeers.length > 0 && <p style={sectionLabel}>ГАЗРЫН ЗУРАГ ДЭЭР БАЙГАА ЖОЛООЧИД</p>}
          {!selfBlocked && newPeers.map(peer => <button key={peer.id} type="button" onClick={() => onPeerChange(peer.id)} style={rowButton}>
            <Avatar name={peer.name} online={peer.available && peer.fresh} />
            <span style={{ flex:1, minWidth:0, textAlign:'left' }}><strong style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{peer.name}</strong><small style={{ display:'block', color:'#8b95a3', marginTop:4 }}>{driverServiceLabel(peer.service_type, peer.car_type)} · {peer.available && peer.fresh ? 'Онлайн' : 'Сүүлд харагдсан'}</small></span>
          </button>)}
          {!selfBlocked && visibleThreads.length === 0 && newPeers.length === 0 && <div style={{ ...notice, textAlign:'center', marginTop:24 }}>Одоогоор чатлах жолооч харагдахгүй байна.</div>}
        </div>
      </> : <>
        <div style={{ flex:1, overflowY:'auto', padding:'14px 12px 8px', background:'#080a0e' }}>
          {loading && <div style={{ textAlign:'center', color:'#8b95a3', padding:18 }}>Чат ачаалж байна…</div>}
          {!loading && messages.length === 0 && <div style={{ textAlign:'center', color:'#8b95a3', padding:'34px 18px' }}><div style={{ fontSize:32 }}>💬</div><p style={{ margin:'10px 0 0' }}>Яриагаа эхлүүлээрэй.</p><small>Эндхийн зурвасууд 30 хоногийн дараа автоматаар устна.</small></div>}
          {messages.map(message => <div key={message.id} style={{ display:'flex', justifyContent:message.mine ? 'flex-end' : 'flex-start', margin:'7px 0' }}>
            <div style={{ maxWidth:'78%', borderRadius:18, borderBottomRightRadius:message.mine ? 5 : 18, borderBottomLeftRadius:message.mine ? 18 : 5, padding:'9px 12px 7px', background:message.mine ? '#e8433a' : '#20242b', color:'#fff', boxShadow:'0 4px 16px rgba(0,0,0,.16)' }}>
              <div style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere', lineHeight:1.4, fontSize:14 }}>{message.body}</div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:5, marginTop:4, fontSize:10, color:message.mine ? 'rgba(255,255,255,.75)' : '#8993a0' }}>{timeText(message.created_at)}{message.mine && <span>{message.read_at ? '✓✓' : '✓'}</span>}</div>
            </div>
          </div>)}
          <div ref={bottom} />
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,.08)', padding:'10px 10px calc(10px + env(safe-area-inset-bottom))', background:'#101319' }}>
          {(selfBlocked || !canSend) && <div style={{ ...notice, margin:'0 0 8px' }}>{selfBlocked ? 'Ажил авсан үед зөвхөн хэрэглэгчтэй холбогдоно. Жолоочийн чат түр хаалттай.' : (blockedReason || 'Тухайн жолооч одоо ажилтай байна.')}</div>}
          {error && <div role="alert" style={{ color:'#ff8e88', fontSize:12, margin:'0 4px 8px' }}>{error}</div>}
          <form onSubmit={send} style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
            <textarea value={draft} onChange={event => setDraft(event.target.value.slice(0,2000))} disabled={sending || !canSend || selfBlocked} rows={1} placeholder={canSend && !selfBlocked ? 'Зурвас бичих…' : 'Чат түр хаалттай'} style={{ flex:1, minHeight:44, maxHeight:112, resize:'none', borderRadius:18, border:'1px solid rgba(255,255,255,.12)', background:'#1a1e25', color:'#fff', padding:'11px 13px', font:'inherit', outline:'none' }} />
            <button type="submit" disabled={sending || !draft.trim() || !canSend || selfBlocked} aria-label="Зурвас илгээх" style={{ width:44, height:44, borderRadius:'50%', border:0, background:'#e8433a', color:'#fff', fontSize:18, fontWeight:900, opacity:sending || !draft.trim() || !canSend || selfBlocked ? .45 : 1 }}>➤</button>
          </form>
          <div style={{ textAlign:'center', color:'#66707d', fontSize:10, marginTop:7 }}>Зурвас 30 хоног хадгалагдана</div>
        </div>
      </>}
    </section>
  </div>
}

function Avatar({ name, online }: { name: string; online: boolean }) {
  const initial = (name.trim().charAt(0) || 'Ж').toUpperCase()
  return <span style={{ width:44, height:44, borderRadius:'50%', background:'#242a33', display:'grid', placeItems:'center', flex:'0 0 auto', fontWeight:900, position:'relative' }}>{initial}<i aria-label={online ? 'Онлайн' : 'Офлайн'} style={{ position:'absolute', right:0, bottom:1, width:11, height:11, borderRadius:'50%', background:online ? '#22c55e' : '#6b7280', border:'2px solid #12151a' }} /></span>
}

const iconButton = { width:42, height:42, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'#1a1e25', color:'#fff', fontSize:21, fontWeight:900, cursor:'pointer', flex:'0 0 auto' } as const
const searchInput = { width:'100%', height:44, borderRadius:14, border:'1px solid rgba(255,255,255,.1)', background:'#171b21', color:'#fff', padding:'0 13px', fontSize:15, outline:'none', boxSizing:'border-box' } as const
const rowButton = { width:'100%', minHeight:64, border:0, borderBottom:'1px solid rgba(255,255,255,.06)', background:'transparent', color:'#fff', display:'flex', alignItems:'center', gap:11, padding:'9px 7px', cursor:'pointer' } as const
const sectionLabel = { margin:'14px 8px 5px', color:'#6f7a88', fontSize:10, fontWeight:900, letterSpacing:'.08em' } as const
const badge = { minWidth:20, height:20, padding:'0 5px', borderRadius:12, background:'#e8433a', color:'#fff', display:'grid', placeItems:'center', fontSize:10, fontWeight:900, flex:'0 0 auto' } as const
const notice = { margin:'8px 4px', padding:'11px 12px', borderRadius:12, background:'#211b12', border:'1px solid rgba(245,180,70,.2)', color:'#e8c98d', fontSize:12, lineHeight:1.45 } as const
