'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Driver = {
  id: string
  name: string
  phone: string
  car_type: string
  price: number
  available: boolean
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

export default function AdminPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', car_type: '', price: '', pin: '' })
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [heroUrl, setHeroUrl] = useState('')
  const [heroSaved, setHeroSaved] = useState(false)

  const fetchDrivers = async () => {
    const { data } = await supabase.from('drivers').select().order('created_at', { ascending: false })
    if (data) setDrivers(data)
    setLoading(false)
  }

  useEffect(() => {
    if (authed) {
      fetchDrivers()
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

  const callApi = async (body: object) => {
    const res = await fetch('/api/admin/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD, ...body })
    })
    return res.json()
  }

  const handleAdd = async () => {
    if (!form.name || !form.phone || !form.car_type || !form.price || !form.pin) return
    setAdding(true)
    await callApi({ action: 'add', driver: { name: form.name, phone: form.phone, car_type: form.car_type, price: parseInt(form.price), pin: form.pin, rating: 5.0, available: true } })
    setForm({ name: '', phone: '', car_type: '', price: '', pin: '' })
    setShowForm(false)
    fetchDrivers()
    setAdding(false)
  }

  const toggleAvailable = async (id: string) => {
    await callApi({ action: 'toggle', id })
    fetchDrivers()
  }

  const deleteDriver = async (id: string) => {
    await callApi({ action: 'delete', id })
    fetchDrivers()
  }

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
      <div style={{padding:'16px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <span style={{fontSize:'24px'}}>🚛</span>
          <h1 style={{color:D.text, fontSize:'18px', fontWeight:'800', margin:0}}>Admin Panel</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{borderRadius:'20px', padding:'8px 16px', background:D.red, border:'none', color:D.text, fontSize:'13px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(232,67,58,0.35)'}}>
          + Жолооч нэмэх
        </button>
      </div>

      <div style={{padding:'16px', maxWidth:'600px', margin:'0 auto'}}>

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

        <p style={{color:D.muted, fontSize:'12px', margin:'0 0 12px'}}>{drivers.length} жолооч бүртгэлтэй</p>

        {loading ? (
          <p style={{color:D.muted, textAlign:'center', padding:'40px 0'}}>Ачааллаж байна...</p>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
            {drivers.map((d) => (
              <div key={d.id} style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px 16px'}}>
                <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                  <div style={{width:'42px', height:'42px', borderRadius:'50%', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#ff6b5b', fontSize:'16px', fontWeight:'800', flexShrink:0}}>
                    {d.name.charAt(0)}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:0}}>{d.name}</p>
                    <p style={{color:D.muted, fontSize:'12px', margin:'3px 0 0'}}>{d.phone} · {d.car_type} · ₮{d.price.toLocaleString()}</p>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                    <button onClick={() => toggleAvailable(d.id)} style={{borderRadius:'10px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer', border: d.available ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)', background: d.available ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)', color: d.available ? '#22c55e' : D.muted}}>
                      {d.available ? 'Идэвхтэй' : 'Идэвхгүй'}
                    </button>
                    <button onClick={() => deleteDriver(d.id)} style={{borderRadius:'10px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer', background:'rgba(232,67,58,0.1)', border:'1px solid rgba(232,67,58,0.2)', color:'#ff6b5b'}}>
                      Устгах
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`input::placeholder{color:rgba(255,255,255,0.25);}select option{background:#1a1a1a;color:white;}`}</style>
    </div>
  )
}
