'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CurrentPage() {
  const [dest, setDest] = useState('')
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [address, setAddress] = useState('Байршил тогтоож байна...')
  const router = useRouter()

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setLocation({ lat, lng })
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            const data = await res.json()
            const addr = data.display_name?.split(',').slice(0, 3).join(',') || 'Байршил тогтоогдлоо'
            setAddress(addr)
          } catch {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
          }
        },
        () => setAddress('Байршил тогтоох боломжгүй')
      )
    }
  }, [])

  const handleSearch = async () => {
    if (!dest || !location) return
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
      status: 'pending',
      user_phone: user?.phone || ''
    }).select().single()

    if (orderData) localStorage.setItem('current_order_id', orderData.id)
    router.push('/drivers')
  }

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column'}}>

      {/* Map */}
      <div style={{position:'relative', height:'280px', overflow:'hidden'}}>
        {location ? (
          <iframe
            width="100%" height="280"
            style={{border:0, filter:'brightness(0.7) saturate(0.8) hue-rotate(180deg)'}}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng-0.005},${location.lat-0.005},${location.lng+0.005},${location.lat+0.005}&layer=mapnik&marker=${location.lat},${location.lng}`}
          />
        ) : (
          <div style={{width:'100%', height:'280px', background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <p style={{color:'rgba(255,255,255,0.3)', fontSize:'14px'}}>Газрын зураг ачааллаж байна...</p>
          </div>
        )}
        <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 60%, rgba(10,10,15,1) 100%)'}}/>
        <button onClick={() => router.back()} style={{
          position:'absolute', top:'16px', left:'16px',
          background:'rgba(10,10,15,0.8)', border:'1px solid rgba(255,255,255,0.1)',
          borderRadius:'20px', padding:'8px 16px',
          color:'rgba(255,255,255,0.7)', fontSize:'13px', cursor:'pointer', fontWeight:'600'
        }}>← Буцах</button>
      </div>

      {/* Form */}
      <div style={{padding:'20px 16px', flex:1}}>
        <h2 style={{color:'white', fontSize:'20px', fontWeight:'800', margin:'0 0 4px', letterSpacing:'-0.5px'}}>
          Хүрэх газраа тодорхойлно уу
        </h2>
        <p style={{color:'rgba(255,255,255,0.35)', fontSize:'13px', marginBottom:'20px'}}>
          Таны одоогийн байршил тогтоогдлоо 📍
        </p>

        {/* Одоогийн байршил */}
        <div style={{
          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:'16px', padding:'14px 16px', marginBottom:'10px'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px'}}>
            <div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#3b82f6', flexShrink:0}}/>
            <span style={{color:'rgba(255,255,255,0.4)', fontSize:'12px', fontWeight:'600', letterSpacing:'0.5px'}}>ТАНЫ БАЙРШИЛ</span>
          </div>
          <p style={{color:'rgba(255,255,255,0.7)', fontSize:'14px', margin:0, fontWeight:'500'}}>{address}</p>
        </div>

        {/* Хүрэх газар */}
        <div style={{
          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:'16px', padding:'14px 16px', marginBottom:'20px'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px'}}>
            <div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#e8433a', flexShrink:0}}/>
            <span style={{color:'rgba(255,255,255,0.4)', fontSize:'12px', fontWeight:'600', letterSpacing:'0.5px'}}>ХҮРЭХ ГАЗАР</span>
          </div>
          <input
            type="text"
            placeholder="Хаяг бичнэ үү..."
            value={dest}
            onChange={e => setDest(e.target.value)}
            style={{
              width:'100%', background:'transparent', border:'none',
              color:'white', fontSize:'15px', outline:'none', fontWeight:'600'
            }}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={!dest || !location}
          style={{
            width:'100%', borderRadius:'16px', padding:'17px',
            background: (!dest || !location) ? 'rgba(232,67,58,0.3)' : '#e8433a',
            border:'none', color:'white', fontSize:'16px', fontWeight:'800',
            cursor: (!dest || !location) ? 'not-allowed' : 'pointer',
            boxShadow: (!dest || !location) ? 'none' : '0 6px 25px rgba(232,67,58,0.4)',
            transition:'all 0.2s', letterSpacing:'0.3px'
          }}
        >
          {!location ? 'Байршил тогтоож байна...' : 'Машин хайх →'}
        </button>
      </div>

      <style>{`input::placeholder { color: rgba(255,255,255,0.2); }`}</style>
    </div>
  )
}
