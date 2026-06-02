'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-3xl">🚛</span>
          <h1 className="text-2xl font-medium">АчТүрэн</h1>
        </div>
        <p className="text-gray-500 text-sm mb-6">Утасны дугаараар нэвтэрнэ</p>
        <input
          type="tel"
          placeholder="Утасны дугаар"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-3 text-sm outline-none focus:border-red-400"
        />
        <input
          type="password"
          placeholder="4 оронтой PIN"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm outline-none focus:border-red-400"
        />
        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-red-500 text-white rounded-xl py-3 font-medium text-sm disabled:opacity-50"
        >
          {loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}
        </button>
      </div>
    </div>
  )
}