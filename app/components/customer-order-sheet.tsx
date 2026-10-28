'use client'

import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { BookingScreen, readBookingDraft, saveBookingDraft } from '@/lib/client/booking-draft'
import { createRequestId } from '@/lib/client/request-id'
import { createRequestSignal } from '@/lib/client/request-signal'

type Point = { lat: number; lng: number }
type Step = 0 | 1 | 2 | 3
type Props = { screen: BookingScreen; location: Point | null; onNavigate: (screen: BookingScreen) => void; onBack: () => boolean; onClose: () => void }

const vehicles = [
  { id: 'butten', label: 'Бүтэн ачигч', icon: '🚛', desc: 'Тэвш дээр бүтнээр нь ачна' },
  { id: 'chiregch', label: 'Чирэгч', icon: '🔧', desc: 'Дугуйнаас чирж тээвэрлэнэ' },
]

function VehicleArt({ type }: { type: string }) {
  if (type === 'butten') {
    return <svg viewBox="0 0 180 96" width="118" height="72" role="img" aria-label="Бүтэн ачигч машин">
      <defs>
        <linearGradient id="flatbed-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd0ff"/><stop offset="1" stopColor="#e7f5ff"/></linearGradient>
        <linearGradient id="flatbed-road" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#66717a"/><stop offset="1" stopColor="#3d454d"/></linearGradient>
      </defs>
      <rect width="180" height="96" rx="14" fill="url(#flatbed-sky)"/>
      <rect y="69" width="180" height="27" fill="url(#flatbed-road)"/>
      <path d="M12 38h42l11 14h16v23H9V52l3-14Z" fill="#f9fbfd" stroke="#29323b" strokeWidth="2"/>
      <path d="M19 42h29l8 10H17Z" fill="#bfe8ff"/>
      <rect x="56" y="57" width="98" height="8" rx="3" fill="#f3b323" stroke="#252b31" strokeWidth="2"/>
      <rect x="60" y="65" width="94" height="6" rx="2" fill="#20262c"/>
      <circle cx="31" cy="75" r="10" fill="#151a1f"/><circle cx="31" cy="75" r="4" fill="#aeb7bf"/>
      <circle cx="133" cy="75" r="10" fill="#151a1f"/><circle cx="133" cy="75" r="4" fill="#aeb7bf"/>
      <path d="M88 35h43l13 12v11H78l4-14 6-9Z" fill="#111820" stroke="#05080b" strokeWidth="2"/>
      <path d="M95 37h31l8 9H88Z" fill="#26394b"/>
      <circle cx="92" cy="58" r="7" fill="#090c0f"/><circle cx="133" cy="58" r="7" fill="#090c0f"/>
      <rect x="19" y="33" width="24" height="4" rx="2" fill="#ff8b1a"/>
      <path d="M6 84h168" stroke="#f7f7f7" strokeWidth="3" strokeDasharray="18 12" opacity=".8"/>
    </svg>
  }

  return <svg viewBox="0 0 180 96" width="118" height="72" role="img" aria-label="Чирэгч машин">
    <defs>
      <linearGradient id="tow-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9cd7ff"/><stop offset="1" stopColor="#eef8ff"/></linearGradient>
      <linearGradient id="tow-road" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6d747b"/><stop offset="1" stopColor="#43494f"/></linearGradient>
    </defs>
    <rect width="180" height="96" rx="14" fill="url(#tow-sky)"/>
    <rect y="69" width="180" height="27" fill="url(#tow-road)"/>
    <path d="M8 39h43l10 13h15v23H7V52l1-13Z" fill="#f9fbfd" stroke="#29323b" strokeWidth="2"/>
    <path d="M16 43h29l8 9H14Z" fill="#c4eaff"/>
    <rect x="20" y="34" width="23" height="4" rx="2" fill="#ff8b1a"/>
    <circle cx="28" cy="75" r="10" fill="#151a1f"/><circle cx="28" cy="75" r="4" fill="#aeb7bf"/>
    <circle cx="67" cy="75" r="10" fill="#151a1f"/><circle cx="67" cy="75" r="4" fill="#aeb7bf"/>
    <path d="M68 59h19l10 7" fill="none" stroke="#181d22" strokeWidth="7" strokeLinecap="round"/>
    <path d="M83 44v18" stroke="#181d22" strokeWidth="6" strokeLinecap="round"/>
    <path d="M82 45l11-9" stroke="#181d22" strokeWidth="6" strokeLinecap="round"/>
    <path d="M96 65h17" stroke="#23292f" strokeWidth="5" strokeLinecap="round"/>
    <path d="M116 48h42l12 12v13h-67v-9l6-10 7-6Z" fill="#111820" stroke="#05080b" strokeWidth="2"/>
    <path d="M122 50h31l8 9h-46Z" fill="#26394b"/>
    <circle cx="121" cy="73" r="8" fill="#090c0f"/><circle cx="158" cy="73" r="8" fill="#090c0f"/>
    <path d="M103 67h16" stroke="#f0a928" strokeWidth="4" strokeLinecap="round"/>
    <path d="M6 84h168" stroke="#f7f7f7" strokeWidth="3" strokeDasharray="18 12" opacity=".8"/>
  </svg>
}

