'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'

type GroupMessage = {
  id: string
  body: string
  created_at: string
  mine: boolean
  sender: { id: string; name: string }
}

const timeText = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('mn-MN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function DriverGroupChatPanel({ open, privateUnread, onClose, onOpenPrivate, onUnreadChange }: {
  open: boolean
  privateUnread: number
  onClose: () => void
  onOpenPrivate: () => void
  onUnreadChange: (count: number) => void
}) {
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [draft, setDraft] = useState('')
  const [roomLabel, setRoomLabel] = useState('Таны чиглэл')
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement | null>(null)
  const lastCreatedAt = useRef<string | null>(null)

  const mergeMessages = useCallback((incoming: GroupMessage[], replace = false) => {
    setMessages(previous => {
      const next = replace ? incoming : (() => {
        const seen = new Set(previous.map(message => message.id))
        return [...previous, ...incoming.filter(message => !seen.has(message.id))]
      })()
      lastCreatedAt.current = next.at(-1)?.created_at || null
      return next
    })
  }, [])

  const load = useCallback(async (mode: 'initial' | 'poll' | 'summary') => {
    if (mode === 'initial') setLoading(true)
    try {
      const params = new URLSearchParams()
      if (mode === 'summary') params.set('summary', '1')
      else params.set('mark_read', '1')
      if (mode === 'poll' && lastCreatedAt.current) params.set('after', lastCreatedAt.current)
      const response = await fetch(`/api/driver/chat/group?${params.toString()}`, { cache: 'no-store' })
      if (response.status === 401) return
      const body = await response.json().catch(() => ({}))
      if (response.status === 409 && body.blocked) {
        setBlocked(true); setError(body.error || 'Чат түр хаалттай'); onUnreadChange(0); return
      }
      if (!response.ok) throw new Error(body.error || 'Ачилт чат шинэчлэхэд алдаа гарлаа')
      setBlocked(false)
      setError('')
      if (body.room?.label) setRoomLabel(body.room.label)
      if (body.members_count != null) setMemberCount(Number(body.members_count) || 0)
      onUnreadChange(Number(body.unread_count) || 0)
      if (Array.isArray(body.messages)) mergeMessages(body.messages, mode === 'initial')
    } catch (cause) {
      if (open) setError(cause instanceof Error ? cause.message : 'Ачилт чат шинэчлэхэд алдаа гарлаа')
    } finally {
      if (mode === 'initial') setLoading(false)
    }
  }, [mergeMessages, onUnreadChange, open])

  useEffect(() => {
    if (open) {
      void load('initial')
      const timer = window.setInterval(() => void load('poll'), 1_800)
      return () => window.clearInterval(timer)
    }
    void load('summary')
    const timer = window.setInterval(() => void load('summary'), 12_000)
    return () => window.clearInterval(timer)
  }, [load, open])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }))
    return () => window.cancelAnimationFrame(frame)
  }, [messages.length, open])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending || blocked) return
    navigator.vibrate?.(18)
    setSending(true); setError('')
    try {
      const response = await fetch('/api/driver/chat/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.status === 409 && body.blocked) {
        setBlocked(true)
        throw new Error(body.error || 'Чат түр хаалттай')
      }
      if (!response.ok) throw new Error(body.error || 'Зурвас илгээхэд алдаа гарлаа')
      if (body.message) mergeMessages([body.message])
      setDraft('')
      onUnreadChange(0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Зурвас илгээхэд алдаа гарлаа')
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  if (!open) return null

  return <div role="presentation" style={{ position:'fixed', inset:0, zIndex:1450, background:'rgba(0,0,0,.58)', display:'flex', justifyContent:'flex-end' }}>
    <section role="dialog" aria-modal="true" aria-label="Ачилт чат" style={{ width:'min(100vw,430px)', height:'100dvh', background:'#0b0d11', color:'#fff', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,.09)', boxShadow:'-18px 0 60px rgba(0,0,0,.48)' }}>
      <header style={{ minHeight:68, padding:'10px 12px', display:'flex', alignItems:'center', gap:9, background:'#101319', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
        <button type="button" onClick={onClose} aria-label="Ачилт чат хаах" style={iconButton}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <strong style={{ display:'block', fontSize:18 }}>Ачилт чат</strong>
          <span style={{ color:'#8e99a8', fontSize:12, display:'block', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {roomLabel}{memberCount != null ? ` · ${memberCount} жолооч` : ''}
          </span>
        </div>
        <button type="button" onClick={onOpenPrivate} style={{ ...privateButton, position:'relative' }}>
          Хувийн
          {privateUnread > 0 && <span style={badge}>{privateUnread > 99 ? '99+' : privateUnread}</span>}
        </button>
      </header>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'14px 10px 8px', background:'#080a0e', overscrollBehavior:'contain' }}>
        <div style={{ textAlign:'center', margin:'0 auto 12px', maxWidth:300, color:'#6f7a88', fontSize:11, lineHeight:1.4 }}>
          Энэ өрөөнд зөвхөн <strong style={{color:'#aeb7c3'}}>{roomLabel}</strong> чиглэлээр бүртгэлтэй жолоочид байна.
        </div>
        {loading && <div style={{ textAlign:'center', color:'#8b95a3', padding:22 }}>Чат ачаалж байна…</div>}
        {!loading && messages.length === 0 && !blocked && <div style={{ textAlign:'center', color:'#8b95a3', padding:'36px 18px' }}><div style={{fontSize:34}}>💬</div><p style={{margin:'10px 0 0'}}>Ачилт чатад хамгийн эхний зурвасаа бичээрэй.</p></div>}
        {messages.map(message => <div key={message.id} style={{ display:'flex', justifyContent:message.mine ? 'flex-end' : 'flex-start', alignItems:'flex-end', gap:7, margin:'7px 0' }}>
          {!message.mine && <Avatar name={message.sender.name} />}
          <div style={{ maxWidth:'78%', minWidth:54 }}>
            {!message.mine && <div style={{ color:'#aab3bf', fontSize:10, fontWeight:800, margin:'0 0 3px 9px' }}>{message.sender.name}</div>}
            <div style={{ borderRadius:18, borderBottomRightRadius:message.mine ? 5 : 18, borderBottomLeftRadius:message.mine ? 18 : 5, padding:'9px 12px 7px', background:message.mine ? '#e8433a' : '#20242b', boxShadow:'0 4px 16px rgba(0,0,0,.16)' }}>
              <div style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere', lineHeight:1.42, fontSize:14 }}>{message.body}</div>
              <div style={{ textAlign:'right', marginTop:4, fontSize:10, color:message.mine ? 'rgba(255,255,255,.72)' : '#8993a0' }}>{timeText(message.created_at)}</div>
            </div>
          </div>
        </div>)}
        <div ref={bottom} />
      </div>

      <div style={{ borderTop:'1px solid rgba(255,255,255,.08)', padding:'9px 9px calc(9px + env(safe-area-inset-bottom))', background:'#101319' }}>
        {blocked && <div style={notice}>Ажил авсан үед жолоочийн чат түр хаалттай. Захиалгаа дуусгасны дараа автоматаар нээгдэнэ.</div>}
        {error && <div role="alert" style={{ color:'#ff8e88', fontSize:12, margin:'0 5px 7px' }}>{error}</div>}
        <form onSubmit={send} style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value.slice(0,2000))}
            onKeyDown={onKeyDown}
            disabled={sending || blocked}
            rows={1}
            enterKeyHint="send"
            placeholder={blocked ? 'Чат түр хаалттай' : 'Зурвас бичих…'}
            aria-label="Ачилт чат зурвас"
            style={{ flex:1, minHeight:44, maxHeight:112, resize:'none', borderRadius:20, border:'1px solid rgba(255,255,255,.12)', background:'#1a1e25', color:'#fff', padding:'11px 14px', font:'inherit', outline:'none', boxSizing:'border-box' }}
          />
          <button type="submit" disabled={sending || blocked || !draft.trim()} aria-label="Зурвас илгээх" style={{ width:44, height:44, borderRadius:'50%', border:0, background:'#e8433a', color:'#fff', fontSize:20, fontWeight:900, cursor:'pointer', opacity:sending || blocked || !draft.trim() ? .42 : 1, transform:'translateZ(0)' }}>➤</button>
        </form>
        <div style={{ textAlign:'center', color:'#66707d', fontSize:10, marginTop:6 }}>Зурвас 30 хоног хадгалагдана</div>
      </div>
    </section>
  </div>
}

function Avatar({ name }: { name: string }) {
  return <span aria-hidden="true" style={{ width:30, height:30, borderRadius:'50%', background:'#242a33', color:'#fff', display:'grid', placeItems:'center', flex:'0 0 auto', fontWeight:900, fontSize:12 }}>{(name.trim().charAt(0) || 'Ж').toUpperCase()}</span>
}

const iconButton = { width:42, height:42, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'#1a1e25', color:'#fff', fontSize:21, fontWeight:900, cursor:'pointer', flex:'0 0 auto' } as const
const privateButton = { minHeight:38, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'#1a1e25', color:'#fff', padding:'0 11px', fontSize:12, fontWeight:800, cursor:'pointer' } as const
const badge = { position:'absolute', top:-7, right:-5, minWidth:18, height:18, padding:'0 4px', borderRadius:10, background:'#e8433a', color:'#fff', border:'2px solid #101319', display:'grid', placeItems:'center', fontSize:9, fontWeight:900 } as const
const notice = { margin:'0 3px 8px', padding:'10px 12px', borderRadius:12, background:'#211b12', border:'1px solid rgba(245,180,70,.2)', color:'#e8c98d', fontSize:12, lineHeight:1.4 } as const
