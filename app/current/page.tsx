'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CurrentPage() {
  const [dest, setDest] = useState('')
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [address, setAddress] = useState('Байршил тогтоож байна...')
  const [carType, setCarType] = useState('')
  const [mapReady, setMapReady] = useState(false)
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

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    setMapReady(true)

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setLocation({ lat, lng })
          const addr = await reverseGeocode(lat, lng)
          setAddress(addr)
        },
        () => setAddress('Байршил тогтоох боломжгүй')
      )
    }
  }, [])

  // Map init
  useEffect(() => {
    if (!mapReady || !location || mapInstanceRef.current) return

    import('leaflet').then((L) => {
      const Leaflet = L.default
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = Leaflet.map(mapRef.current!).setView([location.lat, location.lng], 16)
      Leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB'
      }).addTo(map)

      // Draggable marker
      const marker = Leaflet.marker([location.lat, location.lng], { draggable: true })
        .addTo(map)
        .bindPopup('Таны байршил — чирж тохируулна уу')
        .openPopup()

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
  }, [mapReady, location])

  const handleSearch = async () => {
    if (!dest || !location || !carType) return
    localStorage.setItem('fromLat', location.lat.toString())
    localStorage.setItem('fromLng', location.lng.toString())
    localStorage.setItem('fromAddress', address)
    localStorage.setItem('dest', dest)

    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const { data: orderData } = await supabase.from('orders').insert({
      from_address: address,
      to_address: dest,
      from_lat: location.lat,
      from_lng: location.lng,
      car_type: carType,
      status: 'pending',
      user_phone: user?.phone || ''
    }).select().single()

    if (orderData) localStorage.setItem('current_order_id', orderData.id)
    router.push('/drivers')
  }

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column'}}>

      {/* Map */}
      <div style={{position:'relative', height:'280px'}}>
        <div ref={mapRef} style={{width:'100%', height:'280px'}}/>
        {!location && (
          <div style={{position:'absolute', inset:0, background:'rgba(10,10,15,0.8)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <p style={{color:'rgba(255,255,255,0.4)', fontSize:'14px'}}>GPS тогтоож байна...</p>
          </div>
        )}
        {/* Hint */}
        {location && (
          <div style={{position:'absolute', top:'12px', left:'50%', transform:'translateX(-50%)', background:'rgba(10,10,15,0.85)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'6px 14px', whiteSpace:'nowrap', zIndex:1000}}>
            <p style={{color:'rgba(255,255,255,0.6)', fontSize:'12px', margin:0}}>📍 Тэмдэгийг чирж байршлаа тохируул</p>
          </div>
        )}

        {/* GPS товч */}
        <button onClick={async () => {
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude
            const lng = pos.coords.longitude
            setLocation({ lat, lng })
            setAddress('Хаяг тогтоож байна...')
            if (mapInstanceRef.current && markerRef.current) {
              mapInstanceRef.current.setView([lat, lng], 16)
              markerRef.current.setLatLng([lat, lng])
            }
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            const data = await res.json()
            setAddress(data.display_name?.split(',').slice(0,3).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)
          })
        }} style={{
          position:'absolute', bottom:'60px', right:'12px',
          width:'44px', height:'44px', borderRadius:'50%',
          background:'#e8433a', border:'none',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'20px', cursor:'pointer', zIndex:1000,
          boxShadow:'0 4px 15px rgba(232,67,58,0.5)'
        }}>📍</button>
        <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 80%, rgba(10,10,15,1) 100%)', pointerEvents:'none'}}/>
        <button onClick={() => router.back()} style={{position:'absolute', top:'12px', left:'12px', background:'rgba(10,10,15,0.8)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 16px', color:'rgba(255,255,255,0.7)', fontSize:'13px', cursor:'pointer', fontWeight:'600', zIndex:1000}}>← Буцах</button>
      </div>

      {/* Form */}
      <div style={{padding:'16px', flex:1, overflowY:'auto'}}>
        <h2 style={{color:'white', fontSize:'18px', fontWeight:'800', margin:'0 0 4px', letterSpacing:'-0.5px'}}>
          Хүрэх газраа оруулна уу
        </h2>
        <p style={{color:'rgba(255,255,255,0.35)', fontSize:'13px', marginBottom:'16px'}}>
          Map дээрх тэмдэгийг чирж байршлаа тодруулна уу
        </p>

        {/* Байршил */}
        <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'12px 14px', marginBottom:'10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px'}}>
            <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', flexShrink:0}}/>
            <span style={{color:'rgba(255,255,255,0.4)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>ТАНЫ БАЙРШИЛ</span>
          </div>
          <p style={{color:'rgba(255,255,255,0.7)', fontSize:'13px', margin:0, fontWeight:'500'}}>{address}</p>
        </div>

        {/* Хүрэх газар */}
        <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'12px 14px', marginBottom:'16px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px'}}>
            <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a', flexShrink:0}}/>
            <span style={{color:'rgba(255,255,255,0.4)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>ХҮРЭХ ГАЗАР</span>
          </div>
          <input
            type="text" placeholder="Хаяг бичнэ үү..."
            value={dest} onChange={e => setDest(e.target.value)}
            style={{width:'100%', background:'transparent', border:'none', color:'white', fontSize:'15px', outline:'none', fontWeight:'600'}}
          />
        </div>

        {/* Машины төрөл */}
        <p style={{color:'rgba(255,255,255,0.4)', fontSize:'11px', fontWeight:'700', letterSpacing:'1px', marginBottom:'10px'}}>МАШИНЫ ТӨРӨЛ</p>
        <div style={{display:'flex', flexDirection:'column', gap:'8px', marginBottom:'20px'}}>
          {[
            {id:'tavtsan', label:'Бүтэн тавцант ачигч', icon:'🚛', desc:'Машин ачих тавцантай'},
            {id:'chiregch', label:'Чирэгч', icon:'🔧', desc:'Эвдэрсэн машин чирэх'},
            {id:'duguitai', label:'Дугуйтай чирэгч', icon:'🚜', desc:'Дугуйгаар чирэх'},
          ].map(type => (
            <div key={type.id} onClick={() => setCarType(type.id)} style={{
              background: carType === type.id ? 'rgba(232,67,58,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${carType === type.id ? 'rgba(232,67,58,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius:'14px', padding:'12px 14px',
              display:'flex', alignItems:'center', gap:'12px',
              cursor:'pointer', transition:'all 0.2s'
            }}>
              <span style={{fontSize:'22px'}}>{type.icon}</span>
              <div style={{flex:1}}>
                <p style={{color:'white', fontWeight:'700', fontSize:'14px', margin:0}}>{type.label}</p>
                <p style={{color:'rgba(255,255,255,0.3)', fontSize:'12px', margin:'2px 0 0'}}>{type.desc}</p>
              </div>
              <div style={{width:'18px', height:'18px', borderRadius:'50%', border:`2px solid ${carType === type.id ? '#e8433a' : 'rgba(255,255,255,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                {carType === type.id && <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a'}}/>}
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleSearch} disabled={!dest || !location || !carType} style={{
          width:'100%', borderRadius:'16px', padding:'17px',
          background: (!dest || !location || !carType) ? 'rgba(232,67,58,0.3)' : '#e8433a',
          border:'none', color:'white', fontSize:'16px', fontWeight:'800',
          cursor: (!dest || !location || !carType) ? 'not-allowed' : 'pointer',
          boxShadow: (!dest || !location || !carType) ? 'none' : '0 6px 25px rgba(232,67,58,0.4)',
          transition:'all 0.2s', letterSpacing:'0.3px'
        }}>
          {!location ? 'Байршил тогтоож байна...' : !carType ? 'Машины төрөл сонгоно уу' : 'Машин хайх →'}
        </button>
      </div>

      <style>{`input::placeholder{color:rgba(255,255,255,0.2);}input:focus{outline:none;}`}</style>
    </div>
  )
}