const titles = ['Ямар машин хэрэгтэй вэ?', 'Хаашаа хүргүүлэх вэ?', 'Ямар машин ачуулах вэ?', 'Захиалгаа шалгаарай']

export function CustomerOrderSheet({ screen, location, onNavigate, onBack, onClose }: Props) {
  const open = screen !== 'map'
  const editingDetail = screen === 'detail'
  const editing = screen.startsWith('edit-')
  const step: Step = screen.endsWith('vehicle') ? 0 : screen.endsWith('destination') ? 1 : screen.endsWith('car') ? 2 : 3
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const destinationRef = useRef<HTMLInputElement>(null)
  const carMarkRef = useRef<HTMLInputElement>(null)
  const detailRef = useRef<HTMLInputElement>(null)
  const requestPending = useRef(false)
  const bookingRequest = useRef<{ id: string; payload: string } | undefined>(undefined)
  const submittedLocation = useRef<Point | null>(null)
  const [carType, setCarType] = useState('')
  const [dest, setDest] = useState('')
  const [carMark, setCarMark] = useState('')
  const [extraAddress, setExtraAddress] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const saved = readBookingDraft()
    if (saved) {
      bookingRequest.current = saved.request
      if (saved.orderId) submittedLocation.current = saved.location
      setCarType(saved.carType); setDest(saved.dest); setCarMark(saved.carMark); setExtraAddress(saved.extraAddress); setOrderId(saved.orderId)
    }
    setDraftReady(true)
    const restore = () => {
      if (window.location.pathname === '/current' && readBookingDraft()?.orderId) { requestPending.current = false; setSubmitting(false) }
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  useEffect(() => {
    if (draftReady) saveBookingDraft({ carType, dest, carMark, extraAddress, location: orderId ? submittedLocation.current : location, orderId, request: bookingRequest.current })
  }, [carType, dest, carMark, extraAddress, location, orderId, draftReady])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!open) { dialog.close(); return }
    dialog.showModal()
    headingRef.current?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    const fitViewport = () => {
      dialog.style.setProperty('--order-visible-height', `${viewport?.height ?? window.innerHeight}px`)
      dialog.style.setProperty('--order-visible-top', `${viewport?.offsetTop ?? 0}px`)
    }
    fitViewport()
    viewport?.addEventListener('resize', fitViewport)
    viewport?.addEventListener('scroll', fitViewport)
    window.addEventListener('resize', fitViewport)
    return () => {
      viewport?.removeEventListener('resize', fitViewport)
      viewport?.removeEventListener('scroll', fitViewport)
      window.removeEventListener('resize', fitViewport)
      dialog.close()
    }
  }, [open])

  function close() {
    if (requestPending.current) return
    onClose()
  }

  function goTo(next: Step, editing = false) {
    if (requestPending.current) return
    flushSync(() => { onNavigate((editing ? 'edit-' : '') + ['vehicle', 'destination', 'car', 'review'][next] as BookingScreen); setError('') })
    const target = next === 1 ? destinationRef.current : next === 2 ? carMarkRef.current : headingRef.current
    target?.focus({ preventScroll: true })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function done() {
    if (step === 1 && !dest.trim()) {
      setError('Хүрэх газраа оруулна уу.')
      destinationRef.current?.focus()
      return
    }
    if (step === 2 && !carMark.trim()) {
      setError('Ачуулах машины марк, нэрийг оруулна уу.')
      carMarkRef.current?.focus()
      return
    }
    if (step !== 1 && step !== 2) return
    if (editing) { onBack(); return }
    goTo((step + 1) as Step)
  }

  function finishDetail() {
    onBack()
    headingRef.current?.focus({ preventScroll: true })
  }

  async function handleSearch() {
    if (requestPending.current) return
    if (orderId) { try { localStorage.setItem('current_order_id', orderId) } catch {}; router.push('/drivers'); return }
    if (!carType) { goTo(0); return }
    if (!dest.trim()) { goTo(1); return }
    if (!carMark.trim()) { goTo(2); return }
    if (!location) { setError('Газрын зурагт буцаж ачих цэгээ сонгоно уу. Бичсэн мэдээлэл хадгалагдана.'); return }

    const coords = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
    const fromAddress = extraAddress.trim() ? `${extraAddress.trim()} (${coords})` : `Газрын зураг дээр сонгосон цэг (${coords})`
    requestPending.current = true
    setSubmitting(true)
    setError('')
    let created = false
    const deadline = createRequestSignal(20_000)
    try {
      try {
        localStorage.setItem('fromLat', String(location.lat))
        localStorage.setItem('fromLng', String(location.lng))
        localStorage.setItem('fromAddress', fromAddress)
        localStorage.setItem('dest', dest.trim())
      } catch { }
      const details = { from_address: fromAddress, to_address: dest.trim(), from_lat: location.lat, from_lng: location.lng, car_type: carType, car_mark: carMark.trim() }
      const payload = JSON.stringify(details)
      if (bookingRequest.current?.payload !== payload) bookingRequest.current = { id: createRequestId(), payload }
      saveBookingDraft({ carType, dest, carMark, extraAddress, location, orderId: null, request: bookingRequest.current })
      const response = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, request_id: bookingRequest.current.id }), signal: deadline.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.order?.id) {
        if (response.status === 401) { router.push('/login'); return }
        setError(body.error || 'Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.')
        return
      }
      try { localStorage.setItem('current_order_id', body.order.id) } catch {}
      submittedLocation.current = location
      saveBookingDraft({ carType, dest, carMark, extraAddress, location, orderId: body.order.id })
      setOrderId(body.order.id)
      created = true
      router.push('/drivers')
    } catch {
      setError('Холболтоо шалгаад дахин оролдоно уу.')
    } finally {
      deadline.dispose()
      if (!created) { requestPending.current = false; setSubmitting(false) }
    }
  }

  return (
    <dialog ref={dialogRef} className="current-order-dialog" aria-labelledby="order-step-title"
      onCancel={(event) => { event.preventDefault(); if (!requestPending.current) onBack() }}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <form className="current-order-sheet" noValidate onSubmit={(event) => {
        event.preventDefault()
        if (step < 3) done()
        else if (editingDetail) finishDetail()
      }} onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
      }}>
        <div className="current-sheet-handle" />
        <div className="current-sheet-head">
          <div>
            <span className="current-sheet-kicker">{step < 3 ? `АЛХАМ ${step + 1} / 3` : 'БАТАЛГААЖУУЛАХ'}</span>
            <h2 id="order-step-title" ref={headingRef} tabIndex={-1}>{titles[step]}</h2>
          </div>
          <button type="button" onClick={close} disabled={submitting} className="current-sheet-close" aria-label="Хаах">×</button>
        </div>
        <div className="current-step-progress" aria-hidden="true">
          {[0, 1, 2].map(index => <span key={index} className={step >= index ? 'is-complete' : ''} />)}
        </div>

        <div ref={scrollRef} className="current-sheet-scroll">
          {step === 0 && <div className="current-car-grid">
            {vehicles.map(type => <button key={type.id} type="button" aria-pressed={carType === type.id}
              disabled={Boolean(orderId && carType !== type.id)} className={`current-car-option ${carType === type.id ? 'is-selected' : ''}`}
              onClick={() => {
                if (orderId && carType !== type.id) return
                setCarType(type.id)
                if (editing) onBack()
                else goTo(1)
              }}>
              <span className="current-car-icon" aria-hidden="true" style={{ width: 118, height: 72, flex: '0 0 auto', display: 'block', overflow: 'hidden', borderRadius: 14, boxShadow: '0 6px 18px rgba(0,0,0,.28)' }}><VehicleArt type={type.id} /></span>
              <span className="current-car-copy"><strong>{type.label}</strong><small>{type.desc}</small></span>
              <span aria-hidden="true">→</span>
            </button>)}
          </div>}

          {step === 1 && <div className={`current-input-card ${error ? 'has-error' : ''}`}>
            <label htmlFor="destination">ХҮРЭХ ГАЗАР</label>
            <div className="current-entry-row">
              <input ref={destinationRef} id="destination" readOnly={Boolean(orderId)} value={dest} maxLength={500} enterKeyHint="done"
                aria-invalid={Boolean(error)} aria-describedby={error ? 'order-form-error' : undefined}
                onChange={event => { setDest(event.target.value); setError('') }}
                placeholder="Жишээ: 3-р хороолол, засварын газар" autoComplete="street-address" />
              {dest.trim() && <button className="current-inline-done" type="submit">Болсон</button>}
            </div>
          </div>}

          {step === 2 && <div className={`current-input-card ${error ? 'has-error' : ''}`}>
            <label htmlFor="car-mark">АЧУУЛАХ МАШИНЫ МАРК, НЭР</label>
            <div className="current-entry-row">
              <input ref={carMarkRef} id="car-mark" readOnly={Boolean(orderId)} value={carMark} maxLength={120} enterKeyHint="done"
                aria-invalid={Boolean(error)} aria-describedby={error ? 'order-form-error' : undefined}
                onChange={event => { setCarMark(event.target.value); setError('') }} placeholder="Жишээ: Toyota Prius" />
              {carMark.trim() && <button className="current-inline-done" type="submit">Болсон</button>}
            </div>
          </div>}

          {step === 3 && <>
            <dl className="current-order-review">
              <div><dt>Ачих цэг</dt><dd><span>{orderId ? 'Захиалгад илгээсэн ачуулах байршил' : location ? 'Газрын зураг дээр сонгосон байршил' : 'Байршлаа сонгоно уу'}</span><button type="button" disabled={submitting} onClick={close}>Газрын зураг</button></dd></div>
              <div><dt>Машины төрөл</dt><dd><span>{vehicles.find(type => type.id === carType)?.label}</span><button type="button" disabled={submitting || Boolean(orderId)} onClick={() => goTo(0, true)} aria-label="Машины төрөл засах">Засах</button></dd></div>
              <div><dt>Хүрэх газар</dt><dd><span>{dest.trim()}</span><button type="button" disabled={submitting || Boolean(orderId)} onClick={() => goTo(1, true)} aria-label="Хүрэх газар засах">Засах</button></dd></div>
              <div><dt>Ачуулах машин</dt><dd><span>{carMark.trim()}</span><button type="button" disabled={submitting || Boolean(orderId)} onClick={() => goTo(2, true)} aria-label="Машины марк засах">Засах</button></dd></div>
            </dl>
            {editingDetail ? <div className="current-input-card">
              <label htmlFor="pickup-detail">АЧИХ ЦЭГИЙН ТАЙЛБАР · ЗААВАЛ БИШ</label>
              <div className="current-entry-row">
                <input id="pickup-detail" readOnly={Boolean(orderId)} ref={detailRef} value={extraAddress} maxLength={350} enterKeyHint="done"
                  onChange={event => setExtraAddress(event.target.value)} placeholder="Байр, орц, ойролцоох газар" />
                {extraAddress.trim() && <button className="current-inline-done" type="submit">Болсон</button>}
              </div>
            </div> : <button className="current-detail-toggle" type="button" disabled={submitting} onClick={() => {
              flushSync(() => onNavigate('detail'))
              detailRef.current?.focus({ preventScroll: true })
            }}>{extraAddress.trim() ? `Ачих цэгийн тайлбар: ${extraAddress.trim()}` : '+ Ачих цэгийн тайлбар нэмэх (заавал биш)'}</button>}
            <p className="current-order-hint">{orderId ? 'Захиалга илгээгдсэн. Буцах нь захиалгыг цуцлахгүй. Үнийн саналаа үргэлжлүүлэн харж болно.' : 'Жолооч нараас үнийн санал авна. Дараа нь та жолоочоо сонгоно.'}</p>
          </>}
          {error && <p id="order-form-error" className="current-field-error" role="alert">{error}</p>}
        </div>

        <div className="current-sheet-footer">
          <button type="button" className="current-step-back" disabled={submitting} onClick={() => {
            if (!onBack()) close()
          }}>← {step === 0 ? 'Газрын зураг' : 'Буцах'}</button>
          {step === 3 && !editingDetail && <button type="button" className="current-final-search" disabled={submitting} onClick={handleSearch}>
            {submitting ? 'Илгээж байна…' : orderId ? 'Үнийн санал руу →' : 'Жолооч хайх →'}
          </button>}
          {step === 0 && <span className="current-order-hint">Төрлөө дарж сонгоно уу</span>}
        </div>
      </form>
    </dialog>
  )
}
