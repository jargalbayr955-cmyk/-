'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useScreenHistory } from '@/lib/client/use-screen-history'
import { authenticateCustomer, AuthMode } from '@/lib/client/customer-auth'
import { clearCustomerBrowserState, notifyCustomerSessionChanged, phoneInput } from '@/lib/client/session'
import { SessionGate } from './session-gate'
import { BrandAccess } from './access-shortcuts'

export function CustomerAuth({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  return <SessionGate mode="guest"><AuthForm initialMode={initialMode} /></SessionGate>
}

function AuthForm({ initialMode }: { initialMode: AuthMode }) {
  const navigation = useScreenHistory('customer-auth', initialMode, (value): value is AuthMode => value === 'login' || value === 'register')
  const mode = navigation.screen
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [canLogin, setCanLogin] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const pending = useRef(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const isRegister = mode === 'register'

  useEffect(() => {
    try {
      if (sessionStorage.getItem('achilt_signed_out') === '1') {
        setSignedOut(true)
        sessionStorage.removeItem('achilt_signed_out')
      }
    } catch {}
  }, [])

  useEffect(() => {
    setPin(''); setConfirmPin(''); setShowPin(false); setError(''); setCanLogin(false)
  }, [mode])

  const switchMode = (next: AuthMode) => {
    if (pending.current) return
    navigation.navigate(next)
    setPin('')
    setConfirmPin('')
    setShowPin(false)
    setError('')
    setCanLogin(false)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending.current) return
    setError('')
    setCanLogin(false)
    if (!/^\d{8}$/.test(phone)) { setError('8 оронтой утасны дугаараа оруулна уу.'); phoneRef.current?.focus(); return }
    if (!/^\d{4,8}$/.test(pin)) { setError(isRegister ? 'Өөрийн 4–8 оронтой PIN кодыг сонгоно уу.' : 'Бүртгүүлэхдээ сонгосон 4–8 оронтой PIN кодоо оруулна уу.'); pinRef.current?.focus(); return }
    if (isRegister && pin !== confirmPin) { setError('Хоёр PIN таарахгүй байна. Дахин оруулна уу.'); confirmRef.current?.focus(); return }
    pending.current = true
    setBusy(true)
    const result = await authenticateCustomer(mode, phone, pin)
    if (result.ok) {
      clearCustomerBrowserState()
      notifyCustomerSessionChanged()
      window.location.replace('/current')
      return
    }
    setError(result.error)
    setCanLogin(result.canLogin === true)
    setBusy(false)
    pending.current = false
  }

  return <main className="auth-shell">
    <section className="auth-card" aria-labelledby="auth-title">
      <BrandAccess className="auth-brand-mark" />
      <p className="auth-eyebrow">АЧИЛТ • ТУСЛАМЖ ОЙРХОН</p>
      <h1 id="auth-title">Тавтай морил</h1>
      <p className="auth-intro">Байршлаа сонгоод, ойр жолооч нарын үнийн саналаас сонгоорой.</p>
      {signedOut && <p className="auth-success" role="status">Амжилттай гарлаа. Дахин нэвтрэх эсвэл шинээр бүртгүүлэх боломжтой.</p>}
      <div className="auth-switch" role="group" aria-label="Нэвтрэх эсвэл бүртгүүлэх">
        <button type="button" aria-pressed={!isRegister} disabled={busy} onClick={() => switchMode('login')}>Нэвтрэх</button>
        <button type="button" aria-pressed={isRegister} disabled={busy} onClick={() => switchMode('register')}>Бүртгүүлэх</button>
      </div>
      <h2 className="auth-section-title">{isRegister ? 'Шинэ бүртгэл үүсгэх' : 'Бүртгэлтэй дугаараараа нэвтрэх'}</h2>
      <p className="auth-hint">{isRegister ? 'Утасны дугаараа оруулаад өөрийн PIN кодыг сонгоно. SMS код шаардахгүй.' : 'Өөр утаснаас ч бүртгэлтэй дугаар, PIN-ээрээ орно. Дахин бүртгүүлэх шаардлагагүй.'}</p>
      <form onSubmit={event => void submit(event)} noValidate aria-busy={busy}>
        <label className="auth-label" htmlFor="auth-phone">Утасны дугаар</label>
        <div className="auth-phone-row">
          <span className="auth-country" aria-hidden="true">+976</span>
          <input ref={phoneRef} id="auth-phone" name="username" type="tel" inputMode="numeric" autoComplete="username" value={phone} disabled={busy} onChange={event => { setPhone(phoneInput(event.target.value)); setError(''); setCanLogin(false) }} placeholder="8 оронтой дугаар" aria-describedby={error ? 'auth-error' : undefined} />
        </div>
        <div className="auth-pin-label">
          <label className="auth-label" htmlFor="auth-pin">{isRegister ? 'PIN кодоо сонгох' : 'PIN код'}</label>
          <button type="button" className="auth-show-pin" aria-pressed={showPin} onClick={() => setShowPin(value => !value)}>{showPin ? 'PIN нуух' : 'PIN харах'}</button>
        </div>
        <input ref={pinRef} className="auth-pin-input" id="auth-pin" name="password" type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete={isRegister ? 'new-password' : 'current-password'} value={pin} disabled={busy} maxLength={8} onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 8)); setError('') }} placeholder="4–8 оронтой PIN" aria-describedby={error ? 'auth-error' : 'auth-pin-help'} />
        {isRegister && <>
          <label className="auth-label auth-confirm-label" htmlFor="auth-confirm-pin">PIN кодоо давтах</label>
          <input ref={confirmRef} className="auth-pin-input" id="auth-confirm-pin" name="confirmPassword" type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="new-password" value={confirmPin} disabled={busy} maxLength={8} onChange={event => { setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 8)); setError('') }} placeholder="Ижил PIN-ээ дахин оруулах" aria-describedby={error ? 'auth-error' : undefined} />
        </>}
        <p id="auth-pin-help" className="auth-field-help">{isRegister ? 'PIN кодоо санаарай. Дараа нь энэ кодоор нэвтэрнэ.' : 'PIN нь таны бүртгүүлэхдээ сонгосон тоон нууц код.'}</p>
        {error && <div id="auth-error" className="auth-error" role="alert"><p>{error}</p>{canLogin && <button type="button" onClick={() => switchMode('login')}>Нэвтрэх рүү шилжих →</button>}</div>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? (isRegister ? 'Бүртгэж байна...' : 'Нэвтэрч байна...') : (isRegister ? 'Бүртгүүлээд эхлэх →' : 'Нэвтрэх →')}</button>
      </form>
      <p className="auth-remember">Нэвтрэлт энэ төхөөрөмж дээр хадгалагдана. Бусдын төхөөрөмж ашигласан бол дуусмагц «Гарах» товчийг дараарай.</p>
    </section>
  </main>
}
