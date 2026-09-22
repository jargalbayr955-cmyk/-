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
    // Opening or reopening the sheet must not summon the keyboard by itself.
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
    // Commit the next input before focusing it, while still in the tap/Enter event.
    // This also keeps iOS keyboard focus from depending on a delayed effect.
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
      } catch { /* The booking draft also has an in-memory fallback. */ }
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
      // Keep the button locked while a successful order opens its waiting map.
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
              <span className="current-car-icon" aria-hidden="true">{type.icon}</span>
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
