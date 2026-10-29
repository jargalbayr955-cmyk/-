'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { clearCustomerBrowserState, notifyCustomerSessionChanged, phoneInput, readRememberedCustomerPhone, rememberCustomerPhone } from '@/lib/client/session'
import { requestCustomerOtp, verifyCustomerOtp } from '@/lib/client/customer-auth'
import { SessionGate } from './session-gate'
import { BrandAccess } from './access-shortcuts'

export function CustomerAuth() {
  return <SessionGate mode="guest"><AuthForm /></SessionGate>
}

function AuthForm() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signedOut, setSignedOut] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [, setTick] = useState(0)
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const rememberedPhone = readRememberedCustomerPhone()
    if (rememberedPhone) setPhone(rememberedPhone)
    try {
      if (sessionStorage.getItem('achilt_signed_out') === '1') {
        setSignedOut(true)
        sessionStorage.removeItem('achilt_signed_out')
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (step !== 'otp') return
    const timer = setInterval(() => setTick(value => value + 1), 1_000)
    return () => clearInterval(timer)
  }, [step])

  useEffect(() => {
    if (step === 'otp') codeRef.current?.focus()
  }, [step, verificationId])

  const resendSeconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))

  const finishLogin = () => {
    rememberCustomerPhone(phone)
    clearCustomerBrowserState()
    notifyCustomerSessionChanged()
    window.location.replace('/services')
  }

  const sendOtp = async () => {
    if (pending.current) return
    setError('')
    if (!/^\d{8}$/.test(phone)) {
      setError('8 оронтой утасны дугаараа оруулна уу.')
      phoneRef.current?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    const result = await requestCustomerOtp(phone)
    if (result.ok) {
      if (result.trusted) {
        finishLogin()
        return
      }
      setVerificationId(result.verificationId)
      setCode('')
      setStep('otp')
      setResendAt(Date.now() + result.resendAfterSeconds * 1000)
    } else {
      setError(result.error)
    }
    setBusy(false)
    pending.current = false
  }

  const submitPhone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendOtp()
  }

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending.current) return
    setError('')
    if (!/^\d{6}$/.test(code)) {
      setError('SMS-ээр ирсэн 6 оронтой OTP кодоо оруулна уу.')
      codeRef.current?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    const result = await verifyCustomerOtp(phone, verificationId, code)
    if (result.ok) {
      finishLogin()
      return
    }
    setError(result.error)
    setBusy(false)
    pending.current = false
  }

  const changePhone = () => {
    if (pending.current) return
    setStep('phone')
    setVerificationId('')
    setCode('')
    setError('')
    setResendAt(0)
    setTimeout(() => phoneRef.current?.focus(), 0)
  }

  return <main className="auth-shell">
    <section className="auth-card" aria-labelledby="auth-title">
      <div style={{ marginBottom: 10 }}>
        <BrandAccess className="auth-brand-mark" />
      </div>
      <p className="auth-eyebrow">АЧИЛТ • ТУСЛАМЖ ОЙРХОН</p>
      <h1 id="auth-title">Тавтай морил</h1>
      <p className="auth-intro">Утасны дугаараа баталгаажуулаад хэрэгтэй үйлчилгээгээ сонгон ойр жолооч нарын үнийн саналаас сонгоорой.</p>
      {signedOut && <p className="auth-success" role="status">Амжилттай гарлаа. Энэ төхөөрөмж 90 хоногийн баталгаажуулалттай хэвээр бол доорх товчийг дарахад OTP SMS явуулахгүйгээр шууд нэвтэрнэ.</p>}

      {step === 'phone' ? <>
        <h2 className="auth-section-title">Утасны дугаараар нэвтрэх</h2>
        <form onSubmit={submitPhone} noValidate aria-busy={busy}>
          <label className="auth-label" htmlFor="auth-phone">Утасны дугаар</label>
          <div className="auth-phone-row">
            <span className="auth-country" aria-hidden="true">+976</span>
            <input ref={phoneRef} id="auth-phone" name="username" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} disabled={busy} onChange={event => { setPhone(phoneInput(event.target.value)); setError('') }} placeholder="8 оронтой дугаар" aria-describedby={error ? 'auth-error' : undefined} />
          </div>
          {error && <div id="auth-error" className="auth-error" role="alert"><p>{error}</p></div>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Шалгаж байна...' : 'Нэвтрэх'}</button>
        </form>
      </> : <>
        <h2 className="auth-section-title">OTP код оруулах</h2>
        <p className="auth-hint">+976 {phone.slice(0, 4)} {phone.slice(4)} дугаарт ирсэн 6 оронтой кодыг оруулна уу.</p>
        <form onSubmit={event => void submitCode(event)} noValidate aria-busy={busy}>
          <label className="auth-label" htmlFor="auth-otp">OTP код</label>
          <input ref={codeRef} className="auth-pin-input" id="auth-otp" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} disabled={busy} maxLength={6} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} placeholder="6 оронтой код" aria-describedby={error ? 'auth-error' : 'auth-otp-help'} />
          <p id="auth-otp-help" className="auth-field-help">Код 5 минут хүчинтэй. Амжилттай баталгаажмагц энэ төхөөрөмж 90 хоногийн хугацаанд OTP дахин шаардахгүй.</p>
          {error && <div id="auth-error" className="auth-error" role="alert"><p>{error}</p></div>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Шалгаж байна...' : 'Нэвтрэх →'}</button>
        </form>
        <div className="auth-switch" role="group" aria-label="OTP үйлдэл">
          <button type="button" disabled={busy} onClick={changePhone}>Дугаар солих</button>
          <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void sendOtp()}>{resendSeconds > 0 ? `Дахин код авах (${resendSeconds})` : 'Дахин код авах'}</button>
        </div>
      </>}
    </section>
  </main>
}
