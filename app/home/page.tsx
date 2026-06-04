'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  const pressTimer = useRef<any>(null)
  const [tapCount, setTapCount] = useState(0)
  const tapTimer = useRef<any>(null)

  const [gpsStatus, setGpsStatus] = useState<'idle'|'asking'|'granted'|'denied'>('idle')

  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
    // GPS зөвшөөрөл автоматаар асуух
    if (navigator.geolocation) {
      setGpsStatus('asking')
      navigator.geolocation.getCurrentPosition(
        () => setGpsStatus('granted'),
        () => setGpsStatus('denied'),
        { timeout: 10000 }
      )
    }
  }, [])

  const handleLogoPress = () => {
    pressTimer.current = setTimeout(() => {
      router.push('/driver')
    }, 5000)
  }

  const handleLogoRelease = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  const handleBadgeTap = () => {
    setTapCount(c => {
      const next = c + 1
      if (next >= 4) {
        router.push('/admin')
        return 0
      }
      if (tapTimer.current) clearTimeout(tapTimer.current)
      tapTimer.current = setTimeout(() => setTapCount(0), 1500)
      return next
    })
  }

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f', display:'flex', flexDirection:'column', overflow:'hidden'}}>

      {/* Hero зураг */}
      <div style={{position:'relative', height:'42vh', overflow:'hidden'}}>
        <div style={{
          position:'absolute', inset:'-20px',
          backgroundImage:'url(https://i.ibb.co/5WrSCdV3/Jun-4-2026-12-21-53-AM.png)',
          backgroundSize:'cover', backgroundPosition:'center 30%',
          animation:'truckDrive 1.2s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
          filter:'brightness(0.45) saturate(1.1)'
        }}/>
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(to bottom, rgba(10,10,15,0.2) 0%, rgba(10,10,15,0.6) 70%, rgba(10,10,15,1) 100%)'
        }}/>
        {/* Header */}
        <div style={{
          position:'absolute', top:0, left:0, right:0,
          padding:'16px 20px',
          display:'flex', alignItems:'center', justifyContent:'space-between'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <div
              onMouseDown={handleLogoPress}
              onMouseUp={handleLogoRelease}
              onMouseLeave={handleLogoRelease}
              onTouchStart={handleLogoPress}
              onTouchEnd={handleLogoRelease}
              style={{
                width:'34px', height:'34px', borderRadius:'10px',
                background:'#e8433a', display:'flex', alignItems:'center',
                justifyContent:'center', color:'white', fontWeight:'900', fontSize:'16px',
                cursor:'pointer', userSelect:'none', WebkitUserSelect:'none'
              }}>А</div>
            <span style={{color:'white', fontWeight:'800', fontSize:'17px', letterSpacing:'-0.5px'}}>Ачилт</span>
          </div>
          <div
            onClick={handleBadgeTap}
            style={{
              display:'flex', alignItems:'center', gap:'6px',
              background:'rgba(232,67,58,0.2)', border:'1px solid rgba(232,67,58,0.35)',
              borderRadius:'20px', padding:'5px 12px', cursor:'pointer', userSelect:'none'
            }}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:'#e8433a', animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'11px', fontWeight:'700', letterSpacing:'1px'}}>24/7</span>
          </div>
        </div>

        {/* Хурдны шугамууд */}
        <div style={{position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none'}}>
          {[30,42,54,66,78].map((top, i) => (
            <div key={i} style={{
              position:'absolute', top:`${top}%`, left:0, right:0, height:'1px',
              background:'rgba(255,255,255,0.06)',
              animation:`speedLine 0.5s ease-out ${i*0.07}s both`
            }}/>
          ))}
        </div>

        {/* Greeting */}
        <div style={{
          position:'absolute', bottom:'1.5rem', left:'1.5rem',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(15px)',
          transition:'all 0.8s ease 0.2s'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px'}}>
            <div style={{width:'3px', height:'24px', background:'#e8433a', borderRadius:'2px'}}/>
            <span style={{color:'rgba(255,255,255,0.5)', fontSize:'11px', letterSpacing:'3px', textTransform:'uppercase', fontWeight:'700'}}>Ачилт апп</span>
          </div>
          <h2 style={{color:'white', fontSize:'28px', fontWeight:'900', margin:0, letterSpacing:'-1px', textShadow:'0 2px 15px rgba(0,0,0,0.6)'}}>
            Сайн байна уу 👋
          </h2>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginTop:'8px'}}>
            <div style={{width:'16px', height:'2px', background:'#e8433a', borderRadius:'1px'}}/>
            <p style={{color:'rgba(255,255,255,0.45)', fontSize:'13px', margin:0, fontWeight:'500', letterSpacing:'0.5px'}}>
              Хамгийн ойр · Хамгийн хурдан
            </p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{
        padding:'16px',
        display:'flex', flexDirection:'column', gap:'10px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition:'all 0.8s ease 0.4s'
      }}>

        {/* GPS */}
        <div onClick={() => router.push('/current')} style={{
          background:'rgba(255,255,255,0.05)',
          border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:'20px', padding:'18px 20px',
          display:'flex', alignItems:'center', gap:'16px', cursor:'pointer'
        }}>
          <div style={{
            width:'50px', height:'50px', borderRadius:'15px',
            background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.2)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'24px', flexShrink:0
          }}>📍</div>
          <div style={{flex:1}}>
            <p style={{color:'white', fontWeight:'700', fontSize:'15px', margin:0}}>Энэ байгаа байршлаас</p>
            <p style={{color:'rgba(255,255,255,0.35)', fontSize:'13px', marginTop:'3px'}}>GPS байршлыг автоматаар тогтооно</p>
          </div>
          <span style={{color:'rgba(255,255,255,0.15)', fontSize:'20px'}}>›</span>
        </div>

        {/* Гараар */}
        <div onClick={() => router.push('/manual')} style={{
          background:'rgba(255,255,255,0.05)',
          border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:'20px', padding:'18px 20px',
          display:'flex', alignItems:'center', gap:'16px', cursor:'pointer'
        }}>
          <div style={{
            width:'50px', height:'50px', borderRadius:'15px',
            background:'rgba(59,130,246,0.12)', border:'1px solid rgba(59,130,246,0.2)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'24px', flexShrink:0
          }}>✏️</div>
          <div style={{flex:1}}>
            <p style={{color:'white', fontWeight:'700', fontSize:'15px', margin:0}}>Өөр газрын байршил</p>
            <p style={{color:'rgba(255,255,255,0.35)', fontSize:'13px', marginTop:'3px'}}>Гараар хаяг оруулна</p>
          </div>
          <span style={{color:'rgba(255,255,255,0.15)', fontSize:'20px'}}>›</span>
        </div>

        {/* Яаралтай */}
        <div style={{
          background:'rgba(232,67,58,0.08)',
          border:'1px solid rgba(232,67,58,0.18)',
          borderRadius:'20px', padding:'18px 20px',
          display:'flex', alignItems:'center', gap:'16px', cursor:'pointer'
        }}>
          <div style={{
            width:'50px', height:'50px', borderRadius:'15px',
            background:'rgba(232,67,58,0.18)', border:'1px solid rgba(232,67,58,0.3)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'24px', flexShrink:0
          }}>🚨</div>
          <div style={{flex:1}}>
            <p style={{color:'#ff6b5b', fontWeight:'700', fontSize:'15px', margin:0}}>Яаралтай тусламж</p>
            <p style={{color:'rgba(232,67,58,0.45)', fontSize:'13px', marginTop:'3px'}}>Хамгийн ойр · Хамгийн хурдан</p>
          </div>
          <span style={{color:'rgba(232,67,58,0.3)', fontSize:'20px'}}>›</span>
        </div>

        {/* Info */}
        <div style={{
          background:'rgba(255,255,255,0.03)',
          border:'1px solid rgba(255,255,255,0.05)',
          borderRadius:'16px', padding:'14px 16px',
          display:'flex', alignItems:'center', gap:'12px', marginTop:'4px'
        }}>
          <span style={{fontSize:'26px'}}>🚛</span>
          <div>
            <p style={{color:'rgba(255,255,255,0.6)', fontSize:'13px', fontWeight:'600', margin:0}}>Улаанбаатар хот даяар</p>
            <p style={{color:'rgba(255,255,255,0.25)', fontSize:'12px', marginTop:'2px'}}>Тавцан · Чирэгч · Аварийн тусламж</p>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{
        marginTop:'auto',
        display:'flex',
        borderTop:'1px solid rgba(255,255,255,0.06)',
        background:'rgba(10,10,15,0.95)'
      }}>
        {[
          {icon:'🏠', label:'Нүүр', active:true},
          {icon:'🕐', label:'Түүх', active:false},
          {icon:'👤', label:'Профайл', active:false},
        ].map((item, i) => (
          <div key={i} style={{
            flex:1, display:'flex', flexDirection:'column',
            alignItems:'center', padding:'12px 0', gap:'3px',
            cursor:'pointer'
          }}>
            <span style={{fontSize:'20px'}}>{item.icon}</span>
            <span style={{
              fontSize:'11px', fontWeight: item.active ? '700' : '400',
              color: item.active ? '#e8433a' : 'rgba(255,255,255,0.3)'
            }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* GPS Banner */}
      {gpsStatus === 'denied' && (
        <div style={{
          position:'fixed', bottom:'80px', left:'16px', right:'16px', zIndex:100,
          background:'rgba(232,67,58,0.95)', borderRadius:'16px', padding:'14px 16px',
          display:'flex', alignItems:'center', gap:'12px',
          boxShadow:'0 8px 30px rgba(232,67,58,0.4)',
          animation:'slideUp 0.3s ease'
        }}>
          <span style={{fontSize:'24px', flexShrink:0}}>📍</span>
          <div style={{flex:1}}>
            <p style={{color:'white', fontWeight:'700', fontSize:'14px', margin:0}}>GPS зөвшөөрөл шаардлагатай</p>
            <p style={{color:'rgba(255,255,255,0.75)', fontSize:'12px', margin:'3px 0 0'}}>Байршлаа тодорхойлохын тулд GPS-ийг асаана уу</p>
          </div>
          <button onClick={() => {
            // iOS Safari
            if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
              alert('📍 GPS асаах заавар:\n\nТохиргоо → Нууцлал → Байршилтай үйлчилгээ → Safari → Зөвшөөрөх')
            }
            // Android Chrome
            else if (navigator.userAgent.match(/Android/i)) {
              alert('📍 GPS асаах заавар:\n\nХаягийн мөрний зүүн талд 🔒 дарна → Байршил → Зөвшөөрөх')
            }
            // Desktop
            else {
              alert('📍 GPS асаах заавар:\n\nХаягийн мөрний зүүн талд 🔒 дарна → Байршил → Зөвшөөрөх')
            }
            // Дахин оролдох
            setTimeout(() => {
              navigator.geolocation.getCurrentPosition(
                () => setGpsStatus('granted'),
                () => {}
              )
            }, 3000)
          }} style={{background:'white', border:'none', borderRadius:'10px', padding:'8px 12px', color:'#e8433a', fontSize:'12px', fontWeight:'800', cursor:'pointer', flexShrink:0}}>
            Яаж асаах?
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from{transform:translateY(20px);opacity:0}
          to{transform:translateY(0);opacity:1}
        }
        @keyframes truckDrive {
          0% { transform: scale(1.3) translateX(-8%); filter: brightness(0.25) saturate(1.1) blur(3px); }
          60% { filter: brightness(0.4) saturate(1.1) blur(1px); }
          100% { transform: scale(1.02) translateX(0); filter: brightness(0.45) saturate(1.1) blur(0px); }
        }
        @keyframes speedLine {
          0% { transform: scaleX(0); transform-origin: left; opacity: 1; }
          100% { transform: scaleX(1); transform-origin: left; opacity: 0; }
        }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(0.7); }
        }
      `}</style>
    </div>
  )
}
