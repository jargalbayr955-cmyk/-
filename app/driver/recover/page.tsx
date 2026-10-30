'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { phoneInput } from '@/lib/client/session'

export default function DriverRecoverPage() {
  const [phone, setPhone] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [, setTick] = useState(0)
  const phoneRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!verificationId) return
    codeRef.current?.focus()
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [verificationId])

  const resendSeconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))

  const requestOtp = async () => {
    setError('')
    if (!/^\d{8}$/.test(phone)) { setError('8 оронтой утасны дугаараа оруулна уу.'); phoneRef.current?.focus(); return }
    setBusy(true)
    try {
      const res = await fetch('/api/driver/recover/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || typeof body.verification_id !== 'string') throw new Error(body.error || 'OTP код илгээж чадсангүй.')
      setVerificationId(body.verification_id)
      setCode('')
      setResendAt(Date.now() + Math.max(1, Number(body.resend_after_seconds) || 60) * 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OTP код илгээж чадсангүй.')
    } finally { setBusy(false) }
  }

  const submitPhone = (event: FormEvent) => { event.preventDefault(); void requestOtp() }

  const resetPin = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!/^\d{6}$/.test(code)) return setError('SMS-ээр ирсэн 6 оронтой OTP кодоо оруулна уу.')
    if (!/^\d{6}$/.test(pin) || pin === '000000') return setError('Шинэ PIN 6 оронтой байх бөгөөд 000000 байж болохгүй.')
    if (pin !== confirmPin) return setError('Шинэ PIN-үүд хоорондоо таарахгүй байна.')
    setBusy(true)
    try {
      const res = await fetch('/api/driver/recover/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, verification_id: verificationId, code, pin }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) throw new Error(body.error || 'PIN шинэчилж чадсангүй.')
      try { localStorage.setItem('driver_session', JSON.stringify(body.driver)) } catch {}
      window.location.replace(typeof body.redirect === 'string' ? body.redirect : '/driver')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PIN шинэчилж чадсангүй.')
      setBusy(false)
    }
  }

  const inputStyle = { width:'100%', minHeight:50, borderRadius:12, border:'1px solid rgba(255,255,255,.14)', background:'#171c24', color:'#fff', padding:'0 12px', fontSize:17, boxSizing:'border-box' as const }
  const buttonStyle = { width:'100%', minHeight:50, border:0, borderRadius:12, background:'#e8433a', color:'#fff', fontWeight:900, fontSize:15, cursor:'pointer' }

  return <main style={{minHeight:'100vh', background:'#060608', color:'#fff', display:'grid', placeItems:'center', padding:16}}>
    <section style={{width:'min(94vw,430px)', border:'1px solid rgba(255,255,255,.1)', borderRadius:22, padding:20, background:'#0f1319', boxShadow:'0 24px 80px rgba(0,0,0,.45)'}}>
      <p style={{margin:0, color:'#ff7771', fontWeight:900, fontSize:12}}>АЧИЛТ · ЖОЛООЧ</p>
      <h1 style={{margin:'8px 0 6px', fontSize:26}}>PIN сэргээх</h1>
      <p style={{margin:'0 0 18px', color:'#aeb7c3', lineHeight:1.5}}>Бүртгэлтэй утасны дугаараа SMS OTP-оор баталгаажуулаад шинэ 6 оронтой PIN үүсгэнэ.</p>

      {!verificationId ? <form onSubmit={submitPhone}>
        <label htmlFor="recover-phone" style={{display:'block', marginBottom:7, fontWeight:800}}>Утасны дугаар</label>
        <div style={{display:'flex', gap:8, marginBottom:14}}>
          <span style={{display:'grid', placeItems:'center', padding:'0 12px', borderRadius:12, background:'#171c24', border:'1px solid rgba(255,255,255,.14)', fontWeight:800}}>+976</span>
          <input ref={phoneRef} id="recover-phone" type="tel" inputMode="numeric" value={phone} disabled={busy} onChange={e => { setPhone(phoneInput(e.target.value)); setError('') }} placeholder="8 оронтой дугаар" style={{...inputStyle, flex:1, minWidth:0}} />
        </div>
        <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Илгээж байна…' : 'OTP код авах'}</button>
      </form> : <form onSubmit={resetPin}>
        <p style={{margin:'0 0 14px', color:'#c6ced8'}}>+976 {phone.slice(0,4)} {phone.slice(4)} дугаарт ирсэн кодыг оруулна уу.</p>
        <label htmlFor="recover-code" style={{display:'block', marginBottom:7, fontWeight:800}}>OTP код</label>
        <input ref={codeRef} id="recover-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} disabled={busy} maxLength={6} onChange={e => { setCode(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="6 оронтой OTP" style={{...inputStyle, marginBottom:14}} />
        <label htmlFor="recover-pin" style={{display:'block', marginBottom:7, fontWeight:800}}>Шинэ PIN</label>
        <input id="recover-pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} disabled={busy} maxLength={6} onChange={e => { setPin(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="6 оронтой шинэ PIN" style={{...inputStyle, marginBottom:10}} />
        <input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} disabled={busy} maxLength={6} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="Шинэ PIN дахин оруулах" style={{...inputStyle, marginBottom:14}} />
        <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Шинэчилж байна…' : 'PIN шинэчлээд нэвтрэх'}</button>
        <div style={{display:'flex', gap:8, marginTop:10}}>
          <button type="button" disabled={busy} onClick={() => { setVerificationId(''); setCode(''); setPin(''); setConfirmPin(''); setError('') }} style={{flex:1, minHeight:42, borderRadius:10, border:'1px solid rgba(255,255,255,.14)', background:'transparent', color:'#fff'}}>Дугаар солих</button>
          <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void requestOtp()} style={{flex:1, minHeight:42, borderRadius:10, border:'1px solid rgba(255,255,255,.14)', background:'transparent', color:'#fff'}}>{resendSeconds > 0 ? `Дахин авах (${resendSeconds})` : 'Код дахин авах'}</button>
        </div>
      </form>}

      {error && <p role="alert" style={{margin:'12px 0 0', color:'#ff8b84', lineHeight:1.45}}>⚠ {error}</p>}
      <Link href="/driver" style={{display:'block', textAlign:'center', color:'#aeb7c3', marginTop:18, textDecoration:'none'}}>← Жолоочийн нэвтрэх нүүр</Link>
    </section>
  </main>
}
