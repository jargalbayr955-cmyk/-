'use client'

import { useEffect, useRef, useState } from 'react'
import { phoneInput } from '@/lib/client/session'

type CarType = 'butten' | 'chiregch'
type Step = 'choose' | 'payment' | 'success'

const panel = { background: '#0f1319', border: '1px solid rgba(255,255,255,.14)', borderRadius: 22, width: 'min(94vw, 440px)', maxHeight: '90vh', overflowY: 'auto' as const, padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,.55)', color: '#fff' }
const primary = { width: '100%', minHeight: 52, border: 0, borderRadius: 14, background: '#ef3f37', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer' }
const secondary = { minHeight: 44, border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, background: '#171c24', color: '#fff', fontWeight: 800, cursor: 'pointer', padding: '0 14px' }

export function DriverRegistrationDialog({ initialPhone, onClose }: { initialPhone: string; onClose: () => void }) {
  const [phone, setPhone] = useState(/^\d{8}$/.test(initialPhone) ? initialPhone : '')
  const [carType, setCarType] = useState<CarType | null>(null)
  const [requestId, setRequestId] = useState('')
  const [step, setStep] = useState<Step>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending.current) onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  const begin = async (type: CarType) => {
    if (pending.current) return
    setError('')
    if (!/^\d{8}$/.test(phone)) {
      setError('Холбоо барих 8 оронтой утасны дугаараа оруулна уу.')
      phoneRef.current?.focus()
      return
    }
    pending.current = true; setBusy(true); setCarType(type)
    try {
      const response = await fetch('/api/driver/register/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, car_type: type }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Бүртгэлийн хүсэлт үүсгэж чадсангүй.')
      setRequestId(String(body.request_id || ''))
      setStep(body.status === 'paid' || body.status === 'contacted' ? 'success' : 'payment')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Холболтоо шалгаад дахин оролдоно уу.')
    } finally { pending.current = false; setBusy(false) }
  }

  const confirm = async () => {
    if (pending.current || !requestId) return
    pending.current = true; setBusy(true); setError('')
    try {
      const response = await fetch('/api/driver/register/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, phone }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok && (body.status === 'paid' || body.status === 'contacted')) {
        setStep('success')
        return
      }
      throw new Error(body.error || 'Төлбөр хараахан баталгаажаагүй байна. Хэдэн секунд хүлээгээд дахин дарна уу.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Холболтоо шалгаад дахин оролдоно уу.')
    } finally { pending.current = false; setBusy(false) }
  }

  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.76)', display: 'grid', placeItems: 'center', padding: 12 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="driver-registration-title" style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div><p style={{ margin: 0, color: '#ff7771', fontWeight: 900, fontSize: 12 }}>АЧИЛТ · ЖОЛООЧ</p><h2 id="driver-registration-title" style={{ margin: '6px 0 0', fontSize: 24 }}>Жолоочоор бүртгүүлэх</h2></div>
        <button type="button" aria-label="Хаах" disabled={busy} onClick={onClose} style={{ ...secondary, minWidth: 44, padding: 0, fontSize: 20 }}>×</button>
      </div>

      {step === 'choose' && <>
        <p style={{ color: '#c6ced8', lineHeight: 1.5 }}>Холбоо барих дугаараа оруулаад өөрийн ачигчийн төрлийг сонгоно уу.</p>
        <label htmlFor="driver-register-phone" style={{ display: 'block', marginBottom: 7, fontWeight: 800 }}>Утасны дугаар</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><span style={{ display: 'grid', placeItems: 'center', padding: '0 12px', borderRadius: 12, background: '#171c24', border: '1px solid rgba(255,255,255,.14)', fontWeight: 800 }}>+976</span><input ref={phoneRef} id="driver-register-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={busy} onChange={event => { setPhone(phoneInput(event.target.value)); setError('') }} placeholder="8 оронтой дугаар" style={{ flex: 1, minWidth: 0, minHeight: 50, borderRadius: 12, border: '1px solid rgba(255,255,255,.16)', background: '#171c24', color: '#fff', padding: '0 12px', fontSize: 18 }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" disabled={busy} onClick={() => void begin('butten')} style={{ ...secondary, height: 'auto', padding: 12, display: 'grid', gap: 8, justifyItems: 'center' }}><img src="/vehicle-buten-achigch.svg" alt="" style={{ width: '100%', height: 82, objectFit: 'contain' }} /><strong>Бүтэн ачигч</strong></button>
          <button type="button" disabled={busy} onClick={() => void begin('chiregch')} style={{ ...secondary, height: 'auto', padding: 12, display: 'grid', gap: 8, justifyItems: 'center' }}><img src="/vehicle-chiregch.svg" alt="" style={{ width: '100%', height: 82, objectFit: 'contain' }} /><strong>Чирэгч</strong></button>
        </div>
      </>}

      {step === 'payment' && <>
        <p style={{ color: '#c6ced8' }}>Сонгосон төрөл: <strong style={{ color: '#fff' }}>{carType === 'butten' ? 'Бүтэн ачигч' : 'Чирэгч'}</strong></p>
        <div style={{ border: '1px solid rgba(255,255,255,.14)', background: '#171c24', borderRadius: 16, padding: 16, margin: '14px 0' }}>
          <p style={{ margin: '0 0 6px', color: '#9ba7b5', fontSize: 13 }}>Шилжүүлэх данс</p>
          <strong style={{ display: 'block', fontSize: 20, letterSpacing: '.02em' }}>IBAN MN51 0005 00</strong>
          <strong style={{ display: 'block', marginTop: 8, fontSize: 20 }}>5736120860</strong>
          <span style={{ display: 'block', marginTop: 4, color: '#e8edf3', fontWeight: 800 }}>Т.Жаргалбаяр</span>
        </div>
        <div style={{ borderRadius: 14, padding: 14, background: '#251c11', border: '1px solid rgba(255,190,90,.3)', lineHeight: 1.5 }}>
          Гүйлгээний утга дээр зөвхөн <strong>{phone}</strong> утасны дугаараа бичээд шилжүүлнэ үү. Шилжүүлсний дараа доорх <strong>“Баталгаажуулах”</strong> товчийг дарна уу.
        </div>
        <button type="button" disabled={busy} onClick={() => void confirm()} style={{ ...primary, marginTop: 14 }}>{busy ? 'Төлбөр шалгаж байна…' : 'Баталгаажуулах'}</button>
        <button type="button" disabled={busy} onClick={() => { setStep('choose'); setRequestId(''); setError('') }} style={{ ...secondary, width: '100%', marginTop: 9 }}>← Машины төрөл солих</button>
      </>}

      {step === 'success' && <div role="status" style={{ marginTop: 18, padding: 18, borderRadius: 16, background: '#102a1d', border: '1px solid rgba(84,214,139,.3)' }}>
        <h3 style={{ margin: '0 0 8px', color: '#72e1a3' }}>✓ Төлбөр баталгаажлаа</h3>
        <p style={{ margin: 0, lineHeight: 1.55 }}>Жолоочийн бүртгэл үүслээ. Тантай <strong>+976 {phone.slice(0, 4)} {phone.slice(4)}</strong> дугаараар холбогдоно.</p>
        <button type="button" onClick={onClose} style={{ ...primary, marginTop: 16 }}>Ойлголоо</button>
      </div>}

      {error && <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#391917', border: '1px solid rgba(255,105,97,.32)', color: '#ffaaa5' }}>{error}</div>}
    </section>
  </div>
}
