'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { backInApp } from '@/lib/client/navigation'
import { OrderConnectionMap } from '../components/order-connection-map'
import { DriverSummary } from '../components/driver-summary'
import { clearBookingDraft } from '@/lib/client/booking-draft'
import { locationIsFresh, pickupPoint, pointDistance } from '@/lib/order-offers'

type Tracking = {
  order: { id: string; status: string; driver_name: string | null; driver_phone: string | null; final_price: number | null; from_lat: number | null; from_lng: number | null }
  driver: { name: string | null; photo_url: string | null; car_number: string | null; car_type: string | null; lat: number | null; lng: number | null; location_updated_at: string | null } | null
}

export default function TrackingPage() {
  const router = useRouter()
  const [data, setData] = useState<Tracking | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)

  useEffect(() => {
    let orderId: string | null = null
    try { orderId = localStorage.getItem('current_order_id') } catch {}
    if (!orderId) { router.replace('/current'); return }
    let cancelled = false, pending = false, finished = false
    let controller: AbortController | undefined
    const poll = async () => {
      if (cancelled || pending || finished) return
      pending = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 12_000)
      try {
        const response = await fetch('/api/order/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }), cache: 'no-store', signal: controller.signal })
        if (cancelled) return
        if (response.status === 401) { finished = true; setData(null); router.replace('/start'); return }
        if (response.status === 404) { finished = true; setData(null); router.replace('/current'); return }
        if (!response.ok) throw new Error('Tracking unavailable')
        const body: Tracking = await response.json()
        if (cancelled) return
        if (body.order.status === 'pending') { finished = true; router.replace('/drivers'); return }
        finished = ['completed', 'cancelled'].includes(body.order.status)
        if (finished) clearBookingDraft()
        setData(body); setError(''); setNow(Date.now())
      } catch { if (!cancelled) setError('Холболт тасарсан. Байршлыг дахин шинэчилж байна…') }
      finally { pending = false; clearTimeout(timeout) }
    }
    void poll()
    const timer = setInterval(() => {
      setNow(Date.now())
      if (document.visibilityState === 'visible') void poll()
    }, 5000)
    const resume = () => { if (document.visibilityState === 'visible') void poll() }
    document.addEventListener('visibilitychange', resume)
    return () => { cancelled = true; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume) }
  }, [router])

  const order = data?.order, driver = data?.driver
  const active = order?.status === 'confirmed'
  const pickup = pickupPoint(order?.from_lat, order?.from_lng)
  const driverPoint = active ? pickupPoint(driver?.lat, driver?.lng) : null
  const fresh = !error && driverPoint && locationIsFresh(driver?.location_updated_at, now)
  const title = !order ? 'Захиалга ачаалж байна…' : active ? 'Жолооч сонгогдлоо' : order.status === 'completed' ? 'Ачилт дууслаа' : 'Захиалга цуцлагдсан'

  return <main className="tracking-page">
    <header className="tracking-header"><button type="button" className="offers-back" onClick={() => backInApp(router, '/drivers')}>← Буцах</button><h1 role="status">{title}</h1></header>
    <div className="tracking-map"><OrderConnectionMap pickup={pickup} driver={driverPoint} /></div>
    <section className="tracking-details" aria-label="Сонгогдсон жолооч">
      {error && <p className="connection-warning" role="alert">{error}</p>}
      {order && <>
        <DriverSummary name={order.driver_name || driver?.name || null} photo={driver?.photo_url} plate={driver?.car_number} carType={driver?.car_type} price={order.final_price == null ? null : Number(order.final_price)} distance={pointDistance(pickup, driverPoint)} />
        {active && <p className={fresh ? 'connection-status' : 'connection-warning'} role="status">{fresh ? '● Жолоочийн байршил шинэчлэгдэж байна' : driverPoint ? 'Жолоочийн сүүлийн байршил. Шинэчлэлт хүлээж байна.' : 'Жолоочийн байршлыг хүлээж байна.'}</p>}
        {order.driver_phone && <a className="connection-call" href={`tel:${order.driver_phone}`}>☎ Жолооч руу залгах · {order.driver_phone}</a>}
        {active && <p className="offer-selection-note">Таны дугаар сонгосон жолоочид харагдаж байна. Цэнхэр цэг — ачуулах байршил.</p>}
        {!active && <button type="button" className="offer-select-button" onClick={() => router.replace('/current')}>Нүүр хуудас руу буцах</button>}
      </>}
    </section>
  </main>
}
