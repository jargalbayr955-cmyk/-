'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 14,
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 16,
  outline: 'none',
}

type DriverProfile = {
  id: string
  phone: string
  name?: string | null
  car_number?: string | null
}

export function DriverOnboardingGate() {
  const pathname = usePathname()
  const [driver, setDriver] = useState<DriverProfile | null>(null)
  const [required, setRequired] = useState(false)
  const [name, setName] = useState('')
  const [carNumber, setCarNumber] = useState('')
  const [newPin, setNewPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lastStoredSession = useRef<string | null>(null)
  const checking = useRef(false)

  const checkSession = useCallback(async () => {
    if (pathname === '/driver/app' || checking.current) return
    checking.current = true
    try {
      const res = await fetch('/api/driver/session', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) {
          setRequired(false)
          setDriver(null)
        }
        return
      }
      const body = await res.json().catch(() => null)
      const profile = body?.driver as DriverProfile | undefined
      const needsOnboarding = Boolean(body?.needsOnboarding)
      if (!profile?.id) return
      setDriver(profile)
      setRequired(needsOnboarding)
      if (needsOnboarding) {
        const existingName = String(profile.name || '').trim()
        setName(existingName === 'Шинэ жолооч' ? '' : existingName)
        setCarNumber(String(profile.car_number || '').trim())
      }
    } catch {
      // The underlying driver screen already handles offline/session errors.
    } finally {
      checking.current = false
    }
  }, [pathname])

  useEffect(() => {
    if (pathname === '/driver/app') return
    try { lastStoredSession.current = localStorage.getItem('driver_session') } catch {}
    void checkSession()

    const localWatcher = window.setInterval(() => {
      let current: string | null = null
      try { current = localStorage.getItem('driver_session') } catch {}
      if (current !== lastStoredSession.current) {
        lastStoredSession.current = current
        void checkSession()
      }
    }, 250)
    const loginFallback = window.setInterval(() => {
      if (!required && !driver) void checkSession()
    }, 3000)
    const onVisible = () => { if (document.visibilityState === 'visible') void checkSession() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(localWatcher)
      window.clearInterval(loginFallback)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkSession, driver, pathname, required])

  const save = async () => {
    const cleanName = name.trim()
    const cleanCarNumber = carNumber.trim()
    if (!cleanName) return setError('Нэрээ оруулна уу.')
    if (!cleanCarNumber) return setError('Машины улсын дугаараа оруулна уу.')
    if (!/^\d{6}$/.test(newPin)) return setError('Шинэ PIN 6 оронтой байна.')
    if (newPin === '000000') return setError('Шинэ PIN нь 000000-оос өөр байна.')

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/driver/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, car_number: cleanCarNumber, new_pin: newPin }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.driver) {
        setError(body.error || 'Бүртгэл хадгалагдсангүй. Дахин оролдоно уу.')
        return
      }
      try { localStorage.setItem('driver_session', JSON.stringify(body.driver)) } catch {}
      setRequired(false)
      window.location.replace('/driver')
    } catch {
      setError('Сүлжээний алдаа. Дахин оролдоно уу.')
    } finally {
      setSaving(false)
    }
  }

  if (!required || !driver || pathname === '/driver/app') return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: '#060608', overflowY: 'auto', color: '#fff' }}>
      <div style={{ width: 'min(100% - 32px, 430px)', margin: '0 auto', padding: '44px 0 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>🚛</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 850 }}>Бүртгэлээ дуусгах</h1>
          <p style={{ margin: '10px auto 0', color: 'rgba(255,255,255,0.58)', fontSize: 14, lineHeight: 1.55 }}>
            Админ таны утасны дугаарыг бүртгэсэн байна. Нэр, машины улсын дугаар, өөрийн шинэ PIN кодоо оруулна уу.
          </p>
        </div>

        <div style={{ padding: 14, borderRadius: 14, background: 'rgba(232,67,58,0.10)', border: '1px solid rgba(232,67,58,0.26)', marginBottom: 16 }}>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>БҮРТГЭЛТЭЙ УТАС</div>
          <strong style={{ display: 'block', marginTop: 4, fontSize: 18 }}>{driver.phone}</strong>
          <div style={{ color: '#ff9b95', fontSize: 12, marginTop: 6 }}>Анхны 000000 PIN-ийг одоо шинэ PIN-ээр солино.</div>
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '0 0 7px' }}>Нэр</label>
        <input
          value={name}
          onChange={event => setName(event.target.value.slice(0, 100))}
          placeholder="Жолоочийн нэр"
          autoComplete="name"
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '0 0 7px' }}>Машины улсын дугаар</label>
        <input
          value={carNumber}
          onChange={event => setCarNumber(event.target.value.slice(0, 30))}
          placeholder="Жишээ: 1234УБА"
          autoCapitalize="characters"
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '0 0 7px' }}>Шинэ PIN код</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={newPin}
          onChange={event => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6 оронтой шинэ PIN"
          autoComplete="new-password"
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 1.45, margin: '0 0 18px' }}>
          000000 кодыг дахин ашиглахгүй. Дараагийн удаа энэ шинэ PIN-ээр нэвтэрнэ.
        </p>

        {error && <p role="alert" style={{ color: '#ff7770', fontSize: 13, lineHeight: 1.45, margin: '0 0 12px' }}>⚠️ {error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{ width: '100%', border: 0, borderRadius: 14, padding: 16, background: saving ? 'rgba(232,67,58,0.48)' : '#e8433a', color: '#fff', fontSize: 16, fontWeight: 850, cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'Хадгалж байна…' : 'Бүртгэлээ дуусгах →'}
        </button>
      </div>
      <style>{`input::placeholder{color:rgba(255,255,255,0.28);}`}</style>
    </div>
  )
}
