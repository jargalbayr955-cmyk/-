'use client'

import { useEffect, useRef, useState } from 'react'
import { DriverOrdersMap } from './driver-orders-map'
import { locationIsFresh, offerDistance, pickupPoint } from '@/lib/order-offers'
import { nearbyOrders, vehicleLabel, type DriverOrder } from '@/lib/driver-orders'

type Props = {
  driver: { name: string; car_type: string | null; lat: number | null; lng: number | null; location_updated_at: string | null; available: boolean }
  orders: DriverOrder[]
  locating: boolean; locationMessage: string; error: string; newOrderAlert: boolean
  nativeDriver: boolean; pushReady: boolean; notificationsDenied: boolean
  sentOffers: Record<string, boolean>; sendingOffer: string | null
  onToggleAvailable: () => void; onSubscribe: () => void; onProfile: () => void
  onOffer: (order: DriverOrder, price: string) => void
}

export function DriverDispatchView(props: Props) {
  const { driver, orders, locating, locationMessage, error, newOrderAlert, nativeDriver, pushReady, notificationsDenied, sentOffers, sendingOffer, onToggleAvailable, onSubscribe, onProfile, onOffer } = props
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const root = useRef<HTMLDivElement | null>(null)
  const position = pickupPoint(driver.lat, driver.lng)
  const fresh = !locationMessage && locationIsFresh(driver.location_updated_at)
  const sorted = nearbyOrders(orders, position)
  const selected = sorted.find(order => order.id === selectedId) || sorted[0] || null
  const offered = selected && (sentOffers[selected.id] || selected.has_offered)

  // Keep the price input and submit button visible above a mobile keyboard.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const resize = () => root.current?.style.setProperty('--driver-viewport-height', `${viewport.height}px`)
    resize(); viewport.addEventListener('resize', resize)
    return () => viewport.removeEventListener('resize', resize)
  }, [])

  return <div ref={root} className="driver-dispatch-page">
    <DriverOrdersMap driver={position} fresh={fresh} orders={orders} selectedId={selected?.id || null} onSelect={setSelectedId} />
    <header className="driver-dispatch-header">
      <div className="driver-dispatch-toolbar">
        <div className="driver-dispatch-identity"><strong>{driver.name}</strong><span>{vehicleLabel(driver.car_type)}</span></div>
        {!nativeDriver && <button className="driver-work-toggle" aria-pressed={driver.available} onClick={onToggleAvailable} disabled={locating}>
          {locating ? 'Түр хүлээнэ үү…' : driver.available ? 'Амрах' : 'Ажиллаж эхлэх'}
        </button>}
        <button className="driver-profile-button" aria-label="Миний профайл" onClick={onProfile}>👤</button>
      </div>
      <div className="driver-dispatch-status">
        <span className={driver.available && fresh ? 'driver-status-ready' : ''} role="status">
          {driver.available ? fresh ? '● Захиалга хүлээж байна · GPS автомат' : 'Байршил тогтоож байна…' : 'Амарч байна · Захиалга авахгүй'}
        </span>
        {!nativeDriver && <button onClick={onSubscribe} aria-label={pushReady ? 'Мэдэгдэл асаалттай' : 'Захиалгын мэдэгдэл авах'}>
          {pushReady ? '🔔 Асаалттай' : notificationsDenied ? '🔕 Хаалттай' : '🔔 Мэдэгдэл авах'}
        </button>}
      </div>
      {!driver.car_type && <button className="driver-dispatch-message" onClick={onProfile}>Профайлдаа машины төрлөө сонгоно уу →</button>}
      {locationMessage && <p className="driver-dispatch-message" role="status">{locationMessage}</p>}
      {error && <p className="driver-dispatch-message driver-dispatch-error" role="alert">{error}</p>}
      {newOrderAlert && <p className="driver-new-order" role="status">Шинэ захиалга ирлээ. Зураг дээрх цэгийг дарж үзнэ үү.</p>}
    </header>

    <section className="driver-order-panel" aria-label="Ирсэн захиалга">
      {selected ? <>
        <div className="driver-order-heading"><h1>{vehicleLabel(selected.car_type)} хэрэгтэй</h1><span>{offerDistance(selected.distance)}{selected.distance !== null && ' · шулуун зай'}</span></div>
        {sorted.length > 1 && <div className="driver-order-tabs" aria-label="Захиалга сонгох">
          {sorted.map((order, index) => <button key={order.id} aria-pressed={selected.id === order.id} aria-label={`${index + 1}. ${order.from_address || 'Ачих цэг'} → ${order.to_address || 'Хүргэх газар'}`} onClick={() => setSelectedId(order.id)}>{index + 1} · {offerDistance(order.distance)}</button>)}
        </div>}
        <dl className="driver-order-route">
          <div><dt>Ачих газар</dt><dd>{selected.from_address || 'Зураг дээрх ачих цэг'}</dd></div>
          <div><dt>Хүргэх газар</dt><dd>{selected.to_address || 'Хүргэх газар оруулаагүй'}</dd></div>
          <div><dt>Машин</dt><dd>{selected.car_mark || 'Машины мэдээлэл оруулаагүй'}</dd></div>
        </dl>
        {offered ? <p className="driver-offer-sent" role="status">✓ Үнийн санал илгээсэн · Хэрэглэгчийн сонголтыг хүлээж байна</p> : <form className="driver-offer-form" onSubmit={event => {
          event.preventDefault(); onOffer(selected, prices[selected.id] || '')
        }}>
          <label htmlFor="driver-offer-price" className="driver-price-label">Таны үнэ (₮)</label>
          <input key={selected.id} id="driver-offer-price" type="number" inputMode="numeric" enterKeyHint="send" required min="1" max="10000000" step="1" placeholder="Үнийн санал (₮)" onFocus={() => setSelectedId(selected.id)} value={prices[selected.id] || ''} onChange={event => setPrices(previous => ({ ...previous, [selected.id]: event.target.value }))} />
          <button type="submit" disabled={Boolean(sendingOffer) || !driver.available}>{sendingOffer === selected.id ? 'Илгээж байна…' : 'Үнэ илгээх'}</button>
        </form>}
        {!driver.available && <p className="driver-order-note">Үнэ илгээхийн тулд ажиллах төлөвт орно уу.</p>}
      </> : <div className="driver-orders-empty">
        <h1>{driver.available ? 'Ойр байгаа захиалгыг хүлээж байна' : 'Ажиллаж эхлээд захиалга аваарай'}</h1>
        <p>{driver.available ? 'Захиалга ирэхэд ачих цэг зураг дээр автоматаар гарна.' : 'Таны байршил ажиллах үед автоматаар шинэчлэгдэнэ.'}</p>
      </div>}
    </section>
  </div>
}
