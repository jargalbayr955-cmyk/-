'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { phoneInput } from '@/lib/client/session'

type CarType = 'butten' | 'chiregch'
type Step = 'choose' | 'details' | 'payment' | 'success'

const panel = { background: '#0f1319', border: '1px solid rgba(255,255,255,.14)', borderRadius: 22, width: 'min(94vw, 440px)', maxHeight: '90vh', overflowY: 'auto' as const, padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,.55)', color: '#fff' }
const primary = { width: '100%', minHeight: 52, border: 0, borderRadius: 14, background: '#ef3f37', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer' }
const secondary = { minHeight: 44, border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, background: '#171c24', color: '#fff', fontWeight: 800, cursor: 'pointer', padding: '0 14px' }
const input = { width: '100%', minHeight: 50, borderRadius: 12, border: '1px solid rgba(255,255,255,.16)', background: '#171c24', color: '#fff', padding: '0 12px', fontSize: 17, boxSizing: 'border-box' as const }

async function prepareFacePhoto(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Зөвхөн зураг сонгоно уу.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Зураг хэт том байна. 10MB-аас бага зураг сонгоно уу.')
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const item = new Image()
      item.onload = () => resolve(item)
      item.onerror = () => reject(new Error('Зургийг уншиж чадсангүй.'))
      item.src = url
    })
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    const sx = Math.max(0, (image.naturalWidth - side) / 2)
    const sy = Math.max(0, (image.naturalHeight - side) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = 360
    canvas.height = 360
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Зургийг боловсруулах боломжгүй байна.')
    context.drawImage(image, sx, sy, side, side, 0, 0, 360, 360)
    let data = canvas.toDataURL('image/jpeg', 0.76)
    if (data.length > 280_000) data = canvas.toDataURL('image/jpeg', 0.58)
    if (data.length > 280_000) throw new Error('Зургийн хэмжээ хэт том байна. Өөр зураг сонгоно уу.')
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function DriverRegistrationDialog({ initialPhone, onClose }: { initialPhone: string; onClose: () => void }) {
  const [phone, setPhone] = useState(/^\d{8}$/.test(initialPhone) ? initialPhone : '')
  const [name, setName] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [carType, setCarType] = useState<CarType | null>(null)
  const [requestId, setRequestId] = useState('')
  const [paymentCode, setPaymentCode] = useState('')
  const [step, setStep] = useState<Step>('choose')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending.current) onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  useEffect(() => {
    if (step !== 'details') return
    setTimeout(() => nameRef.current?.focus(), 0)
  }, [step, carType])

  useEffect(() => {
    if (step !== 'payment' || !requestId || !/^\d{8}$/.test(phone)) return
    let cancelled = false
    let checking = false
    const poll = async () => {
      if (checking || cancelled) return
      checking = true
      try {
        const response = await fetch('/api/driver/register/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId, phone }),
        })
        const body = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && (body.status === 'paid' || body.status === 'contacted')) {
          setError('')
          setStep('success')
          return
        }
        if (response.status === 409 && body.status === 'awaiting_payment') return
        if (response.status === 410) setError(body.error || 'Бүртгэлийн хугацаа дууссан. Шинээр эхэлнэ үү.')
      } catch {
        // Төлбөрийн төлөвийг дараагийн мөчлөгөөр дахин шалгана.
      } finally {
        checking = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 3_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [step, requestId, phone])

  const chooseType = (type: CarType) => {
    if (busy) return
    setCarType(type)
    setError('')
    setStep('details')
  }

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setError('')
    try {
      setPhotoDataUrl(await prepareFacePhoto(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Зургийг боловсруулахад алдаа гарлаа.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const register = async () => {
    if (pending.current || !carType) return
    setError('')
    if (!name.trim()) {
      setError('Нэрээ оруулна уу.')
      nameRef.current?.focus()
      return
    }
    if (!/^\d{8}$/.test(phone)) {
      setError('8 оронтой утасны дугаараа оруулна уу.')
      phoneRef.current?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    try {
      const response = await fetch('/api/driver/register/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name: name.trim(), car_type: carType, photo_data_url: photoDataUrl || null }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Бүртгэлийн хүсэлт үүсгэж чадсангүй.')
      setRequestId(String(body.request_id || ''))
      if (body.status === 'paid' || body.status === 'contacted') {
        setStep('success')
        return
      }
      const code = String(body.payment_code || '')
      if (!/^\d{6}$/.test(code)) throw new Error('Гүйлгээний код үүссэнгүй. Дахин оролдоно уу.')
      setPaymentCode(code)
      setStep('payment')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Холболтоо шалгаад дахин оролдоно уу.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.76)', display: 'grid', placeItems: 'center', padding: 12 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="driver-registration-title" style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div><p style={{ margin: 0, color: '#ff7771', fontWeight: 900, fontSize: 12 }}>АЧИЛТ · ЖОЛООЧ</p><h2 id="driver-registration-title" style={{ margin: '6px 0 0', fontSize: 24 }}>Жолоочоор бүртгүүлэх</h2></div>
        <button type="button" aria-label="Хаах" disabled={busy} onClick={onClose} style={{ ...secondary, minWidth: 44, padding: 0, fontSize: 20 }}>×</button>
      </div>

      {step === 'choose' && <>
        <p style={{ color: '#c6ced8', lineHeight: 1.5 }}>Өөрийн ачигчийн төрлийг сонгоно уу.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={() => chooseType('butten')} style={{ ...secondary, height: 'auto', padding: 12, display: 'grid', gap: 8, justifyItems: 'center' }}><img src="/vehicle-buten-achigch.svg" alt="" style={{ width: '100%', height: 86, objectFit: 'contain' }} /><strong>Бүтэн ачигч</strong></button>
          <button type="button" onClick={() => chooseType('chiregch')} style={{ ...secondary, height: 'auto', padding: 12, display: 'grid', gap: 8, justifyItems: 'center' }}><img src="/vehicle-chiregch.svg" alt="" style={{ width: '100%', height: 86, objectFit: 'contain' }} /><strong>Чирэгч</strong></button>
        </div>
      </>}

      {step === 'details' && <>
        <p style={{ color: '#c6ced8', lineHeight: 1.5, marginBottom: 14 }}>Сонгосон төрөл: <strong style={{ color: '#fff' }}>{carType === 'butten' ? 'Бүтэн ачигч' : 'Чирэгч'}</strong></p>
        <label htmlFor="driver-register-name" style={{ display: 'block', marginBottom: 7, fontWeight: 800 }}>Нэр</label>
        <input ref={nameRef} id="driver-register-name" type="text" autoComplete="name" value={name} disabled={busy} onChange={event => { setName(event.target.value.slice(0, 100)); setError('') }} placeholder="Өөрийн нэр" style={{ ...input, marginBottom: 14 }} />

        <label htmlFor="driver-register-phone" style={{ display: 'block', marginBottom: 7, fontWeight: 800 }}>Утасны дугаар</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><span style={{ display: 'grid', placeItems: 'center', padding: '0 12px', borderRadius: 12, background: '#171c24', border: '1px solid rgba(255,255,255,.14)', fontWeight: 800 }}>+976</span><input ref={phoneRef} id="driver-register-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={busy} onChange={event => { setPhone(phoneInput(event.target.value)); setError('') }} placeholder="8 оронтой дугаар" style={{ ...input, flex: 1, minWidth: 0 }} /></div>

        <p style={{ margin: '0 0 8px', fontWeight: 800 }}>Нүүр зураг <span style={{ color: '#8d98a6', fontWeight: 700 }}>(алгасаж болно)</span></p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, border: '1px solid rgba(255,255,255,.14)', background: '#171c24', borderRadius: 16, padding: 12, marginBottom: 14 }}>
          <div style={{ width: 78, height: 78, borderRadius: '50%', overflow: 'hidden', flex: '0 0 auto', background: '#272d36', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 900 }}>
            {photoDataUrl ? <img src={photoDataUrl} alt="Нүүр зураг" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name.trim().charAt(0).toUpperCase() || '👤')}
          </div>
          <div style={{ flex: 1 }}>
            <input ref={photoRef} type="file" accept="image/*" capture="user" onChange={event => void choosePhoto(event)} style={{ display: 'none' }} />
            <button type="button" disabled={photoBusy || busy} onClick={() => photoRef.current?.click()} style={{ ...secondary, width: '100%' }}>{photoBusy ? 'Зураг боловсруулж байна…' : photoDataUrl ? 'Зураг солих' : 'Нүүр зураг авах / сонгох'}</button>
            {photoDataUrl && <button type="button" disabled={photoBusy || busy} onClick={() => setPhotoDataUrl('')} style={{ border: 0, background: 'transparent', color: '#aeb8c4', padding: '9px 0 0', cursor: 'pointer', fontWeight: 700 }}>Зураг алгасах</button>}
          </div>
        </div>

        <button type="button" disabled={busy || photoBusy} onClick={() => void register()} style={primary}>{busy ? 'Бүртгэж байна…' : 'Бүртгүүлэх'}</button>
        <button type="button" disabled={busy} onClick={() => { setStep('choose'); setError('') }} style={{ ...secondary, width: '100%', marginTop: 9 }}>← Машины төрөл солих</button>
      </>}

      {step === 'payment' && <>
        <p style={{ color: '#c6ced8', lineHeight: 1.5 }}>Бүртгэлийн мэдээлэл хадгалагдлаа. Доорх данс руу төлбөрөө шилжүүлнэ үү.</p>
        <div style={{ border: '1px solid rgba(255,255,255,.14)', background: '#171c24', borderRadius: 16, padding: 16, margin: '14px 0' }}>
          <p style={{ margin: '0 0 6px', color: '#9ba7b5', fontSize: 13 }}>Шилжүүлэх данс</p>
          <strong style={{ display: 'block', fontSize: 20, letterSpacing: '.02em' }}>IBAN MN51 0005 00</strong>
          <strong style={{ display: 'block', marginTop: 8, fontSize: 20 }}>5736120860</strong>
          <span style={{ display: 'block', marginTop: 4, color: '#e8edf3', fontWeight: 800 }}>Т.Жаргалбаяр</span>
        </div>
        <div style={{ borderRadius: 16, padding: 16, background: '#251c11', border: '1px solid rgba(255,190,90,.3)', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#d6b27b', fontSize: 13, fontWeight: 800 }}>ГҮЙЛГЭЭНИЙ УТГА</p>
          <strong style={{ display: 'block', marginTop: 6, fontSize: 34, letterSpacing: '.18em', color: '#fff' }}>{paymentCode}</strong>
          <p style={{ margin: '10px 0 0', color: '#f1dfc4', lineHeight: 1.55 }}>Гүйлгээний утга дээр зөвхөн энэ 6 оронтой кодыг бичнэ үү. Та төлбөрөө төлсөнөөр автоматаар баталгаажна.</p>
        </div>
        <div role="status" style={{ marginTop: 14, padding: 13, borderRadius: 13, background: '#151d26', color: '#c5d0dc', textAlign: 'center', fontWeight: 800 }}>Төлбөр хүлээж байна… Автоматаар шалгаж байна.</div>
      </>}

      {step === 'success' && <div role="status" style={{ marginTop: 18, padding: 18, borderRadius: 16, background: '#102a1d', border: '1px solid rgba(84,214,139,.3)' }}>
        <h3 style={{ margin: '0 0 8px', color: '#72e1a3' }}>✓ Бүртгэл автоматаар баталгаажлаа</h3>
        <p style={{ margin: 0, lineHeight: 1.55 }}><strong>{name || 'Жолооч'}</strong>-ийн бүртгэл үүслээ. Холбоо барих дугаар: <strong>+976 {phone.slice(0, 4)} {phone.slice(4)}</strong>.</p>
        <button type="button" onClick={onClose} style={{ ...primary, marginTop: 16 }}>Ойлголоо</button>
      </div>}

      {error && <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#391917', border: '1px solid rgba(255,105,97,.32)', color: '#ffaaa5' }}>{error}</div>}
    </section>
  </div>
}
