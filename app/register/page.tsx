'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'driving'|'stopping'|'dust'|'done'>('driving')
  const [visible, setVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Машин ирнэ → зогсоно → тоос → текст
    setTimeout(() => setPhase('stopping'), 1000)
    setTimeout(() => setPhase('dust'), 1600)
    setTimeout(() => { setPhase('done'); setVisible(true) }, 2200)
  }, [])

  const handleRegister = async () => {
    if (!phone || phone.length < 8) return setError('Зөв утасны дугаар оруулна уу')
    setLoading(true)
    setError('')
    const fullPhone = '+976' + phone
    const { data: existing } = await supabase.from('users').select().eq('phone', fullPhone).single()
    if (existing) { setError('Энэ дугаар бүртгэлтэй байна'); setLoading(false); return }
    const { data, error } = await supabase.from('users').insert({ phone: fullPhone }).select().single()
    if (error) { setError('Бүртгэлд алдаа гарлаа') }
    else { localStorage.setItem('user', JSON.stringify(data)); router.push('/home') }
    setLoading(false)
  }

  const truckX = phase === 'driving' ? '-120%' : phase === 'stopping' ? '5%' : '0%'
  const truckSkew = phase === 'driving' ? '-3deg' : '0deg'

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column', overflow:'hidden'}}>

      {/* Hero анимэйшн хэсэг */}
      <div style={{position:'relative', height:'52vh', overflow:'hidden', background:'linear-gradient(180deg, #0d1117 0%, #1a0a0a 60%, #0a0a0f 100%)'}}>

        {/* Зам */}
        <div style={{position:'absolute', bottom:'22%', left:0, right:0, height:'3px', background:'rgba(255,255,255,0.06)'}}/>
        <div style={{position:'absolute', bottom:'18%', left:0, right:0, height:'60px', background:'linear-gradient(180deg, rgba(30,20,10,0) 0%, rgba(30,20,10,0.4) 100%)'}}/>

        {/* Замын шугам */}
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{
            position:'absolute', bottom:'22%',
            left:`${i*20-5}%`, width:'12%', height:'3px',
            background:'rgba(255,200,0,0.15)',
            borderRadius:'2px'
          }}/>
        ))}

        {/* Хурдны шугамууд — driving үед л */}
        {phase === 'driving' && [20,32,44,56,68].map((top, i) => (
          <div key={i} style={{
            position:'absolute', top:`${top}%`,
            left:'-20%', width:'40%', height:'1px',
            background:'rgba(255,255,255,0.05)',
            animation:`speedPass 0.4s linear ${i*0.05}s both`
          }}/>
        ))}

        {/* Тоос */}
        {(phase === 'dust' || phase === 'done') && [0,1,2,3,4,5,6,7].map(i => (
          <div key={i} style={{
            position:'absolute',
            bottom: `${22 + Math.random()*15}%`,
            left: `${40 + i*4}%`,
            width: `${8+i*3}px`, height: `${8+i*3}px`,
            borderRadius:'50%',
            background:'rgba(180,140,80,0.3)',
            animation:`dustFloat${i%3} ${0.8+i*0.15}s ease-out both`,
            animationDelay:`${i*0.06}s`
          }}/>
        ))}

        {/* Машин SVG */}
        <div style={{
          position:'absolute',
          bottom:'18%', left:'50%',
          transform:`translateX(calc(${truckX} - 50%)) skewX(${truckSkew})`,
          transition: phase === 'driving' ? 'transform 1s cubic-bezier(0.25,0.46,0.45,0.94)' : 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          width:'240px'
        }}>
          <svg viewBox="0 0 240 90" xmlns="http://www.w3.org/2000/svg">
            {/* Тавцан */}
            <rect x="20" y="38" width="200" height="30" rx="4" fill="#e8433a"/>
            <rect x="20" y="52" width="200" height="10" rx="2" fill="#c0392b"/>
            {/* Кабин */}
            <rect x="140" y="20" width="70" height="48" rx="6" fill="#e8433a"/>
            <rect x="148" y="26" width="30" height="20" rx="3" fill="#1a2a3a" opacity="0.9"/>
            <rect x="182" y="26" width="20" height="20" rx="3" fill="#1a2a3a" opacity="0.9"/>
            {/* Цонхны тусгал */}
            <rect x="150" y="28" width="8" height="8" rx="1" fill="rgba(255,255,255,0.15)"/>
            {/* Гэрэл */}
            <rect x="206" y="32" width="12" height="8" rx="2" fill="#ffd700"/>
            <rect x="206" y="32" width="12" height="8" rx="2" fill="rgba(255,220,0,0.6)" style={{filter:'blur(3px)'}}/>
            {/* Аварийн гэрэл дээр */}
            <rect x="155" y="16" width="40" height="7" rx="3" fill="#cc3300"/>
            <rect x="158" y="17" width="6" height="5" rx="1" fill={phase === 'done' ? '#ff4400' : '#ff8800'} style={{transition:'fill 0.3s'}}/>
            <rect x="167" y="17" width="6" height="5" rx="1" fill={phase === 'done' ? '#ff8800' : '#ff4400'} style={{transition:'fill 0.3s'}}/>
            <rect x="176" y="17" width="6" height="5" rx="1" fill={phase === 'done' ? '#ff4400' : '#ff8800'} style={{transition:'fill 0.3s'}}/>
            <rect x="185" y="17" width="6" height="5" rx="1" fill={phase === 'done' ? '#ff8800' : '#ff4400'} style={{transition:'fill 0.3s'}}/>
            {/* Дугуй */}
            <circle cx="60" cy="68" r="14" fill="#1a1a1a"/>
            <circle cx="60" cy="68" r="9" fill="#333"/>
            <circle cx="60" cy="68" r="4" fill="#555"/>
            <circle cx="170" cy="68" r="14" fill="#1a1a1a"/>
            <circle cx="170" cy="68" r="9" fill="#333"/>
            <circle cx="170" cy="68" r="4" fill="#555"/>
            {/* Тавцан дээрх зураас */}
            <line x1="40" y1="44" x2="130" y2="44" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="8,6"/>
          </svg>
        </div>

        {/* Тоосны гэрэл */}
        {(phase === 'dust' || phase === 'done') && (
          <div style={{
            position:'absolute', bottom:'15%', left:'35%',
            width:'200px', height:'80px',
            background:'radial-gradient(ellipse, rgba(180,120,50,0.2) 0%, transparent 70%)',
            animation:'dustGlow 1s ease-out both'
          }}/>
        )}

        {/* Overlay */}
        <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 40%, rgba(10,10,15,0.7) 80%, rgba(10,10,15,1) 100%)'}}/>

        {/* Текст */}
        <div style={{
          position:'absolute', bottom:'1.5rem', left:'1.5rem', right:'1.5rem',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition:'all 0.8s ease'
        }}>
          <div style={{display:'inline-flex', alignItems:'center', gap:'6px', background:'rgba(232,67,58,0.18)', border:'1px solid rgba(232,67,58,0.35)', borderRadius:'20px', padding:'4px 12px', marginBottom:'8px'}}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:'#e8433a', animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'11px', fontWeight:'700', letterSpacing:'2px'}}>АЧИЛТ АПП</span>
          </div>
          <h1 style={{color:'white', fontSize:'2.4rem', fontWeight:'900', margin:'0 0 4px', lineHeight:1, letterSpacing:'-2px', textShadow:'0 4px 20px rgba(0,0,0,0.8)'}}>
            Бүртгүүлэх
          </h1>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginTop:'6px'}}>
            <div style={{width:'16px', height:'2px', background:'#e8433a', borderRadius:'1px'}}/>
            <p style={{color:'rgba(255,255,255,0.4)', fontSize:'13px', margin:0, fontWeight:'500'}}>Хамгийн ойр · Хамгийн хурдан</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{
        flex:1, padding:'1.8rem 1.5rem 2.5rem',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition:'all 0.8s ease 0.2s'
      }}>
        <p style={{color:'rgba(255,255,255,0.4)', fontSize:'13px', marginBottom:'14px'}}>Утасны дугаараа оруулна уу</p>
        <div style={{display:'flex', gap:'10px', marginBottom:'14px'}}>
          <div style={{borderRadius:'14px', padding:'0 14px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', color:'rgba(255,255,255,0.6)', fontSize:'14px', whiteSpace:'nowrap', fontWeight:'600'}}>🇲🇳 +976</div>
          <input type="tel" placeholder="8 оронтой дугаар" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,'').slice(0,8))}
            style={{flex:1, borderRadius:'14px', padding:'14px 16px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'white', fontSize:'16px', outline:'none', fontWeight:'700', letterSpacing:'2px'}}/>
        </div>
        {error && <div style={{background:'rgba(232,67,58,0.1)', border:'1px solid rgba(232,67,58,0.25)', borderRadius:'12px', padding:'10px 14px', marginBottom:'14px'}}><p style={{color:'#ff6b6b', fontSize:'13px', margin:0}}>⚠️ {error}</p></div>}
        <button onClick={handleRegister} disabled={loading} style={{width:'100%', borderRadius:'16px', padding:'17px', background: loading ? 'rgba(232,67,58,0.4)' : '#e8433a', border:'none', color:'white', fontSize:'17px', fontWeight:'800', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing:'0.5px', transition:'all 0.2s', boxShadow: loading ? 'none' : '0 6px 30px rgba(232,67,58,0.4)'}}>
          {loading ? 'Бүртгэж байна...' : 'Бүртгүүлэх →'}
        </button>
        <p style={{textAlign:'center', fontSize:'13px', marginTop:'1.5rem', color:'rgba(255,255,255,0.3)'}}>
          Бүртгэлтэй юу? <span onClick={() => router.push('/login')} style={{color:'#e8433a', cursor:'pointer', fontWeight:'700'}}>Нэвтрэх</span>
        </p>
      </div>

      <style>{`
        @keyframes speedPass { 0%{transform:translateX(-100%);opacity:1} 100%{transform:translateX(400%);opacity:0} }
        @keyframes dustFloat0 { 0%{transform:translate(0,0) scale(0);opacity:0.8} 100%{transform:translate(-20px,-40px) scale(2);opacity:0} }
        @keyframes dustFloat1 { 0%{transform:translate(0,0) scale(0);opacity:0.6} 100%{transform:translate(-30px,-60px) scale(2.5);opacity:0} }
        @keyframes dustFloat2 { 0%{transform:translate(0,0) scale(0);opacity:0.7} 100%{transform:translate(-10px,-50px) scale(1.8);opacity:0} }
        @keyframes dustGlow { 0%{opacity:0;transform:scale(0.5)} 50%{opacity:1} 100%{opacity:0;transform:scale(1.5)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.7)} }
        input::placeholder{color:rgba(255,255,255,0.2);}
        input:focus{border-color:rgba(232,67,58,0.5)!important;}
        button:active{transform:scale(0.97)!important;}
      `}</style>
    </div>
  )
}
