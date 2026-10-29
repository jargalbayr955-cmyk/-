'use client'

import { useEffect, useRef, useState } from 'react'
import { DriverOrdersMap } from './driver-orders-map'
import { DriverChatPanel, type DriverPeer } from './driver-chat-panel'
import { locationIsFresh, offerDistance, pickupPoint } from '@/lib/order-offers'
import { nearbyOrders, orderServiceLabel, type DriverOrder } from '@/lib/driver-orders'
import { driverServiceLabel, serviceProfileIsComplete } from '@/lib/service-types'

type Props = {
  driver: { name: string; service_type: string | null; car_type: string | null; lat: number | null; lng: number | null; location_updated_at: string | null; available: boolean }
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
  const [isIOS, setIsIOS] = useState(false)
  const [peers, setPeers] = useState<DriverPeer[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPeerId, setChatPeerId] = useState<string | null>(null)
  const [chatUnread, setChatUnread] = useState(0)
  const [notificationReminder, setNotificationReminder] = useState(0)
  const root = useRef<HTMLDivElement | null>(null)
  const subscribeRef = useRef(onSubscribe)
  subscribeRef.current = onSubscribe
  const position = pickupPoint(driver.lat, driver.lng)
  const fresh = !locationMessage && locationIsFresh(driver.location_updated_at)
  const sorted = nearbyOrders(orders, position)
  const selected = sorted.find(order => order.id === selectedId) || sorted[0] || null
  const offered = selected && (sentOffers[selected.id] || selected.has_offered)
  const locationDenied = /зөвшөөрөл хаалттай/i.test(locationMessage)
  const profileReady = serviceProfileIsComplete(driver.service_type, driver.car_type)

  useEffect(() => {
    const viewport = window.visualViewport
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(ios)
    if (!viewport) return
    const resize = () => root.current?.style.setProperty('--driver-viewport-height', `${viewport.height}px`)
    resize(); viewport.addEventListener('resize', resize)
    return () => viewport.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadPeers = async () => {
      try {
        const response = await fetch('/api/driver/peers', { cache:'no-store' })
        if (cancelled || response.status === 401) return
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body.blocked) { if (!cancelled) setPeers([]); return }
        if (!cancelled) setPeers(Array.isArray(body.peers) ? body.peers : [])
      } catch {}
    }
    void loadPeers()
    const timer = window.setInterval(() => void loadPeers(), 10_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (nativeDriver || pushReady) return
    let stopped = false
    const remind = () => {
      if (stopped) return
      setNotificationReminder(value => value + 1)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        // Permission may have been enabled in browser settings while this page stayed open.
        void Promise.resolve(subscribeRef.current())
      } else if (document.visibilityState === 'visible') {
        navigator.vibrate?.([70, 80, 70])
      }
    }
    remind()
    const timer = window.setInterval(remind, 25_000)
    const visible = () => { if (document.visibilityState === 'visible') remind() }
    window.addEventListener('online', remind)
    document.addEventListener('visibilitychange', visible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('online', remind)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [nativeDriver, pushReady])

  useEffect(() => {
    let stopped = false
    const health = () => {
      if (nativeDriver) return 'native'
      if (pushReady) return 'ready'
      if (typeof Notification === 'undefined') return 'unsupported'
      if (Notification.permission === 'denied' || notificationsDenied) return 'permission_denied'
      if (Notification.permission === 'default') return 'permission_default'
      return 'error'
    }
    const beat = () => {
      if (stopped) return
      void fetch('/api/driver/heartbeat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ notification_health: health() }), keepalive:true,
      }).catch(() => {})
    }
    beat()
    const timer = window.setInterval(beat, 30_000)
    const visible = () => { if (document.visibilityState === 'visible') beat() }
    window.addEventListener('online', beat)
    document.addEventListener('visibilitychange', visible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('online', beat)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [driver.available, nativeDriver, notificationsDenied, pushReady])

  const openPeerChat = (id: string) => {
    setChatPeerId(id)
    setChatOpen(true)
  }

  return <div ref={root} className="driver-dispatch-page">
    <DriverOrdersMap driver={position} fresh={fresh} orders={orders} selectedId={selected?.id || null} onSelect={setSelectedId}
      peers={peers} selectedPeerId={chatPeerId} onPeerSelect={openPeerChat} />
    <header className="driver-dispatch-header">
      <div className="driver-dispatch-toolbar">
        <div className="driver-dispatch-identity"><strong>{driver.name}</strong><span>{driverServiceLabel(driver.service_type, driver.car_type)}</span></div>
        {!nativeDriver && <button className="driver-work-toggle" aria-pressed={driver.available} onClick={onToggleAvailable} disabled={locating}>
          {locating ? 'Түр хүлээнэ үү…' : driver.available ? 'Амрах' : 'Онлайн болох'}
        </button>}
        <button className="driver-profile-button" aria-label="Жолоочийн чат" title="Жолоочийн чат" onClick={() => { setChatPeerId(null); setChatOpen(true) }} style={{position:'relative'}}>
          💬
          {chatUnread > 0 && <span aria-label={`${chatUnread} уншаагүй зурвас`} style={{position:'absolute', top:-5, right:-5, minWidth:18, height:18, padding:'0 4px', borderRadius:10, background:'#e8433a', color:'#fff', border:'2px solid #0b0d11', display:'grid', placeItems:'center', fontSize:9, fontWeight:900}}>{chatUnread > 99 ? '99+' : chatUnread}</span>}
        </button>
        <button className="driver-profile-button" aria-label="Миний профайл" onClick={onProfile}>👤</button>
      </div>
      <div className="driver-dispatch-status">
        <span className={driver.available && fresh ? 'driver-status-ready' : ''} role="status">
          {driver.available ? fresh ? `● ОНЛАЙН · Захиалга хүлээж байна · GPS автомат${peers.length ? ` · ${peers.length} жолооч` : ''}` : 'Онлайн болж байна · GPS байршил тогтоож байна…' : `Амарч байна · Захиалга авахгүй${peers.length ? ` · ${peers.length} жолооч зураг дээр` : ''}`}
        </span>
        {!nativeDriver && <button onClick={onSubscribe} aria-label={pushReady ? 'Мэдэгдэл асаалттай' : 'Захиалгын мэдэгдэл авах'}>
          {pushReady ? '🔔 Асаалттай' : notificationsDenied ? '🔕 Хаалттай' : '🔔 Мэдэгдэл асаах'}
        </button>}
      </div>
      {!nativeDriver && !pushReady && <div role="alert" aria-live="polite" style={{
        margin:'8px 12px 0', padding:'11px 12px', borderRadius:12,
        border:'1px solid rgba(255,93,82,.75)', background:notificationReminder % 2 ? 'rgba(232,67,58,.22)' : 'rgba(232,67,58,.12)',
        boxShadow:notificationReminder % 2 ? '0 0 0 3px rgba(232,67,58,.12)' : 'none', color:'#fff', fontSize:12, lineHeight:1.45,
      }}>
        <strong>⚠ Захиалгын мэдэгдэл асаагаагүй байна.</strong> Өөр апп ашиглаж байх үед захиалга алдах эрсдэлтэй.
        <button type="button" onClick={onSubscribe} style={{marginLeft:8, border:0, borderRadius:9, padding:'7px 10px', background:'#e8433a', color:'#fff', fontWeight:900, cursor:'pointer'}}>Мэдэгдэл асаах</button>
        {notificationsDenied && <div style={{marginTop:6, color:'#ffd3cf'}}>Browser/утасны Settings → Notifications → Achilt → Allow/Зөвшөөрөх болгосны дараа энэ хуудас автоматаар дахин холбоно.</div>}
      </div>}
      {!profileReady && <button className="driver-dispatch-message" onClick={onProfile}>Профайлдаа ажиллах үйлчилгээний төрлөө бүрэн сонгоно уу →</button>}
      {locationMessage && <div className="driver-dispatch-message" role="status">
        <div>{locationMessage}</div>
        {isIOS && locationDenied && <div style={{marginTop:8, lineHeight:1.45}}>
          <strong>iPhone:</strong> Safari дээр Page Menu → Website Settings → Location → <strong>Allow</strong> болгоно. Мөн Settings → Privacy &amp; Security → Location Services асаалттай байна.
        </div>}
        {!nativeDriver && driver.available && <button type="button" onClick={() => window.dispatchEvent(new Event('achilt-location-retry'))}
          style={{marginTop:10, border:0, borderRadius:10, padding:'10px 12px', background:'#e8433a', color:'white', fontWeight:800, cursor:'pointer'}}>
          📍 Байршил дахин зөвшөөрөх
        </button>}
      </div>}
      {error && <p className="driver-dispatch-message driver-dispatch-error" role="alert">{error}</p>}
      {newOrderAlert && <p className="driver-new-order" role="status">Шинэ захиалга ирлээ. Зураг дээрх цэгийг дарж үзнэ үү.</p>}
    </header>

    <section className="driver-order-panel" aria-label="Ирсэн захиалга">
      {selected ? <>
        <div className="driver-order-heading"><h1>{orderServiceLabel(selected)} хэрэгтэй</h1><span>{offerDistance(selected.distance)}{selected.distance !== null && ' · шулуун зай'}</span></div>
        {sorted.length > 1 && <div className="driver-order-tabs" aria-label="Захиалга сонгох">
          {sorted.map((order, index) => <button key={order.id} aria-pressed={selected.id === order.id} aria-label={`${index + 1}. ${order.from_address || 'Үйлчилгээний цэг'}`} onClick={() => setSelectedId(order.id)}>{index + 1} · {offerDistance(order.distance)}</button>)}
        </div>}
        <dl className="driver-order-route">
          {selected.service_type === 'achilt' ? <>
            <div><dt>Ачих газар</dt><dd>{selected.from_address || 'Зураг дээрх ачих цэг'}</dd></div>
            <div><dt>Хүргэх газар</dt><dd>{selected.to_address || 'Хүргэх газар оруулаагүй'}</dd></div>
            <div><dt>Машин</dt><dd>{selected.car_mark || 'Машины мэдээлэл оруулаагүй'}</dd></div>
          </> : <div><dt>Үйлчилгээний газар</dt><dd>{selected.from_address || 'Газрын зураг дээрх үйлчилгээний цэг'}</dd></div>}
        </dl>
        {offered ? <p className="driver-offer-sent" role="status">✓ Үнийн санал илгээсэн · Хэрэглэгчийн сонголтыг хүлээж байна</p> : <form className="driver-offer-form" onSubmit={event => {
          event.preventDefault(); onOffer(selected, prices[selected.id] || '')
        }}>
          <label htmlFor="driver-offer-price" className="driver-price-label">Таны үнэ (₮)</label>
          <input key={selected.id} id="driver-offer-price" type="number" inputMode="numeric" enterKeyHint="send" required min="1" max="10000000" step="1" placeholder="Үнийн санал (₮)" onFocus={() => setSelectedId(selected.id)} value={prices[selected.id] || ''} onChange={event => setPrices(previous => ({ ...previous, [selected.id]: event.target.value }))} />
          <button type="submit" disabled={Boolean(sendingOffer) || !driver.available}>{sendingOffer === selected.id ? 'Илгээж байна…' : 'Үнэ илгээх'}</button>
        </form>}
        {!driver.available && <p className="driver-order-note">Үнэ илгээхийн тулд онлайн төлөвт орно уу.</p>}
      </> : <div className="driver-orders-empty">
        <h1>{driver.available ? 'Ойр байгаа захиалгыг хүлээж байна' : 'Амарч байна'}</h1>
        <p>{driver.available ? 'Нэвтэрсний дараа ажиллах төлөв автоматаар асна. Таны үйлчилгээний төрөлтэй захиалга ирэхэд цэг зураг дээр автоматаар гарна.' : 'Онлайн болох товчоор дахин ажиллах төлөвт орж болно. Бусад жолоочийн нэр дээр дарж чатлаж болно.'}</p>
      </div>}
    </section>

    <DriverChatPanel peers={peers} open={chatOpen} peerId={chatPeerId} onClose={() => setChatOpen(false)} onPeerChange={setChatPeerId} onUnreadChange={setChatUnread} />
  </div>
}
