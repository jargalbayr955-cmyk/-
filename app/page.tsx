'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) router.push('/home')
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('hero_url')
    if (saved) setHeroUrl(saved)
  }, [])

  const handleLogin = async () => {
    if (!phone || !pin) return setError('Дугаар болон PIN оруулна уу')
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('phone', phone)
      .eq('pin', pin)
      .single()
    if (error || !data) {
      setError('Дугаар эсвэл PIN буруу байна')
    } else {
      localStorage.setItem('user', JSON.stringify(data))
      router.push('/home')
    }
    setLoading(false)
  }

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

        <input
          type="tel"
          placeholder="Утасны дугаар"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 mb-3 text-sm outline-none"
          style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
        />
        <input
          type="password"
          placeholder="4 оронтой PIN"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 mb-4 text-sm outline-none"
          style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
        />

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
