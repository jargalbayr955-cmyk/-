'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
  }, [])

  const handleRegister = async () => {
    if (!phone || phone.length < 8) return setError('Зөв утасны дугаар оруулна уу')
    setLoading(true)
    setError('')
    const fullPhone = '+976' + phone
    const { data: existing } = await supabase.from('users').select().eq('phone', fullPhone).single()
    if (existing) {
      setError('Энэ дугаар бүртгэлтэй байна')
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('users').insert({ phone: fullPhone }).select().single()
    if (error) {
      setError('Бүртгэлд алдаа гарлаа')
    } else {
      localStorage.setItem('user', JSON.stringify(data))
      router.push('/home')
    }
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column', overflow:'hidden'}}>

      {/* Hero зураг + анимэйшн */}
      <div style={{position:'relative', height:'55vh', overflow:'hidden'}}>
        <div style={{
          position:'absolute', inset:'-20px',
          backgroundImage:'url(https://i.ibb.co/5WrSCdV3/Jun-4-2026-12-21-53-AM.png)',
          backgroundSize:'cover',
          backgroundPosition:'center',
          animation:'zoomIn 8s ease-out forwards',
          filter:'brightness(0.55)'
        }}/>
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(to bottom, rgba(10,10,15,0.1) 0%, rgba(10,10,15,0.5) 60%, rgba(10,10,15,1) 100%)'
        }}/>
        {/* Анимэйштэй текст */}
        <div style={{
          position:'absolute', bottom:'2rem', left:'1.5rem', right:'1.5rem',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition:'all 0.8s ease'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px'}}>
            <div style={{width:'3px', height:'28px', background:'#e8433a', borderRadius:'2px'}}/>
            <p style={{color:'rgba(255,255,255,0.6)', fontSize:'13px', letterSpacing:'3px', textTransform:'uppercase', margin:0}}>Ачилт апп</p>
          </div>
          <h1 style={{color:'white', fontSize:'2.2rem', fontWeight:'800', margin:0, lineHeight:1.1, letterSpacing:'-1px'}}>
            Бүртгүүлэх
          </h1>
          <p style={{color:'rgba(255,255,255,0.5)', fontSize:'14px', marginTop:'8px'}}>
            Аварийн машин хурдан, найдвартай
          </p>
        </div>
      </div>

      {/* Form */}
      <div style={{
        flex:1, padding:'2rem 1.5rem',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition:'all 0.8s ease 0.2s'
      }}>

        <p style={{color:'rgba(255,255,255,0.5)', fontSize:'13px', marginBottom:'1.2rem', letterSpacing:'0.5px'}}>
          Утасны дугаараа оруулна уу
        </p>

        <div style={{display:'flex', gap:'10px', marginBottom:'16px'}}>
          <div style={{
            borderRadius:'14px', padding:'0 14px',
            background:'rgba(255,255,255,0.06)',
            border:'1px solid rgba(255,255,255,0.12)',
            display:'flex', alignItems:'center',
            color:'rgba(255,255,255,0.7)', fontSize:'14px',
            whiteSpace:'nowrap'
          }}>🇲🇳 +976</div>
          <input
            type="tel"
            placeholder="8 оронтой дугаар"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{
              flex:1, borderRadius:'14px', padding:'14px 16px',
              background:'rgba(255,255,255,0.06)',
              border:'1px solid rgba(255,255,255,0.12)',
              color:'white', fontSize:'16px', outline:'none',
              fontWeight:'500'
            }}
          />
        </div>

        {error && (
          <div style={{
            background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)',
            borderRadius:'12px', padding:'10px 14px', marginBottom:'16px'
          }}>
            <p style={{color:'#ff6b6b', fontSize:'13px', margin:0}}>⚠️ {error}</p>
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={loading}
          style={{
            width:'100%', borderRadius:'16px', padding:'16px',
            background: loading ? 'rgba(232,67,58,0.5)' : '#e8433a',
            border:'none', color:'white', fontSize:'16px', fontWeight:'700',
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing:'0.5px',
            transition:'all 0.2s',
            boxShadow: loading ? 'none' : '0 4px 20px rgba(232,67,58,0.4)'
          }}
        >
          {loading ? 'Бүртгэж байна...' : 'Бүртгүүлэх →'}
        </button>

        <p style={{textAlign:'center', fontSize:'13px', marginTop:'1.5rem', color:'rgba(255,255,255,0.35)'}}>
          Бүртгэлтэй юу?{' '}
          <span
            onClick={() => router.push('/')}
            style={{color:'#e8433a', cursor:'pointer', fontWeight:'600'}}
          >
            Нэвтрэх
          </span>
        </p>
      </div>

      <style>{`
        @keyframes zoomIn {
          from { transform: scale(1.12); }
          to { transform: scale(1); }
        }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { border-color: rgba(232,67,58,0.6) !important; }
      `}</style>
    </div>
  )
}
