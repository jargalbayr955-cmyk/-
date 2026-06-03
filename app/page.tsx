'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [checking, setChecking] = useState(true)
  const [visible, setVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) { router.push('/home'); return }
    setChecking(false)
    setTimeout(() => setVisible(true), 100)
  }, [])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'hero_url').single().then(({ data }) => {
      if (data?.value) setHeroUrl(data.value)
    })
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

  if (checking) return null

  const bgImage = heroUrl || 'https://i.ibb.co/5WrSCdV3/Jun-4-2026-12-21-53-AM.png'

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column', overflow:'hidden'}}>

      {/* Hero */}
      <div style={{position:'relative', height:'58vh', overflow:'hidden'}}>

        {/* Зураг — машин хурдтай ирж байгаа мэт */}
        <div style={{
          position:'absolute', inset:'-30px',
          backgroundImage:`url(${bgImage})`,
          backgroundSize:'130%',
          backgroundPosition:'20% center',
          animation:'truckDrive 1.2s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
          filter:'brightness(0.5) saturate(1.2)'
        }}/>

        {/* Хөдөлгөөний blur шугамууд */}
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(to right, rgba(0,0,0,0.6) 0%, transparent 40%, transparent 70%, rgba(0,0,0,0.3) 100%)',
          animation:'fadeIn 0.8s ease forwards'
        }}/>
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(to bottom, transparent 30%, rgba(10,10,15,0.7) 70%, rgba(10,10,15,1) 100%)'
        }}/>

        {/* Хурдны шугамууд */}
        <div style={{position:'absolute', inset:0, overflow:'hidden', opacity: visible ? 0 : 1, transition:'opacity 1s ease 0.8s'}}>
          {[35,45,55,65,75].map((top, i) => (
            <div key={i} style={{
              position:'absolute', top:`${top}%`, left:0, right:0, height:'1px',
              background:'rgba(255,255,255,0.08)',
              animation:`speedLine 0.6s ease-out ${i * 0.08}s forwards`
            }}/>
          ))}
        </div>

        {/* Текст */}
        <div style={{
          position:'absolute', bottom:'2rem', left:'1.5rem', right:'1.5rem',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(25px)',
          transition:'all 0.9s cubic-bezier(0.25,0.46,0.45,0.94) 0.4s'
        }}>
          {/* Badge */}
          <div style={{
            display:'inline-flex', alignItems:'center', gap:'6px',
            background:'rgba(232,67,58,0.2)', border:'1px solid rgba(232,67,58,0.4)',
            borderRadius:'20px', padding:'4px 12px', marginBottom:'12px'
          }}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:'#e8433a', animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'11px', fontWeight:'700', letterSpacing:'2px', textTransform:'uppercase'}}>24/7 Дуудлага</span>
          </div>

          <h1 style={{
            color:'white', fontSize:'3rem', fontWeight:'900', margin:0,
            lineHeight:1, letterSpacing:'-2px',
            textShadow:'0 2px 20px rgba(0,0,0,0.5)'
          }}>
            Ачилт
          </h1>

          <div style={{display:'flex', alignItems:'center', gap:'8px', marginTop:'10px'}}>
            <div style={{width:'20px', height:'2px', background:'#e8433a', borderRadius:'1px'}}/>
            <p style={{color:'rgba(255,255,255,0.6)', fontSize:'13px', margin:0, fontWeight:'500', letterSpacing:'1px'}}>
              Хамгийн ойр · Хамгийн хурдан
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{
        flex:1, padding:'1.8rem 1.5rem 2rem',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition:'all 0.9s cubic-bezier(0.25,0.46,0.45,0.94) 0.6s'
      }}>

        <p style={{color:'rgba(255,255,255,0.45)', fontSize:'13px', marginBottom:'14px', letterSpacing:'0.3px'}}>
          Утасны дугаараар нэвтрэх
        </p>

        <div style={{display:'flex', gap:'10px', marginBottom:'14px'}}>
          <div style={{
            borderRadius:'14px', padding:'0 14px',
            background:'rgba(255,255,255,0.06)',
            border:'1px solid rgba(255,255,255,0.1)',
            display:'flex', alignItems:'center',
            color:'rgba(255,255,255,0.6)', fontSize:'14px',
            whiteSpace:'nowrap', fontWeight:'500'
          }}>🇲🇳 +976</div>
          <input
            type="tel"
            placeholder="8 оронтой дугаар"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{
              flex:1, borderRadius:'14px', padding:'14px 16px',
              background:'rgba(255,255,255,0.06)',
              border:'1px solid rgba(255,255,255,0.1)',
              color:'white', fontSize:'16px', outline:'none',
              fontWeight:'600', letterSpacing:'1px'
            }}
          />
        </div>

        {error && (
          <div style={{
            background:'rgba(232,67,58,0.12)', border:'1px solid rgba(232,67,58,0.25)',
            borderRadius:'12px', padding:'10px 14px', marginBottom:'14px'
          }}>
            <p style={{color:'#ff6b6b', fontSize:'13px', margin:0}}>⚠️ {error}</p>
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width:'100%', borderRadius:'16px', padding:'17px',
            background: loading ? 'rgba(232,67,58,0.4)' : '#e8433a',
            border:'none', color:'white', fontSize:'17px', fontWeight:'800',
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing:'0.5px',
            transition:'all 0.2s',
            boxShadow: loading ? 'none' : '0 6px 30px rgba(232,67,58,0.45)',
            transform: loading ? 'scale(0.98)' : 'scale(1)'
          }}
        >
          {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх →'}
        </button>

        <div style={{display:'flex', alignItems:'center', gap:'12px', margin:'1.2rem 0'}}>
          <div style={{flex:1, height:'1px', background:'rgba(255,255,255,0.07)'}}/>
          <span style={{color:'rgba(255,255,255,0.18)', fontSize:'12px'}}>эсвэл</span>
          <div style={{flex:1, height:'1px', background:'rgba(255,255,255,0.07)'}}/>
        </div>

        <button
          onClick={() => router.push('/register')}
          style={{
            width:'100%', borderRadius:'16px', padding:'16px',
            background:'transparent',
            border:'1px solid rgba(255,255,255,0.12)',
            color:'rgba(255,255,255,0.6)', fontSize:'15px', fontWeight:'600',
            cursor:'pointer', letterSpacing:'0.5px',
            transition:'all 0.2s'
          }}
        >
          Шинэ бүртгэл үүсгэх
        </button>
      </div>

      <style>{`
        @keyframes truckDrive {
          0% { transform: scale(1.3) translateX(-8%); filter: brightness(0.3) saturate(1.2) blur(3px); }
          60% { filter: brightness(0.45) saturate(1.2) blur(1px); }
          100% { transform: scale(1.05) translateX(0); filter: brightness(0.5) saturate(1.2) blur(0px); }
        }
        @keyframes speedLine {
          0% { transform: scaleX(0); transform-origin: left; opacity: 1; }
          100% { transform: scaleX(1); transform-origin: left; opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(232,67,58,0.5) !important; background: rgba(255,255,255,0.08) !important; }
        button:active { transform: scale(0.97) !important; }
      `}</style>
    </div>
  )
}
