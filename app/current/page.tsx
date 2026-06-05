'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CurrentPage() {
  const [dest, setDest] = useState('')
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [address, setAddress] = useState('GPS тогтоож байна...')
  const [carType, setCarType] = useState('')
  const [carMark, setCarMark] = useState('')
  const [extraAddress, setExtraAddress] = useState('')
  const [gpsError, setGpsError] = useState(false)
  const [manualFrom, setManualFrom] = useState('')
  const [errors, setErrors] = useState<{dest?:boolean, carType?:boolean, carMark?:boolean}>({})
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const router = useRouter()

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      const data = await res.json()
      return data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    }
  }

  const initMap = (lat: number, lng: number) => {
    if (!mapRef.current) return
    import('leaflet').then((L) => {
      const Leaflet = L.default
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 16)
        if (markerRef.current) markerRef.current.setLatLng([lat, lng])
        return
      }

      const map = Leaflet.map(mapRef.current).setView([lat, lng], 16)
      Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map)

      const marker = Leaflet.marker([lat, lng], { draggable: true }).addTo(map)
      marker.on('dragend', async (e: any) => {
        const pos = e.target.getLatLng()
        setLocation({ lat: pos.lat, lng: pos.lng })
        setAddress('Хаяг тогтоож байна...')
        const addr = await reverseGeocode(pos.lat, pos.lng)
        setAddress(addr)
      })

      markerRef.current = marker
      mapInstanceRef.current = map
    })
  }

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    let gpsSuccess = false

    const tryGPS = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          // GPS анх удаа ирсэн үед л map үүсгэх
          if (!gpsSuccess) {
            gpsSuccess = true
            setLocation({ lat, lng })
            setGpsError(false)
            setAddress('Хаяг тогтоож байна...')
            initMap(lat, lng)
            const addr = await reverseGeocode(lat, lng)
            setAddress(addr)
          } else {
            // Аль хэдийн GPS байвал зөвхөн gpsError арилгах
            setGpsError(false)
          }
        },
        () => {
          if (!gpsSuccess) {
            setAddress('GPS ажиллахгүй байна')
            setGpsError(true)
          }
        },
        { timeout: 8000, enableHighAccuracy: true }
      )
    }

    tryGPS()
    const interval = setInterval(tryGPS, 5000)
    return () => clearInterval(interval)
  }, [])

  const goToMyLocation = () => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setLocation({ lat, lng })
      setGpsError(false)
      initMap(lat, lng)
      const addr = await reverseGeocode(lat, lng)
      setAddress(addr)
    })
  }

  const handleSearch = async () => {
    const newErrors: any = {}
    if (!dest) newErrors.dest = true
    if (!carType) newErrors.carType = true
    if (!carMark) newErrors.carMark = true
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      // Эхний алдаатай хэсэг рүү scroll хийх
      setTimeout(() => {
        const firstError = document.querySelector('[data-error="true"]')
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }
    setErrors({})

    const fromAddr = gpsError ? (manualFrom || 'Гараар оруулаагүй') : (extraAddress ? `${address} (${extraAddress})` : address)
    localStorage.setItem('fromLat', location?.lat.toString() || '0')
    localStorage.setItem('fromLng', location?.lng.toString() || '0')
    localStorage.setItem('fromAddress', fromAddr)
    localStorage.setItem('dest', dest)

    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const { data: orderData } = await supabase.from('orders').insert({
      from_address: fromAddr,
      to_address: dest,
      from_lat: location?.lat || 0,
      from_lng: location?.lng || 0,
      car_type: carType,
      car_mark: carMark,
      status: 'pending',
      user_phone: user?.phone || ''
    }).select().single()

    if (orderData) localStorage.setItem('current_order_id', orderData.id)
    router.push('/drivers')
  }

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column'}}>

      {/* Map */}
      <div style={{position:'relative', height:'260px'}}>
        <div ref={mapRef} style={{width:'100%', height:'260px', background:'#111'}}/>
        {!location && (
          <div style={{position:'absolute', inset:0, background:'rgba(10,10,15,0.85)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <p style={{color:'rgba(255,255,255,0.4)', fontSize:'14px'}}>GPS тогтоож байна...</p>
          </div>
        )}
        <div style={{position:'absolute', top:'12px', left:'50%', transform:'translateX(-50%)', background:'rgba(10,10,15,0.85)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'6px 14px', whiteSpace:'nowrap', zIndex:1000}}>
          <p style={{color:'rgba(255,255,255,0.5)', fontSize:'11px', margin:0}}>📍 Тэмдэгийг чирж байршлаа тохируул</p>
        </div>
        <button onClick={goToMyLocation} style={{position:'absolute', bottom:'55px', right:'12px', width:'42px', height:'42px', borderRadius:'50%', background:'#e8433a', border:'none', cursor:'pointer', zIndex:1000, boxShadow:'0 4px 15px rgba(232,67,58,0.5)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>
        <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 80%, rgba(10,10,15,1) 100%)', pointerEvents:'none'}}/>
        <button onClick={() => router.back()} style={{position:'absolute', top:'12px', left:'12px', background:'rgba(10,10,15,0.8)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 14px', color:'rgba(255,255,255,0.7)', fontSize:'13px', cursor:'pointer', fontWeight:'600', zIndex:1000}}>← Буцах</button>
      </div>

      {/* Form */}
      <div style={{padding:'16px', flex:1, overflowY:'auto'}}>
        <h2 style={{color:'white', fontSize:'18px', fontWeight:'800', margin:'0 0 4px'}}>Хүрэх газраа оруулна уу</h2>
        <p style={{color:'rgba(255,255,255,0.35)', fontSize:'13px', marginBottom:'16px'}}>Map дээрх тэмдэгийг чирж байршлаа тодруулна уу</p>

        {/* Байршил */}
        <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'12px 14px', marginBottom:'10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', flexShrink:0}}/>
            <span style={{color:'rgba(255,255,255,0.35)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>ТАНЫ БАЙРШИЛ</span>
          </div>
          <p style={{color: gpsError ? '#ff6b6b' : 'rgba(255,255,255,0.7)', fontSize:'13px', margin:'0 0 8px'}}>{address}</p>

          {gpsError && (
            <div>
              <div style={{background:'rgba(232,67,58,0.12)', border:'1px solid rgba(232,67,58,0.35)', borderRadius:'10px', padding:'10px 12px', display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'8px'}}>
                <span style={{fontSize:'18px', flexShrink:0}}>⚠️</span>
                <div>
                  <p style={{color:'white', fontWeight:'600', fontSize:'13px', margin:'0 0 4px'}}>
                    Та заавал утасныхаа{' '}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#e8433a" style={{display:'inline', verticalAlign:'middle'}}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    {' '}location-ийг асаана уу
                  </p>
                  <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:0, lineHeight:'1.5'}}>Таны location ассанаар танд хамгийн ойр 3 жолооч холбогдоно</p>
                </div>
              </div>
              <input
                type="text"
                placeholder="Эсвэл гараар хаяг бичнэ үү..."
                value={manualFrom}
                onChange={async e => {
                  const val = e.target.value
                  setManualFrom(val)
                  if (val.length > 3) {
                    try {
                      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val + ' Улаанбаатар')}&format=json&limit=1`)
                      const data = await res.json()
                      if (data[0]) {
                        const lat = parseFloat(data[0].lat)
                        const lng = parseFloat(data[0].lon)
                        setLocation({ lat, lng })
                        setAddress(val)
                        initMap(lat, lng)
                      }
                    } catch {}
                  }
                }}
                style={{width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'10px 12px', color:'white', fontSize:'13px', outline:'none', boxSizing:'border-box' as const}}
              />
            </div>
          )}

          {!gpsError && (
            <div style={{borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'8px'}}>
              <input
                type="text"
                placeholder="Нэмэлт байршил гараар бичиж болно"
                value={extraAddress}
                onChange={e => setExtraAddress(e.target.value)}
                style={{width:'100%', background:'transparent', border:'none', color:'rgba(255,255,255,0.6)', fontSize:'13px', outline:'none'}}
              />
            </div>
          )}
        </div>

        {/* Хүрэх газар */}
        <div data-error={errors.dest ? 'true' : 'false'} style={{background: errors.dest ? 'rgba(232,67,58,0.08)' : 'rgba(255,255,255,0.04)', border:`1px solid ${errors.dest ? 'rgba(232,67,58,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius:'14px', padding:'12px 14px', marginBottom: errors.dest ? '4px' : '16px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a', flexShrink:0}}/>
            <span style={{color: errors.dest ? '#ff6b6b' : 'rgba(255,255,255,0.35)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>ХҮРЭХ ГАЗАР</span>
          </div>
          <input type="text" placeholder="Хаяг бичнэ үү..." value={dest} onChange={e => { setDest(e.target.value); setErrors(p => ({...p, dest:false})) }}
            style={{width:'100%', background:'transparent', border:'none', color:'white', fontSize:'15px', outline:'none', fontWeight:'600'}}/>
        </div>
        {errors.dest && <p style={{color:'#ff6b6b', fontSize:'12px', margin:'0 0 12px 4px'}}>⚠️ Хүрэх газраа бөглөнө үү</p>}

        {/* Машины төрөл */}
        <p style={{color: errors.carType ? '#ff6b6b' : 'rgba(255,255,255,0.4)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px', marginBottom:'10px'}}>
          МАШИНЫ ТӨРӨЛ {errors.carType && '— Сонгоно уу'}
        </p>
        <div style={{display:'flex', flexDirection:'column', gap:'8px', marginBottom:'16px'}}>
          {[
            {id:'butten', label:'Бүтэн ачигч', icon:'🚛', desc:'Тэвш дээрээ бүтэн ачих'},
            {id:'chiregch', label:'Чирэгч', icon:'🔧', desc:'Урд юмуу хойд дугуйнаас чирэх'},
          ].map(type => (
            <div key={type.id} onClick={() => { setCarType(type.id); setErrors(p => ({...p, carType:false})) }} style={{
              background: carType === type.id ? 'rgba(232,67,58,0.12)' : errors.carType ? 'rgba(232,67,58,0.05)' : 'rgba(255,255,255,0.04)',
              border:`1px solid ${carType === type.id ? 'rgba(232,67,58,0.5)' : errors.carType ? 'rgba(232,67,58,0.3)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius:'14px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px', cursor:'pointer', transition:'all 0.2s'
            }}>
              <span style={{fontSize:'24px'}}>{type.icon}</span>
              <div style={{flex:1}}>
                <p style={{color:'white', fontWeight:'700', fontSize:'15px', margin:0}}>{type.label}</p>
                <p style={{color:'rgba(255,255,255,0.35)', fontSize:'12px', margin:'3px 0 0'}}>{type.desc}</p>
              </div>
              <div style={{width:'20px', height:'20px', borderRadius:'50%', border:`2px solid ${carType === type.id ? '#e8433a' : 'rgba(255,255,255,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                {carType === type.id && <div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#e8433a'}}/>}
              </div>
            </div>
          ))}
        </div>

        {/* Машины марк */}
        <div data-error={errors.carMark ? 'true' : 'false'} style={{background: errors.carMark ? 'rgba(232,67,58,0.08)' : 'rgba(255,255,255,0.04)', border:`1px solid ${errors.carMark ? 'rgba(232,67,58,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius:'14px', padding:'12px 14px', marginBottom: errors.carMark ? '4px' : '20px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <span style={{color: errors.carMark ? '#ff6b6b' : 'rgba(255,255,255,0.35)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>🚗 ТАНЫ МАШИНЫ МАРК, НЭР</span>
          </div>
          <input type="text" placeholder="Жишээ: Toyota Camry, Hyundai Sonata..." value={carMark} onChange={e => { setCarMark(e.target.value); setErrors(p => ({...p, carMark:false})) }}
            style={{width:'100%', background:'transparent', border:'none', color:'white', fontSize:'14px', outline:'none', fontWeight:'500'}}/>
        </div>
        {errors.carMark && <p style={{color:'#ff6b6b', fontSize:'12px', margin:'0 0 16px 4px'}}>⚠️ Машины маркаа бөглөнө үү</p>}

        <button onClick={handleSearch} disabled={gpsError ? (!manualFrom || !dest || !carType || !carMark) : (!location || !dest || !carType || !carMark)} style={{
          width:'100%', borderRadius:'16px', padding:'17px',
          background: (gpsError ? (!manualFrom || !dest || !carType || !carMark) : (!location || !dest || !carType || !carMark)) ? 'rgba(232,67,58,0.3)' : '#e8433a',
          border:'none', color:'white', fontSize:'16px', fontWeight:'800',
          cursor: (gpsError ? (!manualFrom || !dest || !carType || !carMark) : (!location || !dest || !carType || !carMark)) ? 'not-allowed' : 'pointer',
          boxShadow: (gpsError ? (!manualFrom || !dest || !carType || !carMark) : (!location || !dest || !carType || !carMark)) ? 'none' : '0 6px 25px rgba(232,67,58,0.4)',
          transition:'all 0.2s'
        }}>
          {!location && !gpsError ? 'Байршил тогтоож байна...' : !dest ? 'Хүрэх газар бөглөнө үү' : !carType ? 'Машины төрөл сонгоно уу' : gpsError && !manualFrom ? 'Байршил бөглөнө үү' : 'Машин хайх →'}
        </button>
      </div>

      <style>{`input::placeholder{color:rgba(255,255,255,0.2);}input:focus{outline:none;}`}</style>
    </div>
  )
}
