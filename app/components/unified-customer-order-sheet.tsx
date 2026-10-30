'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CustomerOrderSheet } from './customer-order-sheet'
import { ServiceTypePicker } from './service-type-picker'
import { type BookingScreen, readBookingDraft, saveBookingDraft } from '@/lib/client/booking-draft'
import { createRequestId } from '@/lib/client/request-id'
import { createRequestSignal } from '@/lib/client/request-signal'
import { readSelectedService, saveSelectedService } from '@/lib/client/service-selection'
import {
  normalizeServiceDetails,
  serviceDetailEntries,
  serviceDetailFields,
  serviceIcon,
  serviceLabel,
  type NonTowServiceType,
  type ServiceType,
} from '@/lib/service-types'

type Point = { lat: number; lng: number }
type Props = {
  screen: BookingScreen
  location: Point | null
  onNavigate: (screen: BookingScreen) => void
  onBack: () => boolean
  onClose: () => void
}

const emptyDraft = (location: Point | null) => ({
  carType: '', dest: '', carMark: '', extraAddress: '', serviceDetails: {}, location, orderId: null,
})

export function UnifiedCustomerOrderSheet(props: Props) {
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  useEffect(() => { setServiceType(readSelectedService()) }, [])

  if (props.screen === 'service') {
    return <ServiceChoiceSheet {...props} value={serviceType} onChoose={service => {
      saveSelectedService(service)
      setServiceType(service)
      saveBookingDraft(emptyDraft(props.location))
      props.onNavigate(service === 'achilt' ? 'vehicle' : 'service-details')
    }} />
  }
  if (!serviceType) return null
  if (serviceType === 'achilt') return <CustomerOrderSheet {...props} />
  return <NonTowServiceOrderSheet {...props} serviceType={serviceType} />
}

