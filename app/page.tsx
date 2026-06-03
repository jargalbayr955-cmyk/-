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
    const saved = localStorage.getItem('hero_url')
    if (saved) setHeroUrl(saved)
  }, [])

  const handleLogin = async () => {
    if (!phone || !pin) return setError('Ð”ÑƒÐ³Ð°Ð°Ñ€ Ð±Ð¾Ð»Ð¾Ð½ PIN Ð¾Ñ€ÑƒÑƒÐ»Ð½Ð° ÑƒÑƒ')
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('phone', phone)
      .eq('pin', pin)
      .single()
    if (error || !data) {
      setError('Ð”ÑƒÐ³Ð°Ð°Ñ€ ÑÑÐ²ÑÐ» PIN Ð±ÑƒÑ€ÑƒÑƒ Ð±Ð°Ð¹Ð½Ð°')
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
              <div className="text-6xl mb-2">ðŸš›</div>
              <div className="text-white text-lg font-medium opacity-50">ÐÑ‡Ð¸Ð»Ñ‚</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0" style={{background:'linear-gradient(to bottom, transparent 40%, #0f0f1a 100%)'}}></div>
        <div className="absolute bottom-4 left-6">
          <h1 className="text-white text-3xl font-medium tracking-tight">ÐÑ‡Ð¸Ð»Ñ‚</h1>
          <p className="text-white text-sm opacity-50 mt-1">ÐÐ²Ð°Ñ€Ð¸Ð¹Ð½ Ð¼Ð°ÑˆÐ¸Ð½ Ð´ÑƒÑƒÐ´Ð°Ñ…</p>
        </div>
      </div>

      <div className="flex-1 px-6 pt-6 pb-10">
        <p className="text-sm mb-6" style={{color:'rgba(255,255,255,0.4)'}}>Ð£Ñ‚Ð°ÑÐ½Ñ‹ Ð´ÑƒÐ³Ð°Ð°Ñ€Ð°Ð°Ñ€ Ð½ÑÐ²Ñ‚ÑÑ€Ð½Ñ</p>

        <input
          type="tel"
          placeholder="Ð£Ñ‚Ð°ÑÐ½Ñ‹ Ð´ÑƒÐ³Ð°Ð°Ñ€"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 mb-3 text-sm outline-none"
          style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
        />
        <input
          type="password"
          placeholder="4 Ð¾Ñ€Ð¾Ð½Ñ‚Ð¾Ð¹ PIN"
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
          {loading ? 'Ð¢Ò¯Ñ€ Ñ…Ò¯Ð»ÑÑÐ½Ñ Ò¯Ò¯...' : 'ÐÑÐ²Ñ‚Ñ€ÑÑ…'}
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.08)'}}></div>
          <span className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>ÑÑÐ²ÑÐ»</span>
          <div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.08)'}}></div>
        </div>

        <p className="text-center text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
          Ð¨Ð¸Ð½Ñ Ñ…ÑÑ€ÑÐ³Ð»ÑÐ³Ñ‡? <span style={{color:'#e8433a'}} className="cursor-pointer">Ð‘Ò¯Ñ€Ñ‚Ð³Ò¯Ò¯Ð»ÑÑ…</span>
        </p>
      </div>
    </div>
  )
}
