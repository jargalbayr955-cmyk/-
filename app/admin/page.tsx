'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Driver = {
  id: string
  name: string
  phone: string
  car_type: string
  price: number
  available: boolean
}

type Order = {
  id: string
  created_at: string
  completed_at: string
  from_address: string
  to_address: string
  driver_name: string
  driver_phone: string
  car_type: string
  car_mark: string
  status: string
  final_price: number
  duration_minutes: number
}

const ADMIN_PASSWORD = 'achilt2024'
const D = {
  bg: '#060608',
  card: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  text: 'white',
  muted: 'rgba(255,255,255,0.4)',
  red: '#e8433a',
  input: {background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'white', borderRadius:'12px', padding:'12px 14px', fontSize:'14px', outline:'none', width:'100%', boxSizing:'border-box' as const, marginBottom:'10px'},
}

function MapTab({ drivers }: { drivers: any[] }) {
  const mapRef = React.useRef<any>(null)
  const mapInstanceRef = React.useRef<any>(null)
  const markersRef = React.useRef<any[]>([])
  const [mapReady, setMapReady] = React.useState(false)

  React.useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    setMapReady(true)
  }, [])

  React.useEffect(() => {
    if (!mapReady || !mapRef.current) return
    import('leaflet').then((L) => {
      const Leaflet = L.default
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl
      if (!mapInstanceRef.current) {
        const map = Leaflet.map(mapRef.current!).setView([47.9, 106.9], 12)
        Leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }).addTo(map)
        mapInstanceRef.current = map
      }
      // Markers цэвэрлэх
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      // Идэвхтэй жолоочдыг map дээр харуулах
      drivers.filter(d => d.available && d.lat && d.lng).forEach(d => {
        const icon = Leaflet.divIcon({
          html: `<div style="background:#e8433a;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${d.name.charAt(0)}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], className: ''
        })
        const marker = Leaflet.marker([d.lat, d.lng], { icon })
          .addTo(mapInstanceRef.current!)
          .bindPopup(`<b>${d.name}</b><br>${d.phone}<br>${d.car_type === 'butten' ? 'Бүтэн ачигч' : 'Чирэгч'}`)
        markersRef.current.push(marker)
      })
    })
  }, [mapReady, drivers])

  const activeDrivers = drivers.filter(d => d.available && d.lat && d.lng)

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
        <p style={{color:'rgba(255,255,255,0.5)', fontSize:'13px', margin:0}}>
          {activeDrivers.length} идэвхтэй жолооч байршил илгээсэн
        </p>
        <div style={{display:'flex', gap:'8px'}}>
          {activeDrivers.map(d => (
            <div key={d.id} style={{background:'rgba(232,67,58,0.12)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'20px', padding:'4px 12px', fontSize:'12px', color:'#ff6b5b', fontWeight:'700'}}>
              {d.name}
            </div>
          ))}
        </div>
      </div>
      <div ref={mapRef} style={{width:'100%', height:'500px', borderRadius:'16px', overflow:'hidden', border:'1px solid rgba(255,255,255,0.08)'}}/>
    </div>
  )
}

export default function AdminPage() {
  const [tab, setTab] = useState<'drivers'|'history'|'map'>('drivers')
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', car_type: '', price: '', pin: '' })
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [heroUrl, setHeroUrl] = useState('')
  const [search, setSearch] = useState('')
  const [heroSaved, setHeroSaved] = useState(false)

  const fetchDrivers = async () => {
    const { data } = await supabase.from('drivers').select().order('created_at', { ascending: false })
    if (data) setDrivers(data)
    setLoading(false)
  }

  const fetchOrders = async () => {
    const since = new Date(Date.now() - 24*60*60*1000).toISOString()
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, offers(price, driver_name)')
      .eq('status', 'completed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    // Offer-с үнэ авах
    const data = ordersData?.map((o: any) => ({
      ...o,
      final_price: o.final_price || (o.offers && o.offers.length > 0 ? o.offers[0].price : 0)
    }))
    if (data) setOrders(data)
  }

  useEffect(() => {
    if (authed) {
      fetchDrivers()
      fetchOrders()
      supabase.from('settings').select('value').eq('key', 'hero_url').single().then(({ data }) => {
        if (data?.value) setHeroUrl(data.value)
      })
    }
  }, [authed])

  const saveHeroUrl = async () => {
    await supabase.from('settings').upsert({ key: 'hero_url', value: heroUrl })
    setHeroSaved(true)
    setTimeout(() => setHeroSaved(false), 2000)
  }

  const handleAdd = async () => {
    if (!form.name || !form.phone || !form.car_type || !form.price || !form.pin) return
    setAdding(true)
    await supabase.from('drivers').insert({ name: form.name, phone: form.phone, car_type: form.car_type, price: parseInt(form.price), pin: form.pin, rating: 5.0, available: true })
    setForm({ name: '', phone: '', car_type: '', price: '', pin: '' })
    setShowForm(false)
    fetchDrivers()
    setAdding(false)
  }

  const toggleAvailable = async (id: string) => {
    const { data: d } = await supabase.from('drivers').select('available').eq('id', id).single()
    await supabase.from('drivers').update({ available: !d?.available }).eq('id', id)
    fetchDrivers()
  }

  const deleteDriver = async (id: string) => {
    if (!confirm('Устгах уу?')) return
    await supabase.from('drivers').delete().eq('id', id)
    fetchDrivers()
  }

  const formatDuration = (mins: number) => {
    if (!mins) return '-'
    if (mins < 60) return `${mins} мин`
    return `${Math.floor(mins/60)}ц ${mins%60}мин`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const carLabel = (type: string) => {
    if (type === 'butten') return 'Бүтэн ачигч'
    if (type === 'chiregch') return 'Чирэгч'
    return type || '-'
  }

  // Нийт статистик
  const totalRevenue = orders.reduce((sum, o) => sum + (o.final_price || 0), 0)
  const totalOrders = orders.length

  if (!authed) {
    return (
      <div style={{minHeight:'100vh', background:D.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px'}}>
        <div style={{background:D.card, border:D.border, borderRadius:'20px', padding:'32px', width:'100%', maxWidth:'360px'}}>
          <div style={{textAlign:'center', marginBottom:'24px'}}>
            <div style={{fontSize:'36px', marginBottom:'8px'}}>🔐</div>
            <h1 style={{color:D.text, fontSize:'20px', fontWeight:'800', margin:0}}>Admin</h1>
          </div>
          <input type="password" placeholder="Нууц үг" value={password} onChange={e => setPassword(e.target.value)}
            style={{...D.input, marginBottom:'14px'}}/>
          <button onClick={() => password === ADMIN_PASSWORD ? setAuthed(true) : alert('Буруу нууц үг')}
            style={{width:'100%', borderRadius:'14px', padding:'14px', background:D.red, border:'none', color:D.text, fontSize:'15px', fontWeight:'800', cursor:'pointer', boxShadow:'0 4px 20px rgba(232,67,58,0.4)'}}>
            Нэвтрэх →
          </button>
        </div>
        <style>{`input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh', background:D.bg, paddingBottom:'40px'}}>
      {/* Header */}
      <div style={{padding:'16px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <span style={{fontSize:'24px'}}>🚛</span>
          <h1 style={{color:D.text, fontSize:'18px', fontWeight:'800', margin:0}}>Admin Panel</h1>
        </div>
        {tab === 'drivers' && (
          <button onClick={() => setShowForm(!showForm)}
            style={{borderRadius:'20px', padding:'8px 16px', background:D.red, border:'none', color:D.text, fontSize:'13px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(232,67,58,0.35)'}}>
            + Жолооч нэмэх
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:'8px', padding:'16px 20px 0', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        {[
          {id:'drivers', label:'🚛 Жолооч'},
          {id:'history', label:'📋 Захиалгын түүх'},
          {id:'map', label:'🗺️ Газрын зураг'}
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            borderRadius:'20px', padding:'8px 18px', fontSize:'13px', fontWeight:'700', cursor:'pointer',
            background: tab === t.id ? D.red : 'rgba(255,255,255,0.05)',
            border: tab === t.id ? 'none' : '1px solid rgba(255,255,255,0.08)',
            color: tab === t.id ? 'white' : D.muted,
            boxShadow: tab === t.id ? '0 4px 15px rgba(232,67,58,0.3)' : 'none'
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:'16px', maxWidth:'700px', margin:'0 auto'}}>

        {/* DRIVERS TAB */}
        {tab === 'drivers' && (
          <>
            {/* Hero URL */}
            <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'16px', marginBottom:'16px'}}>
              <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:'0 0 12px'}}>🖼️ Нүүр хуудасны зураг</p>
              <input type="text" placeholder="Зургийн URL..." value={heroUrl} onChange={e => setHeroUrl(e.target.value)} style={{...D.input}}/>
              {heroUrl && <img src={heroUrl} alt="preview" style={{width:'100%', height:'120px', objectFit:'cover', borderRadius:'10px', marginBottom:'10px'}}/>}
              <button onClick={saveHeroUrl} style={{width:'100%', borderRadius:'12px', padding:'12px', background:D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer'}}>
                {heroSaved ? '✅ Хадгалагдлаа!' : 'Хадгалах'}
              </button>
            </div>

            {/* Add form */}
            {showForm && (
              <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'16px', marginBottom:'16px'}}>
                <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:'0 0 14px'}}>Шинэ жолооч</p>
                <input type="text" placeholder="Нэр" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={D.input}/>
                <input type="tel" placeholder="Утас" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} style={D.input}/>
                <select value={form.car_type} onChange={e => setForm({...form, car_type: e.target.value})}
                  style={{...D.input, appearance:'none' as any}}>
                  <option value="" style={{background:'#1a1a1a'}}>Машины төрөл сонгоно уу</option>
                  <option value="butten" style={{background:'#1a1a1a'}}>Бүтэн ачигч</option>
                  <option value="chiregch" style={{background:'#1a1a1a'}}>Чирэгч</option>
                </select>
                <input type="number" placeholder="Үнэ" value={form.price} onChange={e => setForm({...form, price: e.target.value})} style={D.input}/>
                <input type="password" placeholder="4 оронтой PIN" maxLength={4} value={form.pin} onChange={e => setForm({...form, pin: e.target.value})} style={D.input}/>
                <div style={{display:'flex', gap:'10px'}}>
                  <button onClick={handleAdd} disabled={adding} style={{flex:1, borderRadius:'12px', padding:'12px', background: adding ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer'}}>
                    {adding ? 'Нэмж байна...' : 'Нэмэх'}
                  </button>
                  <button onClick={() => setShowForm(false)} style={{flex:1, borderRadius:'12px', padding:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.muted, fontSize:'14px', cursor:'pointer'}}>
                    Болих
                  </button>
                </div>
              </div>
            )}

            {/* Хайлт */}
            <div style={{position:'relative', marginBottom:'12px'}}>
              <input
                type="text"
                placeholder="Нэр эсвэл дугаараар хайх..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{...D.input, marginBottom:0, paddingLeft:'36px'}}
              />
              <span style={{position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:D.muted, fontSize:'14px'}}>🔍</span>
            </div>
            <p style={{color:D.muted, fontSize:'12px', margin:'0 0 12px'}}>{drivers.length} жолооч бүртгэлтэй</p>

            {loading ? (
              <p style={{color:D.muted, textAlign:'center', padding:'40px 0'}}>Ачааллаж байна...</p>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                {drivers.filter(d =>
                !search ||
                d.name?.toLowerCase().includes(search.toLowerCase()) ||
                d.phone?.includes(search)
              ).map((d) => (
                  <div key={d.id} style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px 16px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                      <div style={{width:'42px', height:'42px', borderRadius:'50%', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#ff6b5b', fontSize:'16px', fontWeight:'800', flexShrink:0}}>
                        {d.name.charAt(0)}
                      </div>
                      <div style={{flex:1}}>
                        <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:0}}>{d.name}</p>
                        <p style={{color:D.muted, fontSize:'12px', margin:'3px 0 0'}}>{d.phone} · {carLabel(d.car_type)} · ₮{d.price?.toLocaleString()}</p>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                        {!d.available ? (
                          <button onClick={() => toggleAvailable(d.id)} style={{borderRadius:'10px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer', border:'1px solid rgba(232,67,58,0.4)', background:'rgba(232,67,58,0.12)', color:'#ff6b5b'}}>
                            🔓 Эрх нээх
                          </button>
                        ) : (
                          <button onClick={() => toggleAvailable(d.id)} style={{borderRadius:'10px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer', border:'1px solid rgba(34,197,94,0.3)', background:'rgba(34,197,94,0.12)', color:'#22c55e'}}>
                            ✅ Идэвхтэй
                          </button>
                        )}
                        <button onClick={() => deleteDriver(d.id)} style={{borderRadius:'10px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer', background:'rgba(232,67,58,0.1)', border:'1px solid rgba(232,67,58,0.2)', color:'#ff6b5b'}}>
                          Устгах
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* MAP TAB */}
        {tab === 'map' && (
          <MapTab drivers={drivers} />
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <>
            {/* Статистик */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px'}}>
              <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'16px', textAlign:'center'}}>
                <p style={{color:D.muted, fontSize:'12px', margin:'0 0 6px'}}>Нийт захиалга</p>
                <p style={{color:'white', fontWeight:'800', fontSize:'28px', margin:0}}>{totalOrders}</p>
              </div>
              <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'16px', textAlign:'center'}}>
                <p style={{color:D.muted, fontSize:'12px', margin:'0 0 6px'}}>Нийт орлого</p>
                <p style={{color:'#e8433a', fontWeight:'800', fontSize:'24px', margin:0}}>₮{totalRevenue.toLocaleString()}</p>
              </div>
            </div>

            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px'}}>
              <p style={{color:D.muted, fontSize:'12px', margin:0}}>⏰ Сүүлийн 24 цагийн захиалга</p>
              <button onClick={fetchOrders} style={{borderRadius:'12px', padding:'7px 14px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:D.muted, fontSize:'13px', cursor:'pointer'}}>
                ↺ Шинэчлэх
              </button>
            </div>

            {orders.length === 0 ? (
              <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'40px', textAlign:'center'}}>
                <p style={{color:D.muted, fontSize:'14px', margin:0}}>Дууссан захиалга байхгүй</p>
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                {orders.map((o) => (
                  <div key={o.id} style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px 16px'}}>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
                      <span style={{color:D.muted, fontSize:'12px'}}>{formatDate(o.created_at)}</span>
                      <span style={{color:'#22c55e', fontSize:'12px', fontWeight:'700', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'10px', padding:'3px 10px'}}>✅ Дууссан</span>
                    </div>

                    {/* Жолооч */}
                    {o.driver_name && (
                      <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
                        <div style={{width:'32px', height:'32px', borderRadius:'50%', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'#ff6b5b', fontSize:'13px', fontWeight:'800'}}>
                          {o.driver_name?.charAt(0)}
                        </div>
                        <div style={{flex:1}}>
                          <p style={{color:'white', fontWeight:'700', fontSize:'13px', margin:0}}>{o.driver_name}</p>
                          <p style={{color:D.muted, fontSize:'11px', margin:'1px 0 0'}}>{carLabel(o.car_type)}{o.car_mark ? ` · ${o.car_mark}` : ''}</p>
                        </div>
                        {o.final_price ? (
                          <p style={{color:'#e8433a', fontWeight:'800', fontSize:'15px', margin:0}}>₮{o.final_price?.toLocaleString()}</p>
                        ) : null}
                      </div>
                    )}

                    {/* Маршрут */}
                    <div style={{background:'rgba(255,255,255,0.03)', borderRadius:'10px', padding:'10px', marginBottom:'10px'}}>
                      <div style={{display:'flex', gap:'8px', marginBottom:'6px'}}>
                        <div style={{width:'7px', height:'7px', borderRadius:'50%', background:'#3b82f6', marginTop:'4px', flexShrink:0}}/>
                        <p style={{color:'rgba(255,255,255,0.6)', fontSize:'12px', margin:0}}>{o.from_address || '-'}</p>
                      </div>
                      <div style={{display:'flex', gap:'8px'}}>
                        <div style={{width:'7px', height:'7px', borderRadius:'50%', background:D.red, marginTop:'4px', flexShrink:0}}/>
                        <p style={{color:'rgba(255,255,255,0.6)', fontSize:'12px', margin:0}}>{o.to_address || '-'}</p>
                      </div>
                    </div>

                    {/* Статистик */}
                    <div style={{display:'flex', gap:'8px'}}>
                      {o.duration_minutes ? (
                        <div style={{flex:1, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:'10px', padding:'8px', textAlign:'center'}}>
                          <p style={{color:'rgba(255,255,255,0.4)', fontSize:'10px', margin:'0 0 2px'}}>Хугацаа</p>
                          <p style={{color:'#3b82f6', fontWeight:'700', fontSize:'13px', margin:0}}>{formatDuration(o.duration_minutes)}</p>
                        </div>
                      ) : null}
                      {o.final_price ? (
                        <div style={{flex:1, background:'rgba(232,67,58,0.08)', border:'1px solid rgba(232,67,58,0.2)', borderRadius:'10px', padding:'8px', textAlign:'center'}}>
                          <p style={{color:'rgba(255,255,255,0.4)', fontSize:'10px', margin:'0 0 2px'}}>Төлбөр</p>
                          <p style={{color:D.red, fontWeight:'700', fontSize:'13px', margin:0}}>₮{o.final_price?.toLocaleString()}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`input::placeholder{color:rgba(255,255,255,0.25);}select option{background:#1a1a1a;color:white;}`}</style>
    </div>
  )
}