function ServiceChoiceSheet({ screen, location, onBack, onClose, value, onChoose }: Props & {
  value: ServiceType | null
  onChoose: (service: ServiceType) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const open = screen === 'service'
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!open) { dialog.close(); return }
    dialog.showModal()
    return () => dialog.close()
  }, [open])

  return <dialog ref={dialogRef} className="current-order-dialog" aria-labelledby="service-choice-title"
    onCancel={event => { event.preventDefault(); onBack() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="current-order-sheet">
      <div className="current-sheet-handle" />
      <div className="current-sheet-head">
        <div><span className="current-sheet-kicker">ҮЙЛЧИЛГЭЭ СОНГОХ</span><h2 id="service-choice-title">Ямар үйлчилгээ хэрэгтэй вэ?</h2></div>
        <button type="button" onClick={onClose} className="current-sheet-close" aria-label="Хаах">×</button>
      </div>
      <div className="current-sheet-scroll">
        <p className="current-order-hint" style={{marginTop:0}}>📍 {location ? 'Сонгосон байршилд' : 'Байршлаа сонгосны дараа'} тохирох жолооч нараас үнийн санал авна.</p>
        <ServiceTypePicker value={value} onChange={onChoose} />
      </div>
      <div className="current-sheet-footer">
        <button type="button" className="current-step-back" onClick={() => { if (!onBack()) onClose() }}>← Газрын зураг</button>
      </div>
    </div>
  </dialog>
}

function NonTowServiceOrderSheet({ screen, location, onNavigate, onBack, onClose, serviceType }: Props & { serviceType: NonTowServiceType }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestPending = useRef(false)
  const bookingRequest = useRef<{ id: string; payload: string } | undefined>(undefined)
  const submittedLocation = useRef<Point | null>(null)
  const open = screen !== 'map' && screen !== 'service'
  const editingLocation = screen === 'detail'
  const enteringDetails = screen === 'service-details'
  const review = screen === 'review'
  const fields = serviceDetailFields(serviceType)
  const [extraAddress, setExtraAddress] = useState('')
  const [serviceDetails, setServiceDetails] = useState<Record<string, string>>({})
  const [orderId, setOrderId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = readBookingDraft()
    if (saved) {
      setExtraAddress(saved.extraAddress || '')
      setServiceDetails(saved.serviceDetails || {})
      setOrderId(saved.orderId)
      bookingRequest.current = saved.request
      if (saved.orderId) submittedLocation.current = saved.location
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    saveBookingDraft({
      carType: '', dest: '', carMark: '', extraAddress, serviceDetails,
      location: orderId ? submittedLocation.current : location,
      orderId, request: bookingRequest.current,
    })
  }, [ready, extraAddress, serviceDetails, location, orderId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!open) { dialog.close(); return }
    dialog.showModal()
    return () => dialog.close()
  }, [open])

  const detailsValid = () => {
    const normalized = normalizeServiceDetails(serviceType, serviceDetails)
    if (!normalized) {
      const missing = fields.find(field => field.required && !String(serviceDetails[field.key] || '').trim())
      setError(missing ? `${missing.label.replace(' · ЗААВАЛ БИШ', '')} мэдээллээ оруулна уу.` : 'Үйлчилгээний мэдээллээ шалгана уу.')
      return null
    }
    setError('')
    return normalized
  }

  const goReview = () => {
    if (!detailsValid()) return
    onNavigate('review')
  }

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
    const normalizedDetails = detailsValid()
    if (!normalizedDetails) { onNavigate('service-details'); return }

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
      service_details: normalizedDetails,
    }
    const payload = JSON.stringify(details)
    if (bookingRequest.current?.payload !== payload) bookingRequest.current = { id: createRequestId(), payload }
    saveBookingDraft({ carType: '', dest: '', carMark: '', extraAddress, serviceDetails: normalizedDetails, location, orderId: null, request: bookingRequest.current })

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
      saveBookingDraft({ carType: '', dest: '', carMark: '', extraAddress, serviceDetails: normalizedDetails, location, orderId: body.order.id })
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

  const title = enteringDetails ? `${serviceLabel(serviceType)} — мэдээлэл` : review ? 'Захиалгаа шалгаарай' : 'Байршлын тайлбар'

  return <dialog ref={dialogRef} className="current-order-dialog" aria-labelledby="service-order-title"
    onCancel={event => { event.preventDefault(); if (!requestPending.current) onBack() }}
    onClick={event => { if (event.target === event.currentTarget && !requestPending.current) onClose() }}>
    <form className="current-order-sheet" noValidate onSubmit={event => {
      event.preventDefault()
      if (enteringDetails) goReview()
      else if (editingLocation) onBack()
    }}>
      <div className="current-sheet-handle" />
      <div className="current-sheet-head">
        <div>
          <span className="current-sheet-kicker">{enteringDetails ? 'АЖЛЫН МЭДЭЭЛЭЛ' : review ? 'БАТАЛГААЖУУЛАХ' : 'БАЙРШИЛ'}</span>
          <h2 id="service-order-title">{serviceIcon(serviceType)} {title}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={submitting} className="current-sheet-close" aria-label="Хаах">×</button>
      </div>
      <div className="current-sheet-scroll">
        {enteringDetails && <div style={{display:'grid', gap:12}}>
          {fields.map(field => <div key={field.key} className={`current-input-card ${error && field.required && !String(serviceDetails[field.key] || '').trim() ? 'has-error' : ''}`}>
            <label htmlFor={`service-detail-${field.key}`}>{field.label}</label>
            <div className="current-entry-row">
              <input id={`service-detail-${field.key}`} value={serviceDetails[field.key] || ''} maxLength={field.maxLength} disabled={submitting || Boolean(orderId)}
                onChange={event => { setServiceDetails(previous => ({ ...previous, [field.key]: event.target.value })); setError('') }} placeholder={field.placeholder} />
            </div>
          </div>)}
          <p className="current-order-hint">Энэ мэдээлэл таны захиалгыг харах {serviceLabel(serviceType)} жолоочид шууд харагдана.</p>
        </div>}

        {review && <>
          <dl className="current-order-review">
            <div><dt>Үйлчилгээ</dt><dd><span>{serviceLabel(serviceType)}</span><button type="button" disabled={submitting || Boolean(orderId)} onClick={() => { onBack(); setTimeout(() => onBack(), 0) }}>Солих</button></dd></div>
            <div><dt>Байршил</dt><dd><span>{location ? (extraAddress.trim() || 'Газрын зураг дээр сонгосон байршил') : 'Байршлаа сонгоно уу'}</span><button type="button" disabled={submitting} onClick={onClose}>Газрын зураг</button></dd></div>
            {serviceDetailEntries(serviceType, serviceDetails).map(item => <div key={item.label}><dt>{item.label}</dt><dd><span>{item.value}</span></dd></div>)}
          </dl>
          <button className="current-detail-toggle" type="button" disabled={submitting || Boolean(orderId)} onClick={() => onNavigate('detail')}>
            {extraAddress.trim() ? `Байршлын тайлбар: ${extraAddress.trim()}` : '+ Байршлын тайлбар нэмэх (заавал биш)'}
          </button>
          <p className="current-order-hint">Таны сонгосон үйлчилгээний төрөлтэй, ойр байгаа жолооч нараас үнийн санал авна.</p>
        </>}

        {editingLocation && <div className="current-input-card">
          <label htmlFor="service-location-detail">БАЙРШЛЫН ТАЙЛБАР · ЗААВАЛ БИШ</label>
          <div className="current-entry-row">
            <input id="service-location-detail" value={extraAddress} readOnly={Boolean(orderId)} maxLength={350} enterKeyHint="done"
              onChange={event => setExtraAddress(event.target.value)} placeholder="Байр, орц, объект, ойролцоох газар" />
            {extraAddress.trim() && <button className="current-inline-done" type="submit">Болсон</button>}
          </div>
        </div>}
        {error && <p className="current-field-error" role="alert">{error}</p>}
      </div>
      <div className="current-sheet-footer">
        <button type="button" className="current-step-back" disabled={submitting} onClick={() => { if (!onBack()) onClose() }}>← Буцах</button>
        {enteringDetails && <button type="button" className="current-final-search" disabled={submitting} onClick={goReview}>Үргэлжлүүлэх →</button>}
        {review && <button type="button" className="current-final-search" disabled={submitting} onClick={() => void search()}>
          {submitting ? 'Илгээж байна…' : orderId ? 'Үнийн санал руу →' : 'Жолооч хайх →'}
        </button>}
      </div>
    </form>
  </dialog>
}
