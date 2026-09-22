'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SessionGate } from '../components/session-gate'

export default function HomePage() {
  return <SessionGate mode="customer"><HomeContent /></SessionGate>
}

function HomeContent() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [visible, setVisible] = useState(false)
  const [heroUrl, setHeroUrl] = useState('https://i.ibb.co/5WrSCdV3/Jun-4-2026-12-21-53-AM.png')
  const pressTimer = useRef<any>(null)
  const [, setTapCount] = useState(0)
  const tapTimer = useRef<any>(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 10000, enableHighAccuracy: true })
    }
    fetch('/api/customer/ui-settings', { cache: 'no-store' })
      .then(async r => r.ok ? r.json() : null)
      .then(body => { if (body?.hero_url) setHeroUrl(body.hero_url) })
      .catch(() => {})
    return () => clearTimeout(t)
  }, [])

  const handleLogoPress = () => { pressTimer.current = setTimeout(() => router.push('/driver'), 3000) }
  const logout = async () => {
    if (signingOut) return
    setSigningOut(true)
    setLogoutError('')
    try {
      const response = await fetch('/api/customer/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Logout failed')
      try { localStorage.removeItem('user') } catch { /* The cookie is the source of truth. */ }
      router.replace('/login')
    } catch {
      setLogoutError('Гарч чадсангүй. Холболтоо шалгаад дахин оролдоно уу.')
      setSigningOut(false)
    }
  }
  const handleLogoRelease = () => { if (pressTimer.current) clearTimeout(pressTimer.current) }
  const handleBadgeTap = () => {
    setTapCount(c => {
      const next = c + 1
      if (next >= 5) { router.push('/admin'); return 0 }
      if (tapTimer.current) clearTimeout(tapTimer.current)
      tapTimer.current = setTimeout(() => setTapCount(0), 1800)
      return next
    })
  }

  return (
    <main className="app-shell">
      <section className="home-hero">
        <div className="home-hero-image" style={{ backgroundImage: `url(${heroUrl})` }} />
        <div className="home-hero-shade" />
        <header className="home-header">
          <div className="brand-wrap">
            <button
              className="brand-mark"
              aria-label="Ачилт"
              onMouseDown={handleLogoPress}
              onMouseUp={handleLogoRelease}
              onMouseLeave={handleLogoRelease}
              onTouchStart={handleLogoPress}
              onTouchEnd={handleLogoRelease}
            >А</button>
            <div>
              <div className="brand-name">Ачилт</div>
              <div className="brand-sub">Тусламж ойрхон</div>
            </div>
          </div>
          <button className="availability-pill" onClick={handleBadgeTap}>
            <span className="availability-dot" />24/7
          </button>
        </header>

        <div className={`hero-copy ${visible ? 'is-visible' : ''}`}>
          <div className="eyebrow">АЧИЛТЫН ҮЙЛЧИЛГЭЭ</div>
          <h1>Ойр жолоочоо<br/>хурдан олоорой</h1>
          <p>Байршлаа сонгоно. Ойр байгаа жолооч нараас үнэ ирнэ. Та өөрөө сонгоно.</p>
        </div>
      </section>

      <section className={`home-panel ${visible ? 'is-visible' : ''}`}>
        <div className="quick-note">
          <div className="quick-note-icon">⚡</div>
          <div>
            <strong>3 алхмаар захиална</strong>
            <span>Байршил → Машин → Үнийн санал</span>
          </div>
        </div>

        <button className="primary-action" onClick={() => router.push('/current')}>
          <span className="action-icon">⌖</span>
          <span className="action-copy">
            <strong>Энэ байршлаас машин ачуулах</strong>
            <small>Таны одоо байгаа газрын GPS байршлыг ашиглана</small>
          </span>
          <span className="action-arrow">›</span>
        </button>

        <button className="secondary-action" onClick={() => router.push('/manual')}>
          <span className="action-icon secondary">⌕</span>
          <span className="action-copy">
            <strong>Өөр газраас машин ачуулах</strong>
            <small>Өөр газарт байгаа машины ачих байршлыг сонгоно</small>
          </span>
          <span className="action-arrow">›</span>
        </button>

        <div className="trust-grid">
          <div><b>8</b><span>ойр жолооч</span></div>
          <div><b>10 мин</b><span>үнийн санал</span></div>
          <div><b>24/7</b><span>үйлчилгээ</span></div>
        </div>

        <div className="helper-card">
          <span>🚛</span>
          <div><strong>Тавцан · Чирэгч · Аварийн тусламж</strong><small>Үнэ ирсний дараа жолоочоо өөрөө сонгоно.</small></div>
        </div>
        <button type="button" onClick={() => void logout()} disabled={signingOut} style={{ display: 'block', margin: '24px auto 0', padding: '10px 18px', border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, background: 'transparent', color: '#b5b5bd' }}>{signingOut ? 'Гарч байна...' : 'Бүртгэлээс гарах'}</button>
        {logoutError && <p role="alert" style={{ color: '#ff8178', textAlign: 'center', fontSize: 13 }}>{logoutError}</p>}
      </section>
    </main>
  )
}
