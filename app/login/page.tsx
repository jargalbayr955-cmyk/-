'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [lightOn, setLightOn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) { router.push('/home'); return }
    setTimeout(() => setVisible(true), 100)
    setTimeout(() => setLightOn(true), 800)
    const interval = setInterval(() => setLightOn(v => !v), 600)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = async () => {
    if (!phone || phone.length < 8) return setError('Зөв утасны дугаар оруулна уу')
    setLoading(true)
    setError('')
    const fullPhone = '+976' + phone
    const { data, error } = await supabase.from('users').select().eq('phone', fullPhone).single()
    if (error || !data) {
      setError('Дугаар бүртгэлгүй байна. Бүртгүүлнэ үү.')
    } else {
      localStorage.setItem('user', JSON.stringify(data))
      router.push('/home')
    }
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column', overflow:'hidden'}}>
      <div style={{position:'relative', height:'56vh', overflow:'hidden'}}>
        <div style={{
          position:'absolute', inset:'-30px',
          backgroundImage:'url(https://i.ibb.co/5WrSCdV3/Jun-4-2026-12-21-53-AM.png)',
          backgroundSize:'140%', backgroundPosition:'15% center',
          animation:'truckCome 1.4s cubic-bezier(0.16,1,0.3,1) forwards',
          filter:'brightness(0.45) saturate(1.2)'
        }}/>
        <div style={{position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none'}}>
          {[25,38,50,62,74,82].map((top, i) => (
            <div key={i} style={{
              position:'absolute', top:`${top}%`, left:'-100%', right:0, height:'1px',
              background:`rgba(255,255,255,${0.04+i*0.01})`,
              animation:`speedLine 0.7s ease-out ${i*0.06}s both`
            }}/>
          ))}
        </div>
        <div style={{position:'absolute', inset:0, background:'linear-gradient(105deg, rgba(10,10,15,0.7) 0%, rgba(10,10,15,0.1) 50%, rgba(10,10,15,0.4) 100%)'}}/>
        <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 35%, rgba(10,10,15,0.8) 75%, rgba(10,10,15,1) 100%)'}}/>
        <div style={{
          position:'absolute', top:'15%', right:'20%',
          width:'120px', height:'120px', borderRadius:'50%',
          background:`radial-gradient(circle, rgba(255,160,0,${lightOn ? 0.15 : 0.05}) 0%, transparent 70%)`,
          transition:'background 0.3s ease', pointerEvents:'none'
        }}/>
        <div style={{
          position:'absolute', bottom:'2rem', left:'1.5rem', right:'1.5rem',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition:'all 1s cubic-bezier(0.16,1,0.3,1) 0.3s'
        }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:'6px',
            background:'rgba(232,67,58,0.18)', border:'1px solid rgba(232,67,58,0.35)',
            borderRadius:'20px', padding:'4px 12px', marginBottom:'10px'
          }}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:'#e8433a', animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'11px', fontWeight:'700', letterSpacing:'2px'}}>АЧИЛТ АПП</span>
          </div>
          <h1 style={{color:'white', fontSize:'2.6rem', fontWeight:'900', margin:'0 0 4px', lineHeight:1, letterSpacing:'-2px', textShadow:'0 4px 30px rgba(0,0,0,0.8)'}}>
            Нэвтрэх
          </h1>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginTop:'8px'}}>
            <div style={{width:'18px', height:'2px', background:'#e8433a', borderRadius:'1px'}}/>
            <p style={{color:'rgba(255,255,255,0.45)', fontSize:'13px', margin:0, fontWeight:'500', letterSpacing:'0.5px'}}>
              Хамгийн ойр · Хамгийн хурдан
            </p>
          </div>
        </div>
      </div>

      <div style={{
        flex:1, padding:'1.8rem 1.5rem 2.5rem',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition:'all 1s cubic-bezier(0.16,1,0.3,1) 0.5s'
      }}>
        <p style={{color:'rgba(255,255,255,0.4)', fontSize:'13px', marginBottom:'14px'}}>
          Утасны дугаараар нэвтрэх
        </p>
        <div style={{display:'flex', gap:'10px', marginBottom:'14px'}}>
          <div style={{
            borderRadius:'14px', padding:'0 14px',
            background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
            display:'flex', alignItems:'center',
            color:'rgba(255,255,255,0.6)', fontSize:'14px', whiteSpace:'nowrap', fontWeight:'600'
          }}>🇲🇳 +976</div>
          <input
            type="tel" placeholder="8 оронтой дугаар"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{
              flex:1, borderRadius:'14px', padding:'14px 16px',
              background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
              color:'white', fontSize:'16px', outline:'none', fontWeight:'700', letterSpacing:'2px'
            }}
          />
        </div>
        {error && (
          <div style={{background:'rgba(232,67,58,0.1)', border:'1px solid rgba(232,67,58,0.25)', borderRadius:'12px', padding:'10px 14px', marginBottom:'14px'}}>
            <p style={{color:'#ff6b6b', fontSize:'13px', margin:0}}>⚠️ {error}</p>
          </div>
        )}
        <button onClick={handleLogin} disabled={loading} style={{
          width:'100%', borderRadius:'16px', padding:'17px',
          background: loading ? 'rgba(232,67,58,0.4)' : '#e8433a',
          border:'none', color:'white', fontSize:'17px', fontWeight:'800',
          cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing:'0.5px', transition:'all 0.2s',
          boxShadow: loading ? 'none' : '0 6px 30px rgba(232,67,58,0.4)'
        }}>
          {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх →'}
        </button>
        <p style={{textAlign:'center', fontSize:'13px', marginTop:'1.5rem', color:'rgba(255,255,255,0.3)'}}>
          Шинэ хэрэглэгч үү?{' '}
          <span onClick={() => router.push('/register')} style={{color:'#e8433a', cursor:'pointer', fontWeight:'700'}}>
            Бүртгүүлэх
          </span>
        </p>
      </div>

      <style>{`
        @keyframes truckCome {
          0% { transform: scale(1.4) translateX(-12%); filter: brightness(0.2) saturate(1.2) blur(6px); }
          50% { filter: brightness(0.35) saturate(1.2) blur(2px); }
          100% { transform: scale(1.05) translateX(0); filter: brightness(0.45) saturate(1.2) blur(0px); }
        }
        @keyframes speedLine {
          0% { transform: translateX(-100%); opacity: 0.8; }
          100% { transform: translateX(200%); opacity: 0; }
        }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.3; transform:scale(0.7); }
        }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(232,67,58,0.5) !important; }
        button:active { transform: scale(0.97) !important; }
      `}</style>
    </div>
  )
}
