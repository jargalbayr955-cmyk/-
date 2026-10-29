'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { backInApp } from '@/lib/client/navigation'
import { ServiceTypePicker } from '@/app/components/service-type-picker'
import { isServiceType, isTowType, serviceLabel, towTypeLabel, type ServiceType, type TowType } from '@/lib/service-types'

const D = {
  bg: '#060608', card: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  text: 'white', muted: 'rgba(255,255,255,0.4)', red: '#e8433a',
  input: {background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'white', borderRadius:'12px', padding:'12px 14px', fontSize:'14px', outline:'none', width:'100%', boxSizing:'border-box' as const},
}

type ProfileForm = { name:string; service_type:ServiceType; car_type:TowType | ''; car_number:string; photo_url:string; new_pin:string; confirm_pin:string }

export default function DriverProfilePage() {
  const [driver, setDriver] = useState<any>(null)
  const [form, setForm] = useState<ProfileForm>({ name:'', service_type:'achilt', car_type:'', car_number:'', photo_url:'', new_pin:'', confirm_pin:'' })
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/driver/session', { cache: 'no-store' })
        if (!res.ok) { router.replace('/driver'); return }
        const body = await res.json()
        if (cancelled || !body.driver) return
        const d = body.driver
        const serviceType: ServiceType = isServiceType(d.service_type) ? d.service_type : 'achilt'
        setDriver(d)
        setForm({
          name:d.name || '', service_type:serviceType,
          car_type:serviceType === 'achilt' && isTowType(d.car_type) ? d.car_type : '',
          car_number:d.car_number || '', photo_url:d.photo_url || '', new_pin:'', confirm_pin:'',
        })
        try { localStorage.setItem('driver_session', JSON.stringify(d)) } catch {}
      } catch { if (!cancelled) router.replace('/driver') }
    })()
    return () => { cancelled = true }
  }, [router])

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Нэрээ бөглөнө үү')
    if (form.service_type === 'achilt' && !isTowType(form.car_type)) return setError('Ачилтын машины төрөл сонгоно уу')
    if (form.new_pin && form.new_pin !== form.confirm_pin) return setError('PIN тохирохгүй байна')
    if (form.new_pin && !/^\d{6}$/.test(form.new_pin)) return setError('PIN 6 оронтой байх ёстой')

    setSaving(true); setError('')
    try {
      const res = await fetch('/api/driver/profile', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          name:form.name.trim(), service_type:form.service_type,
          car_type:form.service_type === 'achilt' ? form.car_type : null,
          car_number:form.car_number.trim(), photo_url:form.photo_url, new_pin:form.new_pin || undefined,
        }),
      })
      const body = await res.json().catch(()=>({}))
      if (res.ok && body.reauthenticate) {
        try { localStorage.removeItem('driver_session') } catch {}
        router.replace('/driver')
        return
      }
      if (!res.ok || !body.driver) setError(body.error || 'Хадгалахад алдаа гарлаа')
      else {
        try { localStorage.setItem('driver_session', JSON.stringify(body.driver)) } catch {}
        setDriver(body.driver)
        setSaved(true)
        setForm(f => ({ ...f, new_pin:'', confirm_pin:'' }))
        setTimeout(() => setSaved(false), 2000)
      }
    } catch { setError('Сүлжээний алдаа. Дахин оролдоно уу.') }
    finally { setSaving(false) }
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    setError('')
    try {
      let subscription: PushSubscription | null = null
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration()
          subscription = await registration?.pushManager.getSubscription() || null
        } catch {}
      }

      const res = await fetch('/api/driver/logout', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ endpoint:subscription?.endpoint || null }),
        cache:'no-store',
      })
      if (!res.ok) throw new Error('logout failed')

      try { await subscription?.unsubscribe() } catch {}
      try {
        localStorage.removeItem('driver_session')
        localStorage.removeItem('accepted_order')
        localStorage.removeItem('payment_info')
      } catch {}
      router.replace('/driver')
      router.refresh()
    } catch {
      setError('Гарахад сүлжээний алдаа гарлаа. Интернетээ шалгаад дахин дарна уу.')
      setLoggingOut(false)
    }
  }

  if (!driver) return <div style={{minHeight:'100vh', background:D.bg}}/>

  return <div style={{minHeight:'100vh', background:D.bg, paddingBottom:'40px', color:'#fff'}}>
    <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:'12px'}}>
      <button onClick={() => backInApp(router, '/driver')} style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 14px', color:D.muted, fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>← Буцах</button>
      <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>Профайл засах</p>
    </div>

    <div style={{padding:'20px 16px', maxWidth:'420px', margin:'0 auto'}}>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', marginBottom:'24px'}}>
        <div style={{width:'90px', height:'90px', borderRadius:'50%', overflow:'hidden', marginBottom:'12px', border:'2px solid rgba(232,67,58,0.4)'}}>
          {form.photo_url ? <img src={form.photo_url} alt="profile" style={{width:'100%', height:'100%', objectFit:'cover'}}/> :
            <div style={{width:'100%', height:'100%', background:'#e8433a', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'32px', fontWeight:'800'}}>{form.name.charAt(0) || '?'}</div>}
        </div>
        <input type="text" placeholder="Зургийн URL..." value={form.photo_url} onChange={e => setForm({...form, photo_url:e.target.value})} style={{...D.input, textAlign:'center', fontSize:'12px'}}/>
      </div>

      <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'12px'}}>
        <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 8px'}}>НЭР</p>
        <input type="text" placeholder="Бүтэн нэр" value={form.name} onChange={e => setForm({...form, name:e.target.value})} style={{...D.input, padding:'8px 0', background:'transparent', border:'none'}}/>
      </div>

      <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'16px'}}>
        <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 6px'}}>УТАСНЫ ДУГААР</p>
        <p style={{color:'rgba(255,255,255,0.5)', fontSize:'14px', margin:0}}>{driver.phone}</p>
        <p style={{color:'rgba(255,255,255,0.2)', fontSize:'11px', margin:'4px 0 0'}}>Утасны дугаар өөрчлөх боломжгүй</p>
      </div>

      <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 10px'}}>АЖИЛЛАХ ҮЙЛЧИЛГЭЭ</p>
      <ServiceTypePicker value={form.service_type} disabled={saving} onChange={service => setForm({...form, service_type:service, car_type:''})} />

      {form.service_type === 'achilt' && <div style={{margin:'16px 0 12px'}}>
        <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 10px'}}>АЧИЛТЫН МАШИНЫ ТӨРӨЛ</p>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          {(['butten','chiregch'] as TowType[]).map(type => <button key={type} type="button" onClick={() => setForm({...form, car_type:type})}
            style={{minHeight:52, borderRadius:14, background:form.car_type===type?'rgba(232,67,58,.14)':D.card, border:`1px solid ${form.car_type===type?'rgba(232,67,58,.58)':'rgba(255,255,255,.08)'}`, color:'#fff', fontWeight:800}}>{towTypeLabel(type)}</button>)}
        </div>
      </div>}
      <p style={{color:'rgba(255,255,255,.45)', fontSize:12, margin:'10px 0 16px'}}>Одоогийн сонголт: <strong style={{color:'#fff'}}>{serviceLabel(form.service_type)}{form.service_type==='achilt' && form.car_type ? ` · ${towTypeLabel(form.car_type)}` : ''}</strong></p>

      <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'12px'}}>
        <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 8px'}}>МАШИНЫ ДУГААР <span style={{fontWeight:500}}>(заавал биш)</span></p>
        <input type="text" placeholder="Жишээ: 1234УБА" value={form.car_number} onChange={e => setForm({...form, car_number:e.target.value})} style={{...D.input, padding:'8px 0', background:'transparent', border:'none'}}/>
      </div>

      <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'20px'}}>
        <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 12px'}}>PIN КОД СОЛИХ</p>
        <input type="password" placeholder="Шинэ PIN (6 оронтой)" inputMode="numeric" maxLength={6} value={form.new_pin} onChange={e => setForm({...form, new_pin:e.target.value.replace(/\D/g,'').slice(0,6)})} style={{...D.input, marginBottom:'8px'}}/>
        <input type="password" placeholder="PIN дахин оруулах" inputMode="numeric" maxLength={6} value={form.confirm_pin} onChange={e => setForm({...form, confirm_pin:e.target.value.replace(/\D/g,'').slice(0,6)})} style={{...D.input}}/>
        <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'8px 0 0'}}>Хоосон орхивол PIN өөрчлөгдөхгүй. PIN сольсны дараа бүх төхөөрөмж дээр шинэ PIN-ээр дахин нэвтэрнэ.</p>
      </div>

      {error && <p style={{color:'#ff6b6b', fontSize:'13px', textAlign:'center', marginBottom:'12px'}}>⚠️ {error}</p>}
      <button onClick={() => void handleSave()} disabled={saving || loggingOut} style={{width:'100%', borderRadius:'16px', padding:'16px', background:saving?'rgba(232,67,58,0.4)':D.red, border:'none', color:D.text, fontSize:'16px', fontWeight:'800', cursor:saving?'not-allowed':'pointer', boxShadow:'0 6px 25px rgba(232,67,58,0.4)'}}>
        {saving ? 'Хадгалж байна...' : saved ? '✅ Хадгалагдлаа!' : 'Хадгалах'}
      </button>

      <div style={{marginTop:28, paddingTop:20, borderTop:'1px solid rgba(255,255,255,.08)'}}>
        <p style={{color:'rgba(255,255,255,.46)', fontSize:12, lineHeight:1.5, textAlign:'center', margin:'0 8px 12px'}}>
          “Гарах” дараагүй үед энэ утсан дээрх жолоочийн нэвтрэлт хадгалагдаж, аппыг дахин нээхэд шууд газрын зураг руу орно.
        </p>
        <button type="button" onClick={() => void handleLogout()} disabled={loggingOut || saving} style={{width:'100%', borderRadius:16, padding:15, background:'transparent', border:'1px solid rgba(232,67,58,.55)', color:'#ff7771', fontSize:15, fontWeight:800, cursor:loggingOut?'not-allowed':'pointer'}}>
          {loggingOut ? 'Гарч байна…' : 'Гарах'}
        </button>
      </div>
    </div>
    <style>{`input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
  </div>
}
