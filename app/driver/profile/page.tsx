'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const D = {
  bg: '#060608',
  card: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  text: 'white',
  muted: 'rgba(255,255,255,0.4)',
  red: '#e8433a',
  input: {background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'white', borderRadius:'12px', padding:'12px 14px', fontSize:'14px', outline:'none', width:'100%', boxSizing:'border-box' as const},
}

export default function DriverProfilePage() {
  const [driver, setDriver] = useState<any>(null)
  const [form, setForm] = useState({ name: '', car_type: '', car_number: '', photo_url: '', pin: '', new_pin: '', confirm_pin: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const session = localStorage.getItem('driver_session')
    if (!session) { router.push('/driver'); return }
    const d = JSON.parse(session)
    setDriver(d)
    setForm({ name: d.name || '', car_type: d.car_type || '', car_number: d.car_number || '', photo_url: d.photo_url || '', pin: '', new_pin: '', confirm_pin: '' })
  }, [])

  const handleSave = async () => {
    if (!form.name) return setError('Нэрээ бөглөнө үү')
    if (!form.car_type) return setError('Машины төрөл сонгоно уу')
    if (form.new_pin && form.new_pin !== form.confirm_pin) return setError('PIN тохирохгүй байна')
    if (form.new_pin && form.new_pin.length !== 4) return setError('PIN 4 оронтой байх ёстой')

    setSaving(true)
    setError('')

    const updates: any = {
      name: form.name,
      car_type: form.car_type,
      car_number: form.car_number,
      photo_url: form.photo_url
    }
    if (form.new_pin) updates.pin = form.new_pin

    const { data, error: err } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', driver.id)
      .select()
      .single()

    if (err) {
      setError('Хадгалахад алдаа гарлаа')
    } else {
      localStorage.setItem('driver_session', JSON.stringify(data))
      setDriver(data)
      setSaved(true)
      setForm(f => ({ ...f, pin: '', new_pin: '', confirm_pin: '' }))
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  if (!driver) return <div style={{minHeight:'100vh', background:D.bg}}/>

  return (
    <div style={{minHeight:'100vh', background:D.bg, paddingBottom:'40px'}}>
      <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:'12px'}}>
        <button onClick={() => router.push('/driver')} style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 14px', color:D.muted, fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>← Буцах</button>
        <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>Профайл засах</p>
      </div>

      <div style={{padding:'20px 16px', maxWidth:'420px', margin:'0 auto'}}>

        {/* Зураг */}
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', marginBottom:'24px'}}>
          <div style={{width:'90px', height:'90px', borderRadius:'50%', overflow:'hidden', marginBottom:'12px', border:'2px solid rgba(232,67,58,0.4)'}}>
            {form.photo_url ? (
              <img src={form.photo_url} alt="profile" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
            ) : (
              <div style={{width:'100%', height:'100%', background:'#e8433a', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'32px', fontWeight:'800'}}>
                {form.name.charAt(0) || '?'}
              </div>
            )}
          </div>
          <input type="text" placeholder="Зургийн URL..." value={form.photo_url}
            onChange={e => setForm({...form, photo_url: e.target.value})}
            style={{...D.input, textAlign:'center', fontSize:'12px'}}/>
        </div>

        {/* Нэр */}
        <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'12px'}}>
          <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 8px'}}>НЭР</p>
          <input type="text" placeholder="Бүтэн нэр" value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
            style={{...D.input, padding:'8px 0', background:'transparent', border:'none'}}/>
        </div>

        {/* Утас */}
        <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'12px'}}>
          <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 6px'}}>УТАСНЫ ДУГААР</p>
          <p style={{color:'rgba(255,255,255,0.5)', fontSize:'14px', margin:0}}>{driver.phone}</p>
          <p style={{color:'rgba(255,255,255,0.2)', fontSize:'11px', margin:'4px 0 0'}}>Утасны дугаар өөрчлөх боломжгүй</p>
        </div>

        {/* Машины төрөл */}
        <div style={{marginBottom:'12px'}}>
          <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 10px'}}>МАШИНЫ ТӨРӨЛ</p>
          <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
            {[
              {id:'butten', label:'Бүтэн ачигч', icon:'🚛', desc:'Тэвш дээрээ бүтэн ачих'},
              {id:'chiregch', label:'Чирэгч', icon:'🔧', desc:'Урд юмуу хойд дугуйнаас чирэх'},
            ].map(type => (
              <div key={type.id} onClick={() => setForm({...form, car_type: type.id})} style={{
                background: form.car_type === type.id ? 'rgba(232,67,58,0.12)' : D.card,
                border: `1px solid ${form.car_type === type.id ? 'rgba(232,67,58,0.5)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius:'14px', padding:'14px 16px',
                display:'flex', alignItems:'center', gap:'12px', cursor:'pointer'
              }}>
                <span style={{fontSize:'22px'}}>{type.icon}</span>
                <div style={{flex:1}}>
                  <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:0}}>{type.label}</p>
                  <p style={{color:D.muted, fontSize:'12px', margin:'2px 0 0'}}>{type.desc}</p>
                </div>
                <div style={{width:'18px', height:'18px', borderRadius:'50%', border:`2px solid ${form.car_type === type.id ? '#e8433a' : 'rgba(255,255,255,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  {form.car_type === type.id && <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a'}}/>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Машины дугаар */}
        <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'12px'}}>
          <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 8px'}}>МАШИНЫ ДУГААР</p>
          <input type="text" placeholder="1234УБА" value={form.car_number}
            onChange={e => setForm({...form, car_number: e.target.value})}
            style={{...D.input, padding:'8px 0', background:'transparent', border:'none'}}/>
        </div>

        {/* PIN солих */}
        <div style={{background:D.card, border:D.border, borderRadius:'16px', padding:'14px', marginBottom:'20px'}}>
          <p style={{color:D.muted, fontSize:'11px', fontWeight:'700', letterSpacing:'1px', margin:'0 0 12px'}}>PIN КОД СОЛИХ</p>
          <input type="password" placeholder="Шинэ PIN (4 оронтой)" maxLength={4} value={form.new_pin}
            onChange={e => setForm({...form, new_pin: e.target.value})}
            style={{...D.input, marginBottom:'8px'}}/>
          <input type="password" placeholder="PIN дахин оруулах" maxLength={4} value={form.confirm_pin}
            onChange={e => setForm({...form, confirm_pin: e.target.value})}
            style={{...D.input}}/>
          <p style={{color:'rgba(255,255,255,0.2)', fontSize:'11px', margin:'8px 0 0'}}>Хоосон орхивол PIN өөрчлөгдөхгүй</p>
        </div>

        {error && <p style={{color:'#ff6b6b', fontSize:'13px', textAlign:'center', marginBottom:'12px'}}>⚠️ {error}</p>}

        <button onClick={handleSave} disabled={saving} style={{
          width:'100%', borderRadius:'16px', padding:'16px',
          background: saving ? 'rgba(232,67,58,0.4)' : D.red,
          border:'none', color:D.text, fontSize:'16px', fontWeight:'800',
          cursor: saving ? 'not-allowed' : 'pointer',
          boxShadow:'0 6px 25px rgba(232,67,58,0.4)'
        }}>
          {saving ? 'Хадгалж байна...' : saved ? '✅ Хадгалагдлаа!' : 'Хадгалах'}
        </button>
      </div>
      <style>{`input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
    </div>
  )
}
