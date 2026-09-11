'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ManualPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [carType, setCarType] = useState('')
  const [carMark, setCarMark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<{from?:boolean, to?:boolean, carType?:boolean, carMark?:boolean}>({})
  const router = useRouter()

  const handleSearch = async () => {
    const newErrors: any = {}
    if (!from) newErrors.from = true
    if (!to) newErrors.to = true
    if (!carType) newErrors.carType = true
    if (!carMark) newErrors.carMark = true
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    setLoading(true)

    localStorage.setItem('fromAddress', from)
    localStorage.setItem('from', from)
    localStorage.setItem('dest', to)
    localStorage.setItem('fromLat', '0')
    localStorage.setItem('fromLng', '0')

    let pickup: {lat:number,lng:number} | null = null
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (token) {
      try {
        const q = encodeURIComponent(from)
        const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?country=mn&limit=1&access_token=${token}`)
        const j = await r.json()
        const c = j?.features?.[0]?.center
        if (Array.isArray(c) && c.length >= 2) pickup = {lng:Number(c[0]),lat:Number(c[1])}
      } catch {}
    }
    if (!pickup) {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null)
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
      })
      if (pos) pickup = {lat:pos.coords.latitude,lng:pos.coords.longitude}
    }
    if (!pickup) {
      setLoading(false)
      setError('Авах газрын байршлыг тогтоож чадсангүй. Mapbox тохиргоо эсвэл GPS зөвшөөрлөө шалгана уу.')
      return
    }
    const res = await fetch('/api/order/create', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ from_address:from, to_address:to, car_type:carType, car_mark:carMark, from_lat:pickup.lat, from_lng:pickup.lng })
    })
    const body = await res.json().catch(()=>({}))
    if (!res.ok || !body.order?.id) {
      setLoading(false)
      setError(body.error || 'Захиалга үүсгэхэд алдаа гарлаа')
      return
    }
    localStorage.setItem('fromLat', String(pickup.lat))
    localStorage.setItem('fromLng', String(pickup.lng))
    localStorage.setItem('current_order_id', body.order.id)
    setLoading(false)
    router.push('/drivers')
  }

  const D = {
    bg: '#0a0a0f',
    card: 'rgba(255,255,255,0.04)',
    border: (err?: boolean) => `1px solid ${err ? 'rgba(232,67,58,0.5)' : 'rgba(255,255,255,0.08)'}`,
    text: 'white',
    muted: 'rgba(255,255,255,0.35)',
    red: '#e8433a',
  }

  return (
    <div style={{minHeight:'100vh', background:D.bg, display:'flex', flexDirection:'column'}}>

      {/* Header */}
      <div style={{padding:'14px 20px', display:'flex', alignItems:'center', gap:'12px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.4)'}}>
        <button onClick={() => router.back()} style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 14px', color:'rgba(255,255,255,0.6)', fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>← Буцах</button>
        <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>Гараар хаяг оруулах</p>
      </div>

      {/* Form */}
      <div style={{padding:'20px 16px', flex:1}}>
        <p style={{color:D.muted, fontSize:'13px', marginBottom:'20px'}}>Авах болон хүргэх хаягаа оруулна уу</p>

        {/* Авах хаяг */}
        <div style={{background: errors.from ? 'rgba(232,67,58,0.08)' : D.card, border:D.border(errors.from), borderRadius:'14px', padding:'12px 14px', marginBottom:errors.from ? '4px' : '12px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', flexShrink:0}}/>
            <span style={{color: errors.from ? '#ff6b6b' : D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>АВАХ ХАЯГ</span>
          </div>
          <input type="text" placeholder="Хаяг бичнэ үү..." value={from}
            onChange={e => { setFrom(e.target.value); setErrors(p => ({...p, from:false})) }}
            style={{width:'100%', background:'transparent', border:'none', color:D.text, fontSize:'15px', outline:'none', fontWeight:'600'}}/>
        </div>
        {errors.from && <p style={{color:'#ff6b6b', fontSize:'12px', margin:'0 0 12px 4px'}}>⚠️ Авах хаягаа бөглөнө үү</p>}

        {/* Хүргэх хаяг */}
        <div style={{background: errors.to ? 'rgba(232,67,58,0.08)' : D.card, border:D.border(errors.to), borderRadius:'14px', padding:'12px 14px', marginBottom:errors.to ? '4px' : '12px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <div style={{width:'8px', height:'8px', borderRadius:'50%', background:D.red, flexShrink:0}}/>
            <span style={{color: errors.to ? '#ff6b6b' : D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>ХҮРГЭХ ХАЯГ</span>
          </div>
          <input type="text" placeholder="Хаяг бичнэ үү..." value={to}
            onChange={e => { setTo(e.target.value); setErrors(p => ({...p, to:false})) }}
            style={{width:'100%', background:'transparent', border:'none', color:D.text, fontSize:'15px', outline:'none', fontWeight:'600'}}/>
        </div>
        {errors.to && <p style={{color:'#ff6b6b', fontSize:'12px', margin:'0 0 12px 4px'}}>⚠️ Хүргэх хаягаа бөглөнө үү</p>}

        {/* Машины төрөл */}
        <p style={{color: errors.carType ? '#ff6b6b' : D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 10px'}}>
          МАШИНЫ ТӨРӨЛ {errors.carType && '— Сонгоно уу'}
        </p>
        <div style={{display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px'}}>
          {[
            {id:'butten', label:'Бүтэн ачигч', icon:'🚛', desc:'Тэвш дээрээ бүтэн ачих'},
            {id:'chiregch', label:'Чирэгч', icon:'🔧', desc:'Урд юмуу хойд дугуйнаас чирэх'},
          ].map(type => (
            <div key={type.id} onClick={() => { setCarType(type.id); setErrors(p => ({...p, carType:false})) }} style={{
              background: carType === type.id ? 'rgba(232,67,58,0.12)' : errors.carType ? 'rgba(232,67,58,0.05)' : D.card,
              border:`1px solid ${carType === type.id ? 'rgba(232,67,58,0.5)' : errors.carType ? 'rgba(232,67,58,0.3)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius:'14px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer'
            }}>
              <span style={{fontSize:'24px'}}>{type.icon}</span>
              <div style={{flex:1}}>
                <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>{type.label}</p>
                <p style={{color:D.muted, fontSize:'12px', margin:'3px 0 0'}}>{type.desc}</p>
              </div>
              <div style={{width:'20px', height:'20px', borderRadius:'50%', border:`2px solid ${carType === type.id ? D.red : 'rgba(255,255,255,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                {carType === type.id && <div style={{width:'10px', height:'10px', borderRadius:'50%', background:D.red}}/>}
              </div>
            </div>
          ))}
        </div>

        {/* Машины марк */}
        <div style={{background: errors.carMark ? 'rgba(232,67,58,0.08)' : D.card, border:D.border(errors.carMark), borderRadius:'14px', padding:'12px 14px', marginBottom:errors.carMark ? '4px' : '24px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <span style={{color: errors.carMark ? '#ff6b6b' : D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>🚗 МАШИНЫ МАРК, НЭР</span>
          </div>
          <input type="text" placeholder="Жишээ: Toyota Camry, Hyundai Sonata..." value={carMark}
            onChange={e => { setCarMark(e.target.value); setErrors(p => ({...p, carMark:false})) }}
            style={{width:'100%', background:'transparent', border:'none', color:D.text, fontSize:'14px', outline:'none', fontWeight:'500'}}/>
        </div>
        {errors.carMark && <p style={{color:'#ff6b6b', fontSize:'12px', margin:'0 0 20px 4px'}}>⚠️ Машины маркаа бөглөнө үү</p>}

        {error && <p style={{color:'#ff6b6b',fontSize:'13px',margin:'0 0 12px 4px'}}>⚠️ {error}</p>}
        <button onClick={handleSearch} disabled={loading} style={{
          width:'100%', borderRadius:'16px', padding:'17px',
          background: loading ? 'rgba(232,67,58,0.4)' : D.red,
          border:'none', color:D.text, fontSize:'16px', fontWeight:'800',
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: loading ? 'none' : '0 6px 25px rgba(232,67,58,0.5)',
          transition:'all 0.3s'
        }}>
          {loading ? 'Хайж байна...' : 'Машин хайх →'}
        </button>
      </div>

      <style>{`input::placeholder{color:rgba(255,255,255,0.2);}input:focus{outline:none;}`}</style>
    </div>
  )
}
