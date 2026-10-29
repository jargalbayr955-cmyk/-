'use client'

import { useEffect, useRef, useState } from 'react'
import { phoneInput } from '@/lib/client/session'
import { ServiceTypePicker } from './service-type-picker'
import { serviceLabel, towTypeLabel, type ServiceType, type TowType } from '@/lib/service-types'

type Step = 'choose-service' | 'choose-tow' | 'details'

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
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  const [carType, setCarType] = useState<TowType | null>(null)
  const [step, setStep] = useState<Step>('choose-service')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending.current) onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  useEffect(() => {
    if (step === 'details') setTimeout(() => nameRef.current?.focus(), 0)
  }, [step])

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

  const register = async () => {
    if (pending.current || !serviceType || (serviceType === 'achilt' && !carType)) return
    setError('')
    if (!name.trim()) { setError('Нэрээ оруулна уу.'); nameRef.current?.focus(); return }
    if (!/^\d{8}$/.test(phone)) { setError('8 оронтой утасны дугаараа оруулна уу.'); phoneRef.current?.focus(); return }

    pending.current = true
    setBusy(true)
    try {
      const response = await fetch('/api/driver/register/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: name.trim(),
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
          <strong style={{ color:'#72e1a3' }}>Бүртгүүлээд шууд жолоочийн газрын зураг руу орно.</strong>
          <p style={{ margin:'6px 0 0', color:'#d5e9dd', fontSize:13, lineHeight:1.5 }}>Төлбөр болон админы зөвшөөрөл хүлээхгүй. Нэр, утасны дугаар байхад бүртгэл үүснэ.</p>
        </div>
        <p style={{ color:'#c6ced8', lineHeight:1.5, marginBottom:14 }}>Сонгосон төрөл: <strong>{selectionSummary}</strong></p>

        <label htmlFor="driver-register-name" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Нэр</label>
        <input ref={nameRef} id="driver-register-name" type="text" autoComplete="name" value={name} disabled={busy} onChange={e => { setName(e.target.value.slice(0,100)); setError('') }} placeholder="Өөрийн нэр" style={{ ...input, marginBottom:14 }} />

        <label htmlFor="driver-register-phone" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Утасны дугаар</label>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <span style={{ display:'grid', placeItems:'center', padding:'0 12px', borderRadius:12, background:'#171c24', border:'1px solid rgba(255,255,255,.14)', fontWeight:800 }}>+976</span>
          <input ref={phoneRef} id="driver-register-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={busy} onChange={e => { setPhone(phoneInput(e.target.value)); setError('') }} placeholder="8 оронтой дугаар" style={{ ...input, flex:1, minWidth:0 }} />
        </div>

        <button type="button" disabled={busy} onClick={() => void register()} style={primary}>{busy ? 'Бүртгэж, нэвтрүүлж байна…' : 'Бүртгүүлээд шууд нэвтрэх'}</button>
        <button type="button" disabled={busy} onClick={() => { setStep(serviceType === 'achilt' ? 'choose-tow' : 'choose-service'); setError('') }} style={{ ...secondary, width:'100%', marginTop:9 }}>← Сонголт засах</button>
      </>}

      {error && <div role="alert" style={{ marginTop:12, padding:12, borderRadius:12, background:'#391917', border:'1px solid rgba(255,105,97,.32)', color:'#ffaaa5' }}>{error}</div>}
    </section>
  </div>
}
