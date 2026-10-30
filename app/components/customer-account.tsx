'use client'

import { useEffect, useRef, useState } from 'react'
import { displayPhone, logoutCustomer, rememberCustomerPhone } from '@/lib/client/session'
import { driverServiceLabel } from '@/lib/service-types'
import { useCustomerIdentity } from './session-gate'

type HistoryRow = {
  id: string
  service_type: string | null
  car_type: string | null
  from_address: string | null
  to_address: string | null
  created_at: string
  completed_at: string | null
  final_price: number | null
}

function dateText(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function CustomerAccount() {
  const user = useCustomerIdentity()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [error, setError] = useState('')
  const pending = useRef(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const controller = new AbortController()
    setHistoryLoading(true)
    setError('')
    fetch('/api/customer/history', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Өмнөх үйлчилгээ татахад алдаа гарлаа')
        if (!cancelled) setHistory(Array.isArray(body.history) ? body.history : [])
      })
      .catch(cause => { if (!cancelled && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Өмнөх үйлчилгээ татахад алдаа гарлаа') })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true; controller.abort() }
  }, [open])

  const logout = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      rememberCustomerPhone(user.phone)
      await logoutCustomer()
      window.location.replace('/start')
    } catch {
      setError('Гарч чадсангүй. Холболтоо шалгаад «Апп-аас гарах» товчийг дахин дарна уу.')
      setBusy(false)
      pending.current = false
    }
  }

  return <div className="customer-account-wrap" style={{position:'relative'}}>
    <button type="button" aria-label="Хэрэглэгчийн профайл" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{
      minHeight:44, border:'1px solid rgba(255,255,255,.16)', borderRadius:999, padding:'0 13px', background:'rgba(8,10,14,.78)', color:'#fff',
      display:'flex', alignItems:'center', gap:7, fontSize:13, fontWeight:850, backdropFilter:'blur(10px)', cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,.2)'
    }}><span aria-hidden="true" style={{fontSize:20}}>👤</span><span>Хэрэглэгч</span></button>

    {open && <div role="presentation" onClick={() => setOpen(false)} style={{position:'fixed', inset:0, zIndex:1200, background:'rgba(0,0,0,.48)', display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
      <section role="dialog" aria-modal="true" aria-label="Хэрэглэгчийн профайл" onClick={event => event.stopPropagation()} style={{
        width:'min(100%,480px)', maxHeight:'84dvh', overflow:'auto', borderRadius:'24px 24px 0 0', background:'#0b0d11', color:'#fff',
        border:'1px solid rgba(255,255,255,.11)', borderBottom:0, padding:'12px 16px calc(18px + env(safe-area-inset-bottom))', boxShadow:'0 -18px 50px rgba(0,0,0,.48)'
      }}>
        <div style={{width:42,height:4,borderRadius:999,background:'rgba(255,255,255,.2)',margin:'0 auto 14px'}} />
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
          <div style={{width:48,height:48,borderRadius:'50%',display:'grid',placeItems:'center',background:'rgba(232,67,58,.16)',fontSize:25}}>👤</div>
          <div style={{flex:1}}><div style={{fontWeight:900,fontSize:18}}>Хэрэглэгч</div><div style={{color:'#939daa',fontSize:12}}>Таны төхөөрөмж дээрх бүртгэл</div></div>
          <button type="button" aria-label="Профайл хаах" onClick={() => setOpen(false)} style={{width:38,height:38,borderRadius:12,border:'1px solid rgba(255,255,255,.1)',background:'#171b22',color:'#fff',fontSize:20,cursor:'pointer'}}>×</button>
        </div>

        <div style={{padding:'13px 14px',borderRadius:16,background:'#141820',border:'1px solid rgba(255,255,255,.08)',marginBottom:16}}>
          <div style={{fontSize:10,color:'#7f8997',fontWeight:900,letterSpacing:'.08em',marginBottom:5}}>УТАСНЫ ДУГААР</div>
          <strong style={{fontSize:17}}>{displayPhone(user.phone)}</strong>
        </div>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',margin:'0 2px 9px'}}><strong style={{fontSize:14}}>Өмнө авсан үйлчилгээ</strong><span style={{color:'#727d8a',fontSize:11}}>Сүүлийн 20</span></div>
        {historyLoading ? <div role="status" style={{padding:18,textAlign:'center',color:'#8e98a5'}}>Уншиж байна…</div> : history.length === 0 ?
          <div style={{padding:18,borderRadius:16,border:'1px dashed rgba(255,255,255,.12)',color:'#8e98a5',textAlign:'center',fontSize:13}}>Дууссан үйлчилгээ одоогоор байхгүй.</div> :
          <div style={{display:'grid',gap:8}}>{history.map(item => <div key={item.id} style={{padding:'11px 12px',borderRadius:15,background:'#12161c',border:'1px solid rgba(255,255,255,.07)'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong style={{fontSize:13}}>{driverServiceLabel(item.service_type, item.car_type)}</strong><span style={{fontSize:10,color:'#7d8794'}}>{dateText(item.completed_at || item.created_at)}</span></div>
            <div style={{fontSize:12,color:'#aeb6c1',marginTop:5,lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis'}}>{item.from_address || 'Үйлчилгээний байршил'}{item.to_address ? ` → ${item.to_address}` : ''}</div>
            {Number(item.final_price) > 0 && <div style={{fontSize:12,color:'#fff',fontWeight:800,marginTop:5}}>{Number(item.final_price).toLocaleString('mn-MN')} ₮</div>}
          </div>)}</div>}

        {error && <p role="alert" style={{color:'#ff8179',fontSize:12,margin:'12px 2px 0'}}>{error}</p>}
        <div style={{marginTop:20,paddingTop:14,borderTop:'1px solid rgba(255,255,255,.08)'}}>
          <p style={{fontSize:11,color:'#7f8997',lineHeight:1.45,margin:'0 2px 10px'}}>Гарсан ч энэ төхөөрөмж дээр баталгаажсан ижил дугаараар дахин ороход OTP SMS шаардахгүй.</p>
          <button type="button" onClick={() => void logout()} disabled={busy} style={{width:'100%',height:48,borderRadius:15,border:'1px solid rgba(232,67,58,.55)',background:'rgba(232,67,58,.08)',color:'#ff7771',fontSize:14,fontWeight:900,cursor:busy?'not-allowed':'pointer'}}>{busy ? 'Гарч байна…' : 'Апп-аас гарах'}</button>
        </div>
      </section>
    </div>}
  </div>
}
