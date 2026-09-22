'use client'
import { createRequestSignal } from '@/lib/client/request-signal'
import { OrderVideoCall } from '../components/order-video-call'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useScreenHistory } from '@/lib/client/use-screen-history'
import { backInApp } from '@/lib/client/navigation'
import { clearBookingDraft, currentOrderId, readBookingDraft, saveBookingDraft } from '@/lib/client/booking-draft'
import { OfferMap } from '../components/offer-map'
import { DriverSummary } from '../components/driver-summary'
import { DriverSlot, mapOffers, offerSnapshot, PickupPoint, pickupPoint, remainingSeconds } from '@/lib/order-offers'

export default function DriversPage() {
  const router = useRouter()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [pickup, setPickup] = useState<PickupPoint | null>(null)
  const [slots, setSlots] = useState<DriverSlot[]>([])
  const [invitedCount, setInvitedCount] = useState<number | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [serverExpired, setServerExpired] = useState(false)
  const navigation = useScreenHistory('offers', 'map', (value): value is string => value === 'map' || /^[a-zA-Z0-9-]{1,80}$/.test(value))
  const selectedDriverId = navigation.screen === 'map' ? null : navigation.screen
  const setSelectedDriverId = (id: string | null) => { if (id) navigation.navigate(id); else navigation.close() }
  const [confirmed, setConfirmed] = useState(false)
  const [finished, setFinished] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [alertsBusy, setAlertsBusy] = useState(false)
  const [alertsMessage, setAlertsMessage] = useState('')
  const audioContext = useRef<AudioContext | null>(null)
  const alertsActive = useRef(false)
  const actionPending = useRef(false)
  const expired = serverExpired || secondsLeft === 0
  const offers = useMemo(() => expired ? [] : mapOffers(slots), [slots, expired])
  const selected = offers.find(slot => slot.driver_id === selectedDriverId)

  useEffect(() => {
    const id = currentOrderId()
    if (!id) { router.replace('/current'); return }
    setOrderId(id)
    try {
      setPickup(pickupPoint(localStorage.getItem('fromLat'), localStorage.getItem('fromLng')))
    } catch { setPickup(readBookingDraft()?.location || null) }
  }, [router])

  useEffect(() => {
    const tick = () => setSecondsLeft(remainingSeconds(expiresAt))
    tick()
    if (!expiresAt) return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  useEffect(() => () => { void audioContext.current?.close().catch(() => {}) }, [])

  const playOfferAlert = useCallback(async () => {
    if (!alertsActive.current) return
    if (typeof navigator.vibrate === 'function') navigator.vibrate([250, 120, 250])
    const ctx = audioContext.current
    if (!ctx) return
    try {
      if (ctx.state === 'suspended') await ctx.resume()
      if (!alertsActive.current || ctx.state !== 'running') return
      const now = ctx.currentTime
      for (const [index, frequency] of [880, 1040].entries()) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0.0001, now + index * .2)
        gain.gain.exponentialRampToValueAtTime(.18, now + index * .2 + .02)
        gain.gain.exponentialRampToValueAtTime(.0001, now + index * .2 + .17)
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        oscillator.start(now + index * .2)
        oscillator.stop(now + index * .2 + .18)
      }
    } catch { setAlertsMessage('Дуу тоглосонгүй. Дууны тохиргоогоо шалгаарай.') }
  }, [])

  const toggleAlerts = async () => {
    if (alertsBusy) return
    if (alertsActive.current) {
      alertsActive.current = false
      setAlertsEnabled(false)
      setAlertsMessage('')
      return
    }
    setAlertsBusy(true)
    setAlertsMessage('')
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) throw new Error('Audio unsupported')
      audioContext.current ??= new Ctx()
      if (audioContext.current.state === 'suspended') await audioContext.current.resume()
      if (audioContext.current.state !== 'running') throw new Error('Audio not enabled')
      alertsActive.current = true
      setAlertsEnabled(true)
      await playOfferAlert()
      if (typeof navigator.vibrate !== 'function') setAlertsMessage('Дуу асаалттай. Энэ browser чичиргээ дэмжихгүй.')
    } catch { setAlertsMessage('Дууг асааж чадсангүй. Дахин дарж оролдоно уу.') }
    finally { setAlertsBusy(false) }
  }

  useEffect(() => {
    if (!orderId) return
    let cancelled = false, pending = false
    let controller: AbortController | undefined
    let seen: Set<string> | null = null
    let stopped = false
    const poll = async () => {
      if (cancelled || pending) return
      pending = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 12_000)
      try {
        const response = await fetch('/api/order/slots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }), cache: 'no-store', signal: controller.signal })
        if (cancelled) return
        if (response.status === 401) { router.replace('/start'); return }
        if (response.status === 404) { router.replace('/current'); return }
        if (!response.ok) throw new Error('Request failed')
        const body = await response.json()
        if (cancelled) return
        if (body.order_status && body.order_status !== 'pending') {
          stopped = true
          setConfirmed(body.order_status === 'confirmed')
          const ended = ['completed', 'cancelled'].includes(body.order_status)
          stopped = ended
          setFinished(ended)
          if (ended) clearBookingDraft()
          if (body.pickup) setPickup(pickupPoint(body.pickup.lat, body.pickup.lng))
          setSlots(Array.isArray(body.slots) ? body.slots : [])
          setExpiresAt(null); setSecondsLeft(null); setServerExpired(false); setError('')
          return
        }
        const next: DriverSlot[] = Array.isArray(body.slots) ? body.slots : []
        if (body.pickup) setPickup(pickupPoint(body.pickup.lat, body.pickup.lng))
        setExpiresAt(body.bidding_expires_at || null)
        setServerExpired(Boolean(body.expired))
        setInvitedCount(Number(body.invited_count || 0))
        stopped = Boolean(body.expired)
        const snapshot = offerSnapshot(seen, next)
        seen = snapshot.seen
        if (snapshot.hasNew && !body.expired) void playOfferAlert()
        setSlots(next)
        setError('')
      } catch {
        if (!cancelled) setError('Холболт тасарлаа. Үнийн саналыг дахин шалгаж байна…')
      } finally { clearTimeout(timeout); pending = false }
    }
    void poll()
    const timer = setInterval(() => { if (!stopped && document.visibilityState === 'visible') void poll() }, 4000)
    const onVisible = () => { if (document.visibilityState === 'visible') void poll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [orderId, router, playOfferAlert])

  const acceptOffer = async () => {
    if (confirmed) { router.push('/tracking'); return }
    if (!orderId || !selected?.offer || expired || actionPending.current) return
    actionPending.current = true
    setAccepting(true)
    setError('')
    const deadline = createRequestSignal(15_000)
    try {
      const response = await fetch('/api/order/accept-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, offer_id: selected.offer.id }), signal: deadline.signal })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setError(body.error || 'Энэ саналыг сонгох боломжгүй болсон байна.'); setSelectedDriverId(null); return }
      try { localStorage.setItem('tracking_driver_id', selected.driver_id) } catch {}
      router.push('/tracking')
    } catch { setError('Сонголтыг баталгаажуулж чадсангүй. Холболтоо шалгана уу.') }
    finally { deadline.dispose(); actionPending.current = false; setAccepting(false) }
  }

  const retrySearch = async () => {
    if (!orderId || actionPending.current) return
    actionPending.current = true
    setRetrying(true)
    setError('')
    const deadline = createRequestSignal(15_000)
    try {
      const response = await fetch('/api/order/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }), signal: deadline.signal })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.order?.id) { setError(body.error || 'Дахин хайлт эхлүүлж чадсангүй.'); return }
      try { localStorage.setItem('current_order_id', body.order.id) } catch {}
      const draft = readBookingDraft()
      if (draft) saveBookingDraft({ ...draft, orderId: body.order.id })
      setOrderId(body.order.id)
      setSlots([])
      setInvitedCount(null)
      setSelectedDriverId(null)
      setServerExpired(false)
      setExpiresAt(body.bidding_expires_at || null)
      setSecondsLeft(remainingSeconds(body.bidding_expires_at || null))
    } catch { setError('Холболтоо шалгаад дахин оролдоно уу.') }
    finally { deadline.dispose(); actionPending.current = false; setRetrying(false) }
  }

  const clock = secondsLeft == null ? '--:--' : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  return <main className="offers-map-page">
    <OfferMap pickup={pickup} offers={offers} selectedDriverId={selectedDriverId} onSelect={id => { if (!actionPending.current) setSelectedDriverId(id) }} />
    <header className="offers-map-header">
      {confirmed && !finished && orderId && <OrderVideoCall key={orderId} orderId={orderId} role="customer" />}
      <div className="offers-status-bar">
        <button type="button" className="offers-back" onClick={() => { if (!navigation.back()) backInApp(router, '/current') }}>← Буцах</button>
        <h1 aria-live="polite">{finished ? 'Захиалга дууссан' : confirmed ? 'Жолооч сонгогдсон' : expired ? 'Хайлтын хугацаа дууслаа' : invitedCount === 0 ? 'Бэлэн жолооч хайж байна' : 'Үнийн санал хүлээж байна'}</h1>
        {!confirmed && !finished && <time className="offers-countdown" aria-label={`Үлдсэн хугацаа ${clock}`}>{clock}</time>}
      </div>
      {!confirmed && !finished && <button type="button" className="offers-alerts" aria-pressed={alertsEnabled} onClick={() => void toggleAlerts()} disabled={alertsBusy}>
        {alertsBusy ? 'Дууг асааж байна…' : alertsEnabled ? '🔔 Дуу + чичиргээ асаалттай' : '🔔 Үнэ ирэхэд дуу + чичиргээ асаах'}
      </button>}
      {alertsMessage && <p className="offers-inline-message" role="status">{alertsMessage}</p>}
      {!confirmed && !finished && !expired && invitedCount === 0 && <p className="offers-inline-message" role="status">Сонгосон төрлийн бэлэн жолооч одоогоор алга. Хугацаа дуусахаас өмнө жолооч бэлэн болбол захиалгыг автоматаар илгээнэ.</p>}
      {error && <p className="offers-inline-message offers-error" role="alert">{error}</p>}
    </header>

    {selected?.offer && !expired && <section className="offer-selection" aria-label="Сонгосон жолоочийн санал">
      <button type="button" className="offer-selection-close" aria-label="Саналыг хаах" onClick={() => setSelectedDriverId(null)} disabled={accepting}>×</button>
      <DriverSummary name={selected.driver_name} photo={selected.photo_url} plate={selected.car_number} carType={selected.car_type} price={selected.offer.price} distance={selected.distance_km} />
      <button type="button" className="offer-select-button" disabled={accepting} onClick={() => void acceptOffer()}>{accepting ? 'Сонгож байна…' : confirmed ? 'Сонгосон жолоочтой холбогдох' : 'Жолооч сонгох'}</button>
      <p className="offer-selection-note">{confirmed ? 'Таны сонголт баталгаажсан. Буцахад захиалга цуцлагдахгүй.' : 'Сонгосны дараа та хоёрын утасны дугаар харилцан харагдана.'}</p>
    </section>}

    {confirmed && !selected && <div className="offers-expired"><button type="button" className="offer-select-button" onClick={() => router.push('/tracking')}>Сонгосон жолоочтой холбогдох</button></div>}
    {finished && <div className="offers-expired"><button type="button" className="offer-select-button" onClick={() => router.replace('/current')}>Нүүр хуудас руу буцах</button></div>}
    {expired && <div className="offers-expired"><button type="button" className="offer-select-button" disabled={retrying} onClick={() => void retrySearch()}>{retrying ? 'Дахин хайж байна…' : 'Дахин машин хайх'}</button></div>}
  </main>
}
