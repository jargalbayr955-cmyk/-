'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Step = 'phone' | 'otp' | 'pin'

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSendOtp = async () => {
    if (!phone || phone.length < 8) return setError('Зөв утасны дугаар оруулна уу')
    setLoading(true)
    setError('')
    const fullPhone = '+976' + phone
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone })
    if (error) { setError('SMS явуулахад алдаа: ' + error.message) }
    else { setStep('otp') }
    setLoading(false)
  }

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 4) return setError('OTP код оруулна уу')
    setLoading(true)
    setError('')
    const fullPhone = '+976' + phone
    const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' })
    if (error) { setError('Код буруу: ' + error.message) }
    else { setStep('pin') }
    setLoading(false)
  }

  const handleSetPin = async () => {
    if (!pin || pin.length !== 4) return setError('4 оронтой PIN оруулна уу')
    if (pin !== pinConfirm) return setError('PIN таарахгүй байна')
    setLoading(true)
    setError('')
    const fullPhone = '+976' + phone
    const { data, error } = await supabase.from('users').upsert({ phone: fullPhone, pin }, { onConflict: 'phone' }).select().single()
    if (error) { setError('Бүртгэлд алдаа гарлаа') }
    else {
      localStorage.setItem('user', JSON.stringify(data))
      router.push('/home')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      <div className="relative h-48 overflow-hidden">
        <div className="w-full h-full flex items-center justify-center" style={{ background: '#1a0a2e' }}>
          <div className="text-center">
            <div className="text-6xl mb-2">🚛</div>
          </div>
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, #0f0f1a 100%)' }}></div>
        <div className="absolute bottom-4 left-6">
          <h1 className="text-white text-2xl font-medium">Бүртгүүлэх</h1>
        </div>
      </div>
      <div className="flex-1 px-6 pt-6 pb-10">
        {step === 'phone' && (
          <>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Утасны дугаараа оруулна уу</p>
            <div className="flex gap-2 mb-4">
              <div className="rounded-2xl px-3 py-3.5 text-sm flex items-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>🇲🇳 +976</div>
              <input type="tel" placeholder="8 оронтой дугаар" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))} className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            </div>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button onClick={handleSendOtp} disabled={loading} className="w-full rounded-2xl py-4 font-medium text-sm text-white disabled:opacity-50" style={{ background: '#e8433a' }}>{loading ? 'Явуулж байна...' : 'SMS код явуулах'}</button>
          </>
        )}
        {step === 'otp' && (
          <>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>+976{phone} дугаарт код явуулсан</p>
            <input type="number" placeholder="6 оронтой код" value={otp} onChange={e => setOtp(e.target.value.slice(0, 6))} className="w-full rounded-2xl px-4 py-3.5 mb-4 text-sm outline-none text-center tracking-widest" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button onClick={handleVerifyOtp} disabled={loading} className="w-full rounded-2xl py-4 font-medium text-sm text-white disabled:opacity-50" style={{ background: '#e8433a' }}>{loading ? 'Шалгаж байна...' : 'Баталгаажуулах'}</button>
            <button onClick={() => { setStep('phone'); setError('') }} className="w-full text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.35)' }}>← Дугаар өөрчлөх</button>
          </>
        )}
        {step === 'pin' && (
          <>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>4 оронтой PIN тохируулна уу</p>
            <input type="password" placeholder="4 оронтой PIN" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full rounded-2xl px-4 py-3.5 mb-3 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            <input type="password" placeholder="PIN давтах" maxLength={4} value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full rounded-2xl px-4 py-3.5 mb-4 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button onClick={handleSetPin} disabled={loading} className="w-full rounded-2xl py-4 font-medium text-sm text-white disabled:opacity-50" style={{ background: '#e8433a' }}>{loading ? 'Хадгалж байна...' : 'Бүртгэл үүсгэх'}</button>
          </>
        )}
        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Бүртгэлтэй юу? <span style={{ color: '#e8433a' }} className="cursor-pointer" onClick={() => router.push('/')}>Нэвтрэх</span></p>
      </div>
    </div>
  )
}
