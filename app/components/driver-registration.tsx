'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { phoneInput } from '@/lib/client/session'
import { ServiceTypePicker } from './service-type-picker'
import { serviceLabel, towTypeLabel, type ServiceType, type TowType } from '@/lib/service-types'

type Step = 'choose-service' | 'choose-tow' | 'details' | 'payment'

const REGISTRATION_FEE = 25_000
const REGISTRATION_IBAN = 'MN51 0005 00 5736120860'
const REGISTRATION_ACCOUNT = '5736120860'
const REGISTRATION_ACCOUNT_NAME = 'Т.Жаргалбаяр'

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
  const [carNumber, setCarNumber] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  const [carType, setCarType] = useState<TowType | null>(null)
  const [step, setStep] = useState<Step>('choose-service')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const carNumberRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending.current) onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  useEffect(() => {
    if (step === 'details') setTimeout(() => nameRef.current?.focus(), 0)
  }, [step, serviceType, carType])

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

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoBusy(true); setError('')
    try { setPhotoDataUrl(await prepareFacePhoto(file)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Зургийг боловсруулахад алдаа гарлаа.') }
    finally { setPhotoBusy(false) }
  }

  const register = async () => {
    if (pending.current || !serviceType || (serviceType === 'achilt' && !carType)) return
    setError('')
    if (!name.trim()) { setError('Нэрээ оруулна уу.'); nameRef.current?.focus(); return }
    if (!/^\d{8}$/.test(phone)) { setError('8 оронтой утасны дугаараа оруулна уу.'); phoneRef.current?.focus(); return }
    if (!carNumber.trim()) { setError('Машин / техникийн дугаараа оруулна уу.'); carNumberRef.current?.focus(); return }
    if (!/^\d{6}$/.test(pin) || pin === '000000') { setError('000000-аас өөр 6 оронтой PIN сонгоно уу.'); pinRef.current?.focus(); return }
    if (pin !== pinConfirm) { setError('PIN давталт таарахгүй байна.'); pinRef.current?.focus(); return }
    pending.current = true; setBusy(true)
    try {
      const response = await fetch('/api/driver/register/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: name.trim(),
          car_number: carNumber.trim().toUpperCase(),
          pin,
          service_type: serviceType,
          car_type: serviceType === 'achilt' ? carType : null,
          photo_data_url: photoDataUrl || null,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Бүртгэл үүсгэж чадсангүй.')
      setStep('payment')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Холболтоо шалгаад дахин оролдоно уу.')
    } finally {
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
        <p style={{ color:'#c6ced8', lineHeight:1.5, marginBottom:14 }}>Сонгосон төрөл: <strong>{selectionSummary}</strong></p>
        <label htmlFor="driver-register-name" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Нэр</label>
        <input ref={nameRef} id="driver-register-name" type="text" autoComplete="name" value={name} disabled={busy} onChange={e => { setName(e.target.value.slice(0,100)); setError('') }} placeholder="Өөрийн нэр" style={{ ...input, marginBottom:14 }} />

        <label htmlFor="driver-register-phone" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Утасны дугаар</label>
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <span style={{ display:'grid', placeItems:'center', padding:'0 12px', borderRadius:12, background:'#171c24', border:'1px solid rgba(255,255,255,.14)', fontWeight:800 }}>+976</span>
          <input ref={phoneRef} id="driver-register-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={busy} onChange={e => { setPhone(phoneInput(e.target.value)); setError('') }} placeholder="8 оронтой дугаар" style={{ ...input, flex:1, minWidth:0 }} />
        </div>

        <label htmlFor="driver-register-car-number" style={{ display:'block', marginBottom:7, fontWeight:800 }}>Машин / техникийн дугаар</label>
        <input ref={carNumberRef} id="driver-register-car-number" type="text" autoCapitalize="characters" value={carNumber} disabled={busy} onChange={e => { setCarNumber(e.target.value.toUpperCase().slice(0,30)); setError('') }} placeholder="Жишээ: 1234 УБА" style={{ ...input, marginBottom:14 }} />

        <label htmlFor="driver-register-pin" style={{ display:'block', marginBottom:7, fontWeight:800 }}>6 оронтой PIN</label>
        <input ref={pinRef} id="driver-register-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} disabled={busy} onChange={e => { setPin(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="Өөрийн PIN" style={{ ...input, marginBottom:10 }} />
        <input aria-label="PIN давтах" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pinConfirm} disabled={busy} onChange={e => { setPinConfirm(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }} placeholder="PIN давтах" style={{ ...input, marginBottom:16 }} />
        <p style={{ color:'#8d98a6', fontSize:12, lineHeight:1.45, margin:'-8px 0 14px' }}>000000 PIN ашиглахгүй. Энэ PIN-ээрээ шууд нэвтэрнэ.</p>

        <p style={{ margin:'0 0 8px', fontWeight:800 }}>Нүүр зураг <span style={{ color:'#8d98a6', fontWeight:700 }}>(алгасаж болно)</span></p>
        <div style={{ display:'flex', alignItems:'center', gap:14, border:'1px solid rgba(255,255,255,.14)', background:'#171c24', borderRadius:16, padding:12, marginBottom:14 }}>
          <div style={{ width:78, height:78, borderRadius:'50%', overflow:'hidden', flex:'0 0 auto', background:'#272d36', display:'grid', placeItems:'center', fontSize:28, fontWeight:900 }}>{photoDataUrl ? <img src={photoDataUrl} alt="Нүүр зураг" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (name.trim().charAt(0).toUpperCase() || '👤')}</div>
          <div style={{ flex:1 }}>
            <input ref={photoRef} type="file" accept="image/*" capture="user" onChange={event => void choosePhoto(event)} style={{ display:'none' }} />
            <button type="button" disabled={photoBusy || busy} onClick={() => photoRef.current?.click()} style={{ ...secondary, width:'100%' }}>{photoBusy ? 'Зураг боловсруулж байна…' : photoDataUrl ? 'Зураг солих' : 'Нүүр зураг авах / сонгох'}</button>
            {photoDataUrl && <button type="button" disabled={photoBusy || busy} onClick={() => setPhotoDataUrl('')} style={{ border:0, background:'transparent', color:'#aeb8c4', padding:'9px 0 0', cursor:'pointer', fontWeight:700 }}>Зураг алгасах</button>}
          </div>
        </div>
        <button type="button" disabled={busy || photoBusy} onClick={() => void register()} style={primary}>{busy ? 'Бүртгэж байна…' : 'Бүртгүүлэх'}</button>
        <button type="button" disabled={busy} onClick={() => { setStep(serviceType === 'achilt' ? 'choose-tow' : 'choose-service'); setError('') }} style={{ ...secondary, width:'100%', marginTop:9 }}>← Сонголт засах</button>
      </>}

      {step === 'payment' && <>
        <div style={{ borderRadius:16, padding:15, background:'#10251a', border:'1px solid rgba(84,214,139,.34)', margin:'14px 0 12px' }}>
          <strong style={{ display:'block', color:'#72e1a3', fontSize:18, marginBottom:5 }}>✓ Бүртгэл амжилттай</strong>
          <p style={{ margin:0, color:'#d5e9dd', lineHeight:1.5 }}>Админаас зөвшөөрөл хүлээхгүй. Утасны дугаар болон өөрийн сонгосон PIN-ээр шууд нэвтэрнэ.</p>
        </div>
        <p style={{ color:'#c6ced8', lineHeight:1.5, margin:'14px 0 0' }}>Бүртгэл: <strong>{selectionSummary}</strong> · <strong>{carNumber}</strong></p>
        <div style={{ borderRadius:16, padding:16, background:'#122318', border:'1px solid rgba(84,214,139,.28)', margin:'12px 0', textAlign:'center' }}>
          <p style={{ margin:'0 0 6px', color:'#9fb4a8', fontSize:13, fontWeight:900 }}>БҮРТГҮҮЛЭХ ДҮН</p>
          <strong style={{ display:'block', fontSize:32, color:'#72e1a3' }}>{REGISTRATION_FEE.toLocaleString('mn-MN')}₮</strong>
        </div>
        <div style={{ border:'1px solid rgba(255,255,255,.14)', background:'#171c24', borderRadius:16, padding:16, margin:'12px 0' }}>
          <p style={{ margin:'0 0 5px', color:'#9ba7b5', fontSize:12, fontWeight:900 }}>IBAN</p>
          <strong style={{ display:'block', fontSize:18, overflowWrap:'anywhere' }}>{REGISTRATION_IBAN}</strong>
          <p style={{ margin:'16px 0 5px', color:'#9ba7b5', fontSize:12, fontWeight:900 }}>ДАНСНЫ НЭР</p>
          <strong style={{ display:'block', fontSize:18 }}>{REGISTRATION_ACCOUNT_NAME}</strong>
          <p style={{ margin:'16px 0 5px', color:'#9ba7b5', fontSize:12, fontWeight:900 }}>ДАНС</p>
          <strong style={{ display:'block', fontSize:20, letterSpacing:'.04em' }}>{REGISTRATION_ACCOUNT}</strong>
        </div>
        <div style={{ borderRadius:16, padding:16, background:'#251c11', border:'1px solid rgba(255,190,90,.3)', textAlign:'center' }}>
          <p style={{ margin:'0 0 8px', color:'#d6b27b', fontSize:13, fontWeight:900 }}>ГҮЙЛГЭЭНИЙ УТГА</p>
          <p style={{ margin:'0 0 8px', color:'#f1dfc4', lineHeight:1.55 }}>Гүйлгээний утгад утасны дугаараа оруулна уу.</p>
          <strong style={{ display:'block', fontSize:30, letterSpacing:'.08em', color:'#ffd166' }}>{phone}</strong>
        </div>
        <button type="button" onClick={onClose} style={{ ...primary, marginTop:14 }}>Нэвтрэх рүү буцах</button>
      </>}

      {error && <div role="alert" style={{ marginTop:12, padding:12, borderRadius:12, background:'#391917', border:'1px solid rgba(255,105,97,.32)', color:'#ffaaa5' }}>{error}</div>}
    </section>
  </div>
}
