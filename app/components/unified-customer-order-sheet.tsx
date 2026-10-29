'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CustomerOrderSheet } from './customer-order-sheet'
import { type BookingScreen, readBookingDraft, saveBookingDraft } from '@/lib/client/booking-draft'
import { createRequestId } from '@/lib/client/request-id'
import { createRequestSignal } from '@/lib/client/request-signal'
import { readSelectedService } from '@/lib/client/service-selection'
import { serviceIcon, serviceLabel, type ServiceType } from '@/lib/service-types'

type Point = { lat: number; lng: number }
type Props = {
  screen: BookingScreen
  location: Point | null
  onNavigate: (screen: BookingScreen) => void
  onBack: () => boolean
  onClose: () => void
}

export function UnifiedCustomerOrderSheet(props: Props) {
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  useEffect(() => { setServiceType(readSelectedService() || 'achilt') }, [])
  if (!serviceType) return null
  if (serviceType === 'achilt') return <CustomerOrderSheet {...props} />
  return <NonTowServiceOrderSheet {...props} serviceType={serviceType} />
}

function NonTowServiceOrderSheet({ screen, location, onNavigate, onBack, onClose, serviceType }: Props & { serviceType: Exclude<ServiceType, 'achilt'> }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const detailRef = useRef<HTMLInputElement>(null)
  const requestPending = useRef(false)
  const bookingRequest = useRef<{ id: string; payload: string } | undefined>(undefined)
  const submittedLocation = useRef<Point | null>(null)
  const open = screen !== 'map'
  const editingDetail = screen === 'detail'
  const [extraAddress, setExtraAddress] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = readBookingDraft()
    if (saved) {
      setExtraAddress(saved.extraAddress || '')
      setOrderId(saved.orderId)
      bookingRequest.current = saved.request
      if (saved.orderId) submittedLocation.current = saved.location
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    saveBookingDraft({
      carType: '', dest: '', carMark: '', extraAddress,
      location: orderId ? submittedLocation.current : location,
      orderId, request: bookingRequest.current,
    })
  }, [ready, extraAddress, location, orderId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!open) { dialog.close(); return }
    dialog.showModal()
    return () => dialog.close()
  }, [open])

  const search = async () => {
    if (requestPending.current) return
    if (orderId) {
      try { localStorage.setItem('current_order_id', orderId) } catch {}
      router.push('/drivers')
      return
    }
    if (!location) {
      setError('Газрын зурагт буцаж үйлчилгээ авах байршлаа сонгоно уу.')
      return
    }

    const coords = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
    const fromAddress = extraAddress.trim() ? `${extraAddress.trim()} (${coords})` : `Газрын зураг дээр сонгосон цэг (${coords})`
    const details = {
      service_type: serviceType,
      from_address: fromAddress,
      from_lat: location.lat,
      from_lng: location.lng,
      car_type: null,
      to_address: '',
      car_mark: '',
    }
    const payload = JSON.stringify(details)
    if (bookingRequest.current?.payload !== payload) bookingRequest.current = { id: createRequestId(), payload }
    saveBookingDraft({ carType: '', dest: '', carMark: '', extraAddress, location, orderId: null, request: bookingRequest.current })

    requestPending.current = true
    setSubmitting(true)
    setError('')
    const deadline = createRequestSignal(20_000)
    let created = false
    try {
      try {
        localStorage.setItem('fromLat', String(location.lat))
        localStorage.setItem('fromLng', String(location.lng))
        localStorage.setItem('fromAddress', fromAddress)
        localStorage.removeItem('dest')
      } catch {}
      const response = await fetch('/api/order/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, request_id: bookingRequest.current.id }), signal: deadline.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.order?.id) {
        if (response.status === 401) { router.push('/start'); return }
        setError(body.error || 'Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.')
        return
      }
      submittedLocation.current = location
      setOrderId(body.order.id)
      saveBookingDraft({ carType: '', dest: '', carMark: '', extraAddress, location, orderId: body.order.id })
      try { localStorage.setItem('current_order_id', body.order.id) } catch {}
      created = true
      router.push('/drivers')
    } catch {
      setError('Холболтоо шалгаад дахин оролдоно уу.')
    } finally {
      deadline.dispose()
      if (!created) { requestPending.current = false; setSubmitting(false) }
    }
  }

  return <dialog ref={dialogRef} className="current-order-dialog" aria-labelledby="service-order-title"
    onCancel={event => { event.preventDefault(); if (!requestPending.current) onBack() }}
    onClick={event => { if (event.target === event.currentTarget && !requestPending.current) onClose() }}>
    <form className="current-order-sheet" noValidate onSubmit={event => { event.preventDefault(); if (editingDetail) onBack() }}>
      <div className="current-sheet-handle" />
      <div className="current-sheet-head">
        <div>
          <span className="current-sheet-kicker">ҮЙЛЧИЛГЭЭ</span>
          <h2 id="service-order-title">{serviceIcon(serviceType)} {serviceLabel(serviceType)}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={submitting} className="current-sheet-close" aria-label="Хаах">×</button>
      </div>
      <div className="current-sheet-scroll">
        <dl className="current-order-review">
          <div><dt>Үйлчилгээ</dt><dd><span>{serviceLabel(serviceType)}</span></dd></div>
          <div><dt>Байршил</dt><dd><span>{location ? 'Газрын зураг дээр сонгосон байршил' : 'Байршлаа сонгоно уу'}</span><button type="button" disabled={submitting} onClick={onClose}>Газрын зураг</button></dd></div>
        </dl>
        {editingDetail ? <div className="current-input-card">
          <label htmlFor="service-location-detail">БАЙРШЛЫН ТАЙЛБАР · ЗААВАЛ БИШ</label>
          <div className="current-entry-row">
            <input ref={detailRef} id="service-location-detail" value={extraAddress} readOnly={Boolean(orderId)} maxLength={350} enterKeyHint="done"
              onChange={event => setExtraAddress(event.target.value)} placeholder="Байр, орц, объект, ойролцоох газар" />
            {extraAddress.trim() && <button className="current-inline-done" type="submit">Болсон</button>}
          </div>
        </div> : <button className="current-detail-toggle" type="button" disabled={submitting || Boolean(orderId)} onClick={() => {
          onNavigate('detail')
          setTimeout(() => detailRef.current?.focus({ preventScroll: true }), 0)
        }}>{extraAddress.trim() ? `Байршлын тайлбар: ${extraAddress.trim()}` : '+ Байршлын тайлбар нэмэх (заавал биш)'}</button>}
        <p className="current-order-hint">Таны сонгосон үйлчилгээний төрөлтэй, ойр байгаа жолооч нараас үнийн санал авна.</p>
        {error && <p className="current-field-error" role="alert">{error}</p>}
      </div>
      <div className="current-sheet-footer">
        <button type="button" className="current-step-back" disabled={submitting} onClick={() => { if (!onBack()) onClose() }}>← Газрын зураг</button>
        {!editingDetail && <button type="button" className="current-final-search" disabled={submitting} onClick={() => void search()}>
          {submitting ? 'Илгээж байна…' : orderId ? 'Үнийн санал руу →' : 'Жолооч хайх →'}
        </button>}
      </div>
    </form>
  </dialog>
}
