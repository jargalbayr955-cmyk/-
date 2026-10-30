'use client'

import { useEffect, useRef, useState } from 'react'
import { DriverOrdersMap } from './driver-orders-map'
import { DriverChatPanel, type DriverPeer } from './driver-chat-panel'
import { DriverGroupChatPanel } from './driver-group-chat-panel'
import { locationIsFresh, offerDistance, pickupPoint } from '@/lib/order-offers'
import { nearbyOrders, orderServiceLabel, type DriverOrder } from '@/lib/driver-orders'
import { driverServiceLabel, serviceDetailEntries, serviceProfileIsComplete } from '@/lib/service-types'
import { roadDistanceBetween, roadDistanceText } from '@/lib/client/road-distance'
import { useScreenHistory } from '@/lib/client/use-screen-history'

type DriverScreen = 'map' | 'group' | 'chat' | `chat:${string}`
const isDriverScreen = (value: string): value is DriverScreen => value === 'map' || value === 'group' || value === 'chat' || /^chat:[^/]{1,100}$/.test(value)

type Props = {
  driver: { name: string; service_type: string | null; car_type: string | null; lat: number | null; lng: number | null; location_updated_at: string | null; available: boolean }
  orders: DriverOrder[]
  locating: boolean; locationMessage: string; error: string; newOrderAlert: boolean
  nativeDriver: boolean; pushReady: boolean; notificationsDenied: boolean
  sentOffers: Record<string, boolean>; sendingOffer: string | null
  onSubscribe: () => void; onProfile: () => void
  onOffer: (order: DriverOrder, price: string) => void
  [legacyProp: string]: unknown
}

