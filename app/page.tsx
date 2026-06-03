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
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) {
      router.push('/home')
    } else {
      setChecking(false)
    }
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

  return (
    <div className="min-h-screen flex flex-col" style={{background:'#0f0f1a'}}>
      <div className="relative h-64 overflow-hidden">
        {heroUrl ? (
          <img src={heroUrl} alt="hero" className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{background:'#1a0a2e'}}>
            <div className="text-center">
              <div className="text-6xl mb-2">🚛</div>
              <div className="text-white text-lg font-medium opacity-50">Ачилт</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0" style={{background:'linear-gradient(to bottom, transparent 40%, #0f0f1a 100%)'}}></div>
        <div className="absolute bottom-4 left-6">
          <h1 className="text-white text-3xl font-medium tracking-tight">Ачилт</h1>
          <p className="text-white text-sm opacity-50 mt-1">Аварийн машин дуудах</p>
        </div>
      </div>

      <div className="flex-1 px-6 pt-6 pb-10">
        <p className="text-sm mb-6" style={{color:'rgba(255,255,255,0.4)'}}>Утасны дугаараар нэвтрэх</p>

        <div className="flex gap-2 mb-4">
          <div className="rounded-2xl px-3 py-3.5 text-sm flex items-center" style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)'}}>🇲🇳 +976</div>
          <input
            type="tel"
            placeholder="8 оронтой дугаар"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
            style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-2xl py-4 font-medium text-sm text-white disabled:opacity-50"
          style={{background:'#e8433a'}}
        >
          {loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.08)'}}></div>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>эсвэл</span>
          <div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.08)'}}></div>
        </div>

        <p className="text-center text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
          Шинэ хэрэглэгч? <span style={{color:'#e8433a'}} className="cursor-pointer" onClick={() => router.push('/register')}>Бүртгүүлэх</span>
        </p>
      </div>
    </div>
  )
}
