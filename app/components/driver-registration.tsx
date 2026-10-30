'use client'

import { useEffect, useRef, useState } from 'react'
import { phoneInput } from '@/lib/client/session'
import { ServiceTypePicker } from './service-type-picker'
import { serviceLabel, towTypeLabel, type ServiceType, type TowType } from '@/lib/service-types'

type Step = 'choose-service' | 'choose-tow' | 'details' | 'otp'

const panel = { background: '#0f1319', border: '1px solid rgba(255,255,255,.14)', borderRadius: 22, width: 'min(94vw, 440px)', maxHeight: '90vh', overflowY: 'auto' as const, padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,.55)', color: '#fff' }
const primary = { width: '100%', minHeight: 52, border: 0, borderRadius: 14, background: '#ef3f37', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer' }
const secondary = { minHeight: 44, border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, background: '#171c24', color: '#fff', fontWeight: 800, cursor: 'pointer', padding: '0 14px' }
const input = { width: '100%', minHeight: 50, borderRadius: 12, border: '1px solid rgba(255,255,255,.16)', background: '#171c24', color: '#fff', padding: '0 12px', fontSize: 17, boxSizing: 'border-box' as const }

function VehiclePhoto({ type }: { type: TowType }) {
  const source = type === 'butten' ? '/vehicle-buten-achigch-original.svg' : '/vehicle-chiregch-original.svg'
  return <span style={{ width: '100%', height: 92, overflow: 'hidden', borderRadius: 12, background: '#fff', display: 'grid', placeItems: 'center' }}>
    <img src={source} alt={towTypeLabel(type)} draggable={false} style={{ width: '126%', height: '126%', maxWidth: 'none', objectFit: 'cover', display: 'block' }} />
  </span>
}

export function DriverRegistrationDialog({ initialPhone, onClose }: { initialPhone: string; onClose: () => void }) {
  const [phone, setPhone] = useState(/^\d{8}$/.test(initialPhone) ? initialPhone : '')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [code, setCode] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [, setTick] = useState(0)
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  const [carType, setCarType] = useState<TowType | null>(null)
  const [step, setStep] = useState<Step>('choose-service')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending.current) onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  useEffect(() => {
    if (step === 'details') setTimeout(() => nameRef.current?.focus(), 0)
    if (step === 'otp') setTimeout(() => codeRef.current?.focus(), 0)
  }, [step])

  useEffect(() => {
    if (step !== 'otp') return
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  const resendSeconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))

  const chooseService = (service: ServiceType) => {
    if (busy) return
    setServiceType(service)
    setCarType(null)
    setError('')
    setStep(service === 'achilt' ? 'choose-tow' : 'details')
  }

  const chooseTow = (type: TowType) => {
    if (busy) return
    setCarType(type)
    setError('')
    setStep('details')
  }

  const validateDetails = () => {
    setError('')
    if (!serviceType || (serviceType === 'achilt' && !carType)) return false
    if (!name.trim()) { setError('Нэрээ оруулна уу.'); nameRef.current?.focus(); return false }
    if (!/^\d{8}$/.test(phone)) { setError('8 оронтой утасны дугаараа оруулна уу.'); phoneRef.current?.focus(); return false }
    if (!/^\d{6}$/.test(pin) || pin === '000000') { setError('PIN 6 оронтой байх бөгөөд 000000 байж болохгүй.'); return false }
    if (pin !== confirmPin) { setError('PIN кодууд хоорондоо таарахгүй байна.'); return false }
    return true
  }

  const requestOtp = async () => {
    if (pending.current || !validateDetails()) return
    pending.current = true
    setBusy(true)
    try {
      const response = await fetch('/api/driver/register/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || typeof body.verification_id !== 'string') throw new Error(body.error || 'OTP код илгээж чадсангүй.')
      setVerificationId(body.verification_id)
      setCode('')
      setResendAt(Date.now() + Math.max(1, Number(body.resend_after_seconds) || 60) * 1000)
      setStep('otp')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OTP код илгээж чадсангүй.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const register = async () => {
    if (pending.current || !serviceType || (serviceType === 'achilt' && !carType)) return
    setError('')
    if (!/^\d{6}$/.test(code)) { setError('SMS-ээр ирсэн 6 оронтой OTP кодоо оруулна уу.'); codeRef.current?.focus(); return }
    if (!verificationId) { setError('OTP кодоо дахин авна уу.'); return }

    pending.current = true
    setBusy(true)
    try {
      const response = await fetch('/api/driver/register/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: name.trim(),
          pin,
          verification_id: verificationId,
          code,
          service_type: serviceType,
          car_type: serviceType === 'achilt' ? carType : null,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.driver) throw new Error(body.error || 'Бүртгэл үүсгэж чадсангүй.')

      try { localStorage.setItem('driver_session', JSON.stringify(body.driver)) } catch {}
      window.location.replace(typeof body.redirect === 'string' ? body.redirect : '/driver')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Холболтоо шалгаад дахин оролдоно уу.')
      pending.current = false
      setBusy(false)
    }
  }

  const selectionSummary = serviceType
    ? serviceType === 'achilt' && carType ? `${serviceLabel(serviceType)} · ${towTypeLabel(carType)}` : serviceLabel(serviceType)
    : ''

  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.76)', display:'grid', placeItems:'center', padding:12 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="driver-registration-title" style={panel}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div><p style={{ margin:0, color:'#ff7771', fontWeight:900, fontSize:12 }}>ҮЙЛЧИЛГЭЭ · ЖОЛООЧ</p><h2 id="driver-registration-title" style={{ margin:'6px 0 0', fontSize:24 }}>Жолоочоор бүртгүүлэх</h2></div>
        <button type="button" aria-label="Хаах" disabled={busy} onClick={onClose} style={{ ...secondary, minWidth:44, padding:0, fontSize:20 }}>×</button>
      </div>

      {step === 'choose-service' && <>
        <p style={{ color:'#c6ced8', lineHeight:1.5 }}>Өөрийн ажиллах үйлчилгээний төрлийг сонгоно уу.</p>
        <ServiceTypePicker value={serviceType} onChange={chooseService} disabled={busy} />
      </>}

      {step === 'choose-tow' && <>
        <p style={{ color:'#c6ced8', lineHeight:1.5 }}>Ачилтын машины төрлөө сонгоно уу.</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {(['butten','chiregch'] as TowType[]).map(type => <button key={type} type="button" onClick={() => chooseTow(type)} style={{ ...secondary, height:'auto', padding:10, display:'grid', gap:8, justifyItems:'center', overflow:'hidden' }}><VehiclePhoto type={type} /><strong>{towTypeLabel(type)}</strong></button>)}
        </div>
        <button type="button" disabled={busy} onClick={() => { setStep('choose-service'); setCarType(null); setError('') }} style={{ ...secondary, width:'100%', marginTop:9 }}>← Үйлчилгээ солих</button>
      </>}

      {step === 'details' && <>
        <div style={{ borderRadius:14, padding:12, background:'#10251a', border:'1px solid rgba(84,214,139,.3)', margin:'14px 0' }}>
          <strong style={{ color:'#72e1a3' }}>Утасны дугаараа OTP-оор баталгаажуулаад шууд газрын зураг руу орно.</strong>
          <p style={{ margin:'6px 0 0', color:'#d5e9dd', fontSize:13, lineHeight:1.5 }}>Өөрийн 6 оронтой PIN-ээ үүсгэнэ. PIN-ээ мартвал SMS OTP-оор сэргээх боломжтой.</p>
        </div>
        <p style={{ color:'#c6ced8', lineHeight:1.5, marginBottom:14 }}>Сонгосон төрөл: <strong>{selectionSummary}</strong></p>

        <label htmlFor="driver-register-name" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Нэр</label>
        <input ref={nameRef} id="driver-register-name" type="text" autoComplete="name" value={name} disabled={busy} onChange={e => { setName(e.target.value.slice(0,100)); setError('') }} placeholder="Өөрийн нэр" style={{ ...input, marginBottom:14 }} />

        <label htmlFor="driver-register-phone" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Утасны дугаар</label>
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <span style={{ display:'grid', placeItems:'center', padding:'0 12px', borderRadius:12, background:'#171c24', border:'1px solid rgba(255,255,255,.14)', fontWeight:800 }}>+976</span>
          <input ref={phoneRef} id="driver-register-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={busy} onChange={e => { setPhone(phoneInput(e.target.value)); setError(''); setVerificationId('') }} placeholder="8 оронтой дугаар" style={{ ...input, flex:1, minWidth:0 }} />
        </div>

        <label htmlFor="driver-register-pin" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Нэвтрэх PIN</label>
        <input id="driver-register-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} disabled={busy} onChange={e => { setPin(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="6 оронтой PIN" style={{ ...input, marginBottom:9 }} />
        <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirmPin} disabled={busy} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="PIN дахин оруулах" style={{ ...input, marginBottom:16 }} />

        <button type="button" disabled={busy} onClick={() => void requestOtp()} style={primary}>{busy ? 'OTP илгээж байна…' : 'OTP код авах'}</button>
        <button type="button" disabled={busy} onClick={() => { setStep(serviceType === 'achilt' ? 'choose-tow' : 'choose-service'); setError('') }} style={{ ...secondary, width:'100%', marginTop:9 }}>← Сонголт засах</button>
      </>}

      {step === 'otp' && <>
        <div style={{ borderRadius:14, padding:12, background:'#141d29', border:'1px solid rgba(102,160,255,.28)', margin:'14px 0' }}>
          <strong>+976 {phone.slice(0,4)} {phone.slice(4)} дугаарт OTP код илгээлээ.</strong>
          <p style={{ margin:'6px 0 0', color:'#c6ced8', fontSize:13, lineHeight:1.5 }}>Кодоо баталгаажуулмагц бүртгэл үүсэж шууд жолоочийн газрын зураг нээгдэнэ.</p>
        </div>
        <label htmlFor="driver-register-otp" style={{ display:'block', marginBottom:7, fontWeight:800 }}>OTP код</label>
        <input ref={codeRef} id="driver-register-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={e => { setCode(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="6 оронтой OTP" style={{ ...input, marginBottom:16 }} />
        <button type="button" disabled={busy} onClick={() => void register()} style={primary}>{busy ? 'Бүртгэж байна…' : 'Баталгаажуулаад бүртгүүлэх'}</button>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:9 }}>
          <button type="button" disabled={busy} onClick={() => { setStep('details'); setCode(''); setError('') }} style={secondary}>← Мэдээлэл засах</button>
          <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void requestOtp()} style={secondary}>{resendSeconds > 0 ? `Дахин авах (${resendSeconds})` : 'Код дахин авах'}</button>
        </div>
      </>}

      {error && <div role="alert" style={{ marginTop:12, padding:12, borderRadius:12, background:'#391917', border:'1px solid rgba(255,105,97,.32)', color:'#ffaaa5' }}>{error}</div>}
    </section>
  </div>
}