export function DriverDispatchView(props: Props) {
  const { driver, orders, locating, locationMessage, error, newOrderAlert, nativeDriver, pushReady, notificationsDenied, sentOffers, sendingOffer, onSubscribe, onProfile, onOffer } = props
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [roadMeters, setRoadMeters] = useState<number | null>(null)
  const [roadLoading, setRoadLoading] = useState(false)
  const [roadError, setRoadError] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [isIOS, setIsIOS] = useState(false)
  const [peers, setPeers] = useState<DriverPeer[]>([])
  const [chatUnread, setChatUnread] = useState(0)
  const [groupUnread, setGroupUnread] = useState(0)
  const [notificationReminder, setNotificationReminder] = useState(0)
  const root = useRef<HTMLDivElement | null>(null)
  const subscribeRef = useRef(onSubscribe)
  subscribeRef.current = onSubscribe
  const driverScreen = useScreenHistory<DriverScreen>('driver-dispatch', 'map', isDriverScreen)
  const groupChatOpen = driverScreen.screen === 'group'
  const privateChatOpen = driverScreen.screen === 'chat' || driverScreen.screen.startsWith('chat:')
  const chatPeerId = driverScreen.screen.startsWith('chat:') ? driverScreen.screen.slice(5) : null
  const position = pickupPoint(driver.lat, driver.lng)
  const fresh = !locationMessage && locationIsFresh(driver.location_updated_at)
  const sorted = nearbyOrders(orders, position)
  const selected = sorted.find(order => order.id === selectedId) || sorted[0] || null
  const selectedPeer = peers.find(peer => peer.id === selectedPeerId) || null
  const selectedPeerLat = selectedPeer?.lat ?? null
  const selectedPeerLng = selectedPeer?.lng ?? null
  const driverLat = position?.lat ?? null
  const driverLng = position?.lng ?? null
  const offered = selected && (sentOffers[selected.id] || selected.has_offered)
  const locationDenied = /зөвшөөрөл хаалттай/i.test(locationMessage)
  const profileReady = serviceProfileIsComplete(driver.service_type, driver.car_type)
  const totalChatUnread = groupUnread + chatUnread

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
    if (selectedPeerLat == null || selectedPeerLng == null || driverLat == null || driverLng == null) {
      setRoadMeters(null); setRoadLoading(false); setRoadError('')
      return
    }
    let cancelled = false
    setRoadLoading(true); setRoadMeters(null); setRoadError('')
    void roadDistanceBetween({ lat: driverLat, lng: driverLng }, { lat: selectedPeerLat, lng: selectedPeerLng })
      .then(meters => { if (!cancelled) setRoadMeters(meters) })
      .catch(() => { if (!cancelled) setRoadError('Замын зайг одоогоор тооцоолж чадсангүй') })
      .finally(() => { if (!cancelled) setRoadLoading(false) })
    return () => { cancelled = true }
  }, [selectedPeerId, selectedPeerLat, selectedPeerLng, driverLat, driverLng])

  useEffect(() => {
    if (selectedPeerId && !peers.some(peer => peer.id === selectedPeerId)) setSelectedPeerId(null)
  }, [peers, selectedPeerId])

  useEffect(() => {
    if (nativeDriver || pushReady) return
    let stopped = false
    const remind = () => {
      if (stopped) return
      setNotificationReminder(value => value + 1)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
  }, [nativeDriver, notificationsDenied, pushReady])

  const openGroupChat = () => driverScreen.navigate('group')
  const openChatList = () => driverScreen.navigate('chat')
  const focusPeer = (id: string) => {
    setSelectedPeerId(id)
    setSelectedId(null)
  }
  const selectOrder = (id: string) => {
    setSelectedPeerId(null)
    setSelectedId(id)
  }
  const openPeerChat = (id: string) => {
    if (driverScreen.screen === 'map') driverScreen.navigate('chat')
    driverScreen.navigate(`chat:${id}`)
  }
  const changeChatPeer = (id: string | null) => {
    if (id) driverScreen.navigate(`chat:${id}`)
    else if (!driverScreen.back()) driverScreen.navigate('chat', true)
  }

  return <div ref={root} className="driver-dispatch-page">
    <DriverOrdersMap driver={position} fresh={fresh} orders={orders} selectedId={selectedPeer ? null : selected?.id || null} onSelect={selectOrder}
      peers={peers} selectedPeerId={selectedPeerId} onPeerSelect={focusPeer} />
    <header className="driver-dispatch-header">
      <div className="driver-dispatch-toolbar">
        <div className="driver-dispatch-identity"><strong>{driver.name}</strong><span>{driverServiceLabel(driver.service_type, driver.car_type)}</span></div>
        <button className="driver-profile-button" aria-label="Ачилт чат" title="Ачилт чат" onClick={openGroupChat} style={{position:'relative', width:'auto', minWidth:92, padding:'0 11px', gap:5, fontSize:12}}>
          💬 <strong>Ачилт чат</strong>
          {totalChatUnread > 0 && <span aria-label={`${totalChatUnread} уншаагүй зурвас`} style={{position:'absolute', top:-5, right:-5, minWidth:18, height:18, padding:'0 4px', borderRadius:10, background:'#e8433a', color:'#fff', border:'2px solid #0b0d11', display:'grid', placeItems:'center', fontSize:9, fontWeight:900}}>{totalChatUnread > 99 ? '99+' : totalChatUnread}</span>}
        </button>
        <button className="driver-profile-button" aria-label="Миний профайл" onClick={onProfile}>👤</button>
      </div>
      <div className="driver-dispatch-status">
        <span className={fresh ? 'driver-status-ready' : ''} role="status">
          {fresh ? `● ОНЛАЙН · Захиалга хүлээж байна · GPS автомат${peers.length ? ` · ${peers.length} жолооч` : ''}` : '● ОНЛАЙН · GPS байршил шинэчлэгдэж байна…'}
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
        {!nativeDriver && <button type="button" onClick={() => window.dispatchEvent(new Event('achilt-location-retry'))}
          style={{marginTop:10, border:0, borderRadius:10, padding:'10px 12px', background:'#e8433a', color:'white', fontWeight:800, cursor:'pointer'}}>
          📍 Байршил дахин зөвшөөрөх
        </button>}
      </div>}
      {error && <p className="driver-dispatch-message driver-dispatch-error" role="alert">{error}</p>}
      {newOrderAlert && <p className="driver-new-order" role="status">Шинэ захиалга ирлээ. Зураг дээрх цэгийг дарж үзнэ үү.</p>}
    </header>

    <section className="driver-order-panel" aria-label={selectedPeer ? 'Сонгосон жолооч' : 'Ирсэн захиалга'}>
      {selectedPeer ? <div style={{display:'grid', gap:10}}>
        <div style={{display:'flex', alignItems:'flex-start', gap:10}}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:11, color:'#8993a0', fontWeight:800, marginBottom:3}}>ЖОЛООЧ</div>
            <h1 style={{margin:0, fontSize:20, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{selectedPeer.name}</h1>
            <div style={{marginTop:4, color:selectedPeer.available && selectedPeer.fresh ? '#65d98b' : '#9aa4b1', fontSize:12}}>
              {selectedPeer.available && selectedPeer.fresh ? '● Онлайн' : '○ Сүүлд харагдсан'} · {driverServiceLabel(selectedPeer.service_type, selectedPeer.car_type)}
            </div>
          </div>
          <button type="button" aria-label="Жолоочийн мэдээлэл хаах" onClick={() => setSelectedPeerId(null)} style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,.12)',background:'#1a1e25',color:'#fff',fontSize:18,cursor:'pointer'}}>×</button>
        </div>
        <div style={{border:'1px solid rgba(255,255,255,.08)',background:'#141820',borderRadius:14,padding:'11px 12px'}}>
          <div style={{color:'#7f8a98',fontSize:10,fontWeight:900,letterSpacing:'.04em'}}>ЗАМААР ХЭМЖСЭН ЗАЙ</div>
          <strong style={{display:'block',fontSize:22,marginTop:3}}>
            {roadLoading ? 'Тооцоолж байна…' : roadMeters != null ? `Замын зай: ${roadDistanceText(roadMeters)}` : 'Замын зай: —'}
          </strong>
          {roadError && <div style={{color:'#e8b36b',fontSize:11,marginTop:4}}>{roadError}. Google замын мэдээлэл бэлэн болмогц дахин тооцно.</div>}
        </div>
        <button type="button" aria-label="Чат нээх" onClick={() => openPeerChat(selectedPeer.id)} style={{height:46,border:0,borderRadius:14,background:'#e8433a',color:'#fff',fontSize:14,fontWeight:900,cursor:'pointer'}}>💬 Хувийн чат нээх</button>
      </div> : selected ? <>
        <div className="driver-order-heading"><h1>{orderServiceLabel(selected)} хэрэгтэй</h1><span>{offerDistance(selected.distance)}{selected.distance !== null && ' · шулуун зай'}</span></div>
        {sorted.length > 1 && <div className="driver-order-tabs" aria-label="Захиалга сонгох">
          {sorted.map((order, index) => <button key={order.id} aria-pressed={selected.id === order.id} aria-label={`${index + 1}. ${order.from_address || 'Үйлчилгээний цэг'}`} onClick={() => selectOrder(order.id)}>{index + 1} · {offerDistance(order.distance)}</button>)}
        </div>}
        <dl className="driver-order-route">
          {selected.service_type === 'achilt' ? <>
            <div><dt>Ачих газар</dt><dd>{selected.from_address || 'Зураг дээрх ачих цэг'}</dd></div>
            <div><dt>Хүргэх газар</dt><dd>{selected.to_address || 'Хүргэх газар оруулаагүй'}</dd></div>
            <div><dt>Машин</dt><dd>{selected.car_mark || 'Машины мэдээлэл оруулаагүй'}</dd></div>
          </> : <>
            <div><dt>Үйлчилгээний газар</dt><dd>{selected.from_address || 'Газрын зураг дээрх үйлчилгээний цэг'}</dd></div>
            {serviceDetailEntries(selected.service_type, selected.service_details).map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
          </>}
        </dl>
        {offered ? <p className="driver-offer-sent" role="status">✓ Үнийн санал илгээсэн · Хэрэглэгчийн сонголтыг хүлээж байна</p> : <form className="driver-offer-form" onSubmit={event => {
          event.preventDefault(); onOffer(selected, prices[selected.id] || '')
        }}>
          <label htmlFor="driver-offer-price" className="driver-price-label">Таны үнэ (₮)</label>
          <input key={selected.id} id="driver-offer-price" type="number" inputMode="numeric" enterKeyHint="send" required min="1" max="10000000" step="1" placeholder="Үнийн санал (₮)" onFocus={() => setSelectedId(selected.id)} value={prices[selected.id] || ''} onChange={event => setPrices(previous => ({ ...previous, [selected.id]: event.target.value }))} />
          <button type="submit" disabled={Boolean(sendingOffer)}>{sendingOffer === selected.id ? 'Илгээж байна…' : 'Үнэ илгээх'}</button>
        </form>}
      </> : <div className="driver-orders-empty">
        <h1>Ойр байгаа захиалгыг хүлээж байна</h1>
        <p>Нэвтэрсэн жолооч үргэлж онлайн ажиллана. Таны үйлчилгээний төрөлтэй захиалга ирэхэд газрын зураг дээр автоматаар гарч, мэдэгдэл ирнэ.</p>
      </div>}
    </section>

    <DriverGroupChatPanel open={groupChatOpen} privateUnread={chatUnread} onClose={driverScreen.close} onOpenPrivate={openChatList} onUnreadChange={setGroupUnread} />
    <DriverChatPanel peers={peers} open={privateChatOpen} peerId={chatPeerId} onClose={driverScreen.close} onPeerChange={changeChatPeer} onUnreadChange={setChatUnread} />
  </div>
}
