'use client'
import { OrderVideoCall } from '../components/order-video-call'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { OrderConnectionMap } from '../components/order-connection-map'
import { pickupPoint, pointDistance, offerDistance, offerPrice, locationIsFresh } from '@/lib/order-offers'
import { isNativeDriver } from '@/lib/client/native-driver'
import { saveDriverLocation, watchDriverLocation } from '@/lib/client/driver-location'
import { DriverDispatchView } from '../components/driver-dispatch-view'
import { vehicleLabel, type DriverOrder } from '@/lib/driver-orders'
import Link from 'next/link'

const D = {
  bg: '#060608',
  card: 'rgba(255,255,255,0.05)',
  cardBorder: '1px solid rgba(255,255,255,0.08)',
  text: 'white',
  muted: 'rgba(255,255,255,0.4)',
  red: '#e8433a',
}

export default function DriverPage() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [driver, setDriver] = useState<any>(null)
  const [orders, setOrders] = useState<DriverOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [locMsg, setLocMsg] = useState('')
  const [sentOffers, setSentOffers] = useState<Record<string, boolean>>({})
  const [sendingOffer, setSendingOffer] = useState<string | null>(null)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const [acceptedOrder, setAcceptedOrder] = useState<any>(null)
  const [paymentInfo, setPaymentInfo] = useState<{code:string, amount:number} | null>(null)
  const [completing, setCompleting] = useState(false)
  const [notifStatus, setNotifStatus] = useState<'default'|'granted'|'denied'>('default')
  const [pushReady, setPushReady] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [sessionError, setSessionError] = useState(false)
  const [sessionAttempt, setSessionAttempt] = useState(0)

  const [bankInfo, setBankInfo] = useState({ bank_name: '', bank_account: '' })
  const prevOrderIds = useRef<string[]>([])
  const ordersLoaded = useRef(false)
  const ordersLoading = useRef(false)
  const driverRef = useRef<any>(null)
  const seenAcceptedId = useRef<string | null>(null)
  const router = useRouter()
  const nativeDriver = mounted && isNativeDriver()

  // Хаазны дуу тоглуулах
  const playHorn = () => {
    try {
      const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)()
      const playNote = (freq: number, start: number, duration: number, gain: number) => {
        const osc = ctx.createOscillator()
        const gainNode = ctx.createGain()
        osc.connect(gainNode)
        gainNode.connect(ctx.destination)
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.9, ctx.currentTime + start + duration)
        gainNode.gain.setValueAtTime(0, ctx.currentTime + start)
        gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.05)
        gainNode.gain.linearRampToValueAtTime(gain * 0.8, ctx.currentTime + start + duration - 0.1)
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + duration)
      }
      playNote(220, 0, 0.4, 0.6); playNote(260, 0, 0.4, 0.4); playNote(330, 0, 0.4, 0.3)
      playNote(220, 0.5, 0.4, 0.6); playNote(260, 0.5, 0.4, 0.4); playNote(330, 0.5, 0.4, 0.3)
      playNote(220, 1.0, 0.8, 0.7); playNote(260, 1.0, 0.8, 0.5); playNote(330, 1.0, 0.8, 0.4)
      setTimeout(() => { void ctx.close().catch(() => {}) }, 2200)
    } catch {}
  }

  // Service worker-аас horn message хүлээн авах
  useEffect(() => {
    if (!driver) return
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PLAY_HORN') playHorn()
      if (e.data?.type === 'NEW_ORDER') window.dispatchEvent(new Event('achilt-new-order'))
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage)
  }, [driver])

  const subscribeNotification = async () => {
    if (!driver) return
    if (isNativeDriver()) return
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('Энэ browser мэдэгдэл дэмжихгүй байна. Захиалгын хуудсаа нээлттэй байлгана уу.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotifStatus(permission as any)
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
        })
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driver.id, subscription: sub.toJSON() })
        })
        if (!response.ok) throw new Error('Subscription was not saved')
        setPushReady(true)
        setError('')
      }
    } catch { setPushReady(false); setError('Мэдэгдэл холбогдсонгүй. Дахин оролдоно уу.') }
  }

  const handleLogin = async () => {
    if (!phone || !pin) return setError('Дугаар болон PIN оруулна уу')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/driver/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin })
      })
      const body = await res.json()
      if (!res.ok || !body.driver) {
        setError(body.error || 'Дугаар эсвэл PIN буруу байна')
      } else {
        setDriver(body.driver)
        setPin('')
        try { localStorage.setItem('driver_session', JSON.stringify(body.driver)) } catch {}
        if (!isNativeDriver() && 'serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const permission = await Notification.requestPermission()
            if (permission === 'granted') {
              const reg = await navigator.serviceWorker.register('/sw.js')
              await navigator.serviceWorker.ready
              const existing = await reg.pushManager.getSubscription()
              const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
              if (vapidKey) {
                const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
                const pushResponse = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
                if (!pushResponse.ok) throw new Error('Subscription was not saved')
                setPushReady(true)
              }
            }
          } catch { setPushReady(false); setError('Нэвтэрсэн боловч мэдэгдэл холбогдсонгүй. Мэдэгдэл авах товчоор дахин оролдоно уу.') }
        }
      }
    } catch {
      setError('Сүлжээний алдаа. Дахин оролдоно уу.')
    }
    setLoading(false)
  }

  const fetchOrders = useCallback(async () => {
    if (ordersLoading.current) return
    ordersLoading.current = true
    try {
      const res = await fetch('/api/driver/orders', { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
      if (res.status === 401) {
        setDriver(null); setAcceptedOrder(null); setPaymentInfo(null); setOrders([]); setPushReady(false)
        ordersLoaded.current = false; prevOrderIds.current = []
        localStorage.removeItem('driver_session'); localStorage.removeItem('accepted_order'); localStorage.removeItem('payment_info')
        setError('Нэвтрэх эрх дууссан байна. Дахин нэвтэрнэ үү.')
        return
      }
      if (!res.ok) { setError('Захиалга шинэчлэхэд алдаа гарлаа. Дахин оролдоно уу.'); return }
      const body = await res.json()
      setError('')
      const data = Array.isArray(body.orders) ? body.orders : []
      if (body.active === false) {
        setDriver(null); localStorage.removeItem('driver_session'); localStorage.removeItem('accepted_order'); localStorage.removeItem('payment_info'); return
      }
      // The database restores work/payment state even on a new device.
      const accepted = body.acceptedOrder || null
      if (accepted && accepted.id !== seenAcceptedId.current) {
        seenAcceptedId.current = accepted.id
        if (!isNativeDriver()) { playHorn(); navigator.vibrate?.([300, 150, 300]) }
      }
      setAcceptedOrder(accepted)
      setPaymentInfo(body.pendingPayment || null)
      localStorage.removeItem('accepted_order'); localStorage.removeItem('payment_info')
      if (driverRef.current && typeof body.available === 'boolean') {
        const position = body.driverLocation
        setDriver((d:any) => d ? ({ ...d, available: body.available, ...(position || {}) }) : d)
      }
      const newIds = data.map((o: any) => o.id)
      const hasNew = newIds.some((id: string) => !prevOrderIds.current.includes(id))
      const hasRemoved = prevOrderIds.current.some((id: string) => !newIds.includes(id))
      if (hasNew && ordersLoaded.current) {
        setNewOrderAlert(true)
        setTimeout(() => setNewOrderAlert(false), 3000)
        if (!isNativeDriver()) playHorn()
      }
      if (hasNew || hasRemoved || prevOrderIds.current.length === 0) {
        prevOrderIds.current = newIds
      }
      ordersLoaded.current = true
      setOrders(data)
    } catch { setError('Сүлжээ тасарсан байна. Захиалга шинэчлэгдээгүй.') }
    finally { ordersLoading.current = false }
  }, [])

  const startWorking = () => {
    const driverId = driver?.id
    if (!driverId || locating || isNativeDriver()) return
    if (!navigator.geolocation) return setLocMsg('Энэ browser байршил дэмжихгүй байна')
    setLocating(true); setLocMsg('')
    navigator.geolocation.getCurrentPosition(async pos => {
      if (driverRef.current?.id !== driverId) { setLocating(false); return }
      try {
        const saved = await saveDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }, true)
        setDriver((current:any) => current?.id === driverId ? { ...current, ...saved } : current)
        void fetchOrders()
      } catch (cause) { setLocMsg(cause instanceof Error ? cause.message : 'Байршил хадгалахад алдаа гарлаа.') }
      finally { setLocating(false) }
    }, failure => {
      setLocMsg(failure.code === 1 ? 'Байршлын зөвшөөрөл хаалттай. Утасны тохиргооноос энэ сайтын байршлыг зөвшөөрнө үү.' : 'GPS дохио олдсонгүй. Байршлын зөвшөөрлөө шалгаад ажиллаж эхлэх товчийг дахин дарна уу.')
      setLocating(false)
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 })
  }

  // driverRef-г driver state-тай sync хийх
  useEffect(() => {
    driverRef.current = driver
  }, [driver])



  useEffect(() => {
    if (!driver?.id) return
    fetch('/api/driver/payment-settings', { cache: 'no-store' })
      .then(async r => r.ok ? r.json() : null)
      .then(body => { if (body) setBankInfo({ bank_name: body.bank_name || '', bank_account: body.bank_account || '' }) })
      .catch(() => {})
  }, [driver?.id])

  // Mounted + session сэргээх
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    setMounted(false)
    setSessionError(false)
    const restore = async () => {
      try {
        const res = await fetch('/api/driver/session', { cache: 'no-store', signal: controller.signal })
        if (cancelled) return
        if (res.ok) {
          const body = await res.json()
          if (cancelled) return
          setDriver(body.driver)
          try {
            localStorage.setItem('driver_session', JSON.stringify(body.driver))
            localStorage.removeItem('accepted_order')
            localStorage.removeItem('payment_info')
          } catch { /* Browser storage is optional; authentication uses the cookie. */ }
        } else if (res.status === 401) {
          try {
            localStorage.removeItem('driver_session')
            localStorage.removeItem('accepted_order')
            localStorage.removeItem('payment_info')
          } catch {}
        } else throw new Error('Session unavailable')
      } catch { if (!cancelled) setSessionError(true) }
      finally {
        clearTimeout(timeout)
        if (!cancelled) {
          setMounted(true)
          if ('Notification' in window) setNotifStatus(Notification.permission as any)
        }
      }
    }
    void restore()
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [sessionAttempt])

  const trackLocation = Boolean(driver?.id && (driver.available || acceptedOrder) && !paymentInfo)
  useEffect(() => {
    if (!trackLocation || isNativeDriver()) return
    return watchDriverLocation(saved => {
      setDriver((current:any) => current ? { ...current, lat: saved.lat, lng: saved.lng, location_updated_at: saved.location_updated_at } : current)
    }, setLocMsg)
  }, [driver?.id, trackLocation])

  const toggleAvailable = async () => {
    if (!driver || locating || isNativeDriver()) return
    if (!driver.available) { startWorking(); return }
    setLocating(true)
    try {
      const res = await fetch('/api/driver/availability', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ available: false }), signal: AbortSignal.timeout(12_000) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Төлөв өөрчлөхөд алдаа гарлаа')
      setDriver((current:any) => current ? { ...current, available: false } : current)
      setLocMsg('')
    } catch (cause) { setLocMsg(cause instanceof Error ? cause.message : 'Сүлжээний алдаа. Дахин оролдоно уу.') }
    finally { setLocating(false) }
  }

  const sendOffer = async (order: DriverOrder, price: string) => {
    if (sendingOffer) return
    const amount = Number(price)
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) return alert('Үнийн саналаа зөв оруулна уу')
    setSendingOffer(order.id)
    try {
      // The server uses the location maintained by automatic GPS updates.
      const res = await fetch('/api/driver/offer', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ order_id: order.id, price: amount }), signal: AbortSignal.timeout(12_000)
      })
      if (!res.ok) { const body = await res.json().catch(() => ({})); alert(body.error || 'Санал илгээхэд алдаа гарлаа'); return }
      setSentOffers(previous => ({ ...previous, [order.id]: true }))
      void fetchOrders()
    } catch { alert('Сүлжээний алдаа. Санал илгээгдээгүй байна.') }
    finally { setSendingOffer(null) }
  }

  useEffect(() => {
    if (!driver?.id) return
    fetchOrders()
    // Selection also restores promptly when browser push is unavailable.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders()
    }, 5000)
    const onPushRefresh = () => fetchOrders()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchOrders() }
    window.addEventListener('achilt-new-order', onPushRefresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('achilt-new-order', onPushRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [driver?.id, fetchOrders])


  // Mounted болохоос өмнө хоосон screen
  if (!mounted) {
    return <div role="status" style={{minHeight:'100vh', background:D.bg, color:D.muted, display:'grid', placeItems:'center'}}>Нэвтрэлтийг шалгаж байна...</div>
  }
  if (sessionError) return <div style={{minHeight:'100vh', background:D.bg, color:D.text, display:'grid', placeItems:'center'}}><div style={{textAlign:'center'}}><p role="alert">Холболтоо шалгаад дахин оролдоно уу.</p><button onClick={() => setSessionAttempt(value => value + 1)} style={{padding:'12px 24px', background:D.red, color:D.text, border:0, borderRadius:12}}>Дахин оролдох</button></div></div>

  // LOGIN
  if (!driver) {
    return (
      <div style={{minHeight:'100vh', background:D.bg, display:'flex', flexDirection:'column'}}>
        <div style={{flex:1, padding:'60px 24px 40px'}}>
          <div style={{textAlign:'center', marginBottom:'40px'}}>
            <div style={{fontSize:'48px', marginBottom:'12px'}}>🚛</div>
            <h1 style={{color:D.text, fontSize:'24px', fontWeight:'800', margin:0}}>Ачилт</h1>
            <p style={{color:D.muted, fontSize:'14px', marginTop:'6px'}}>Жолоочийн апп</p>
            {!nativeDriver && <Link href="/driver/app" style={{color:'#ff8078', fontSize:14}}>Android апп татах · Туршилтын хувилбар</Link>}
          </div>
          <input type="tel" placeholder="Утасны дугаар" value={phone} onChange={e => setPhone(e.target.value)}
            style={{width:'100%', borderRadius:'14px', padding:'14px 16px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.text, fontSize:'16px', outline:'none', marginBottom:'12px', boxSizing:'border-box'}}/>
          <input type="password" placeholder="PIN код (4-8 орон)" maxLength={8} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            style={{width:'100%', borderRadius:'14px', padding:'14px 16px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.text, fontSize:'16px', outline:'none', marginBottom:'16px', boxSizing:'border-box'}}/>
          {error && <p style={{color:'#ff6b6b', fontSize:'13px', marginBottom:'12px'}}>⚠️ {error}</p>}
          <button onClick={handleLogin} disabled={loading}
            style={{width:'100%', borderRadius:'14px', padding:'16px', background:D.red, border:'none', color:D.text, fontSize:'16px', fontWeight:'800', cursor:'pointer', boxShadow:'0 6px 25px rgba(232,67,58,0.4)'}}>
            {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх →'}
          </button>
        </div>
        <style>{`input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
      </div>
    )
  }

  // ACCEPTED ORDER MAP эсвэл PAYMENT SCREEN
  if (acceptedOrder || paymentInfo) {
    const safeOrder = acceptedOrder || {}
    const pickup = pickupPoint(safeOrder.from_lat, safeOrder.from_lng)
    const position = pickupPoint(driver.lat, driver.lng)
    const fresh = !locMsg && !error && position && locationIsFresh(driver.location_updated_at)
    return (
      <div style={{minHeight:'100vh', background:D.bg, display:'flex', flexDirection:'column'}}>
        {acceptedOrder && !paymentInfo && <OrderVideoCall key={safeOrder.id} orderId={safeOrder.id} role="driver" phone={safeOrder.user_phone} />}
        <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>{driver.name}</p>
            <p style={{color:'#22c55e', fontSize:'12px', margin:'3px 0 0'}}>{paymentInfo ? 'Админы зөвшөөрөл хүлээж байна' : 'Таны саналыг сонголоо'}</p>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'6px', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'20px', padding:'5px 12px'}}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:D.red, animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'12px', fontWeight:'700'}}>{paymentInfo ? 'ТӨЛБӨР' : fresh ? 'GPS' : 'GPS ХҮЛЭЭЖ БАЙНА'}</span>
          </div>
        </div>
        {!paymentInfo && <div style={{height:'48dvh', minHeight:280}}><OrderConnectionMap key={safeOrder.id} pickup={pickup} driver={position} driverLabel="Та" /></div>}
        <div style={{background:D.bg, borderTop:'1px solid rgba(255,255,255,0.07)', padding:'16px'}}>
          {!paymentInfo && <div style={{background:D.card, border:D.cardBorder, borderRadius:'14px', padding:'14px', marginBottom:'12px'}}>
            <div style={{display:'flex', alignItems:'flex-start', gap:'10px', marginBottom:'8px'}}>
              <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', marginTop:'4px', flexShrink:0}}/>
              <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px', fontWeight:'600'}}>АВАХ ГАЗАР</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'500'}}>{(safeOrder as any).from_address || '-'}</p></div>
            </div>
            <div style={{display:'flex', alignItems:'flex-start', gap:'10px'}}>
              <div style={{width:'8px', height:'8px', borderRadius:'50%', background:D.red, marginTop:'4px', flexShrink:0}}/>
              <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px', fontWeight:'600'}}>ХҮРГЭХ ГАЗАР</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'500'}}>{(safeOrder as any).to_address || '-'}</p></div>
            </div>
          </div>}
          {!paymentInfo && <div className="driver-connection-details">
            <p className="offer-selection-note">{vehicleLabel(safeOrder.car_type)} · {safeOrder.car_mark || 'Машины мэдээлэл оруулаагүй'}</p>
            <p role="status" className="connection-status">✓ Хэрэглэгч таны үнийн саналыг сонгосон</p>
            <div className="driver-connection-price"><strong>{offerPrice(Number(safeOrder.final_price))}</strong><span>{offerDistance(pointDistance(pickup, position))} · шулуун зай</span></div>
            {safeOrder.user_phone ? <a className="connection-call" href={`tel:${safeOrder.user_phone}`}>☎ Хэрэглэгч рүү залгах · {safeOrder.user_phone}</a> : <p className="connection-warning">Хэрэглэгчийн утасны дугаар олдсонгүй.</p>}
            <p className="offer-selection-note">Цэнхэр цэг — ачуулах байршил. Таны байршил хэрэглэгчийн газрын зурагт харагдана.</p>
            {(!fresh || locMsg) && <p className="connection-warning" role="status">{locMsg || 'Байршил шинэчлэгдэхийг хүлээж байна. GPS-ээ зөвшөөрнө үү.'}</p>}
          </div>}
          {paymentInfo ? (
            <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'16px'}}>
              <p style={{color:'white', fontSize:'18px', fontWeight:700, margin:'0 0 8px', textAlign:'center'}}>Захиалга дууссан</p>
              <p style={{color:'#ffd700', fontSize:'14px', margin:'0 0 16px', textAlign:'center'}} role="status">Дараагийн захиалга авахын тулд админы зөвшөөрөл хүлээнэ үү.</p>
              <p style={{color:'white', fontSize:'26px', fontWeight:800, textAlign:'center', margin:'0 0 16px'}}>Шилжүүлэх дүн: {Number(paymentInfo.amount).toLocaleString('mn-MN')} ₮</p>
              <div style={{background:'rgba(232,67,58,0.1)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'12px', padding:'14px', marginBottom:'12px', textAlign:'center'}}>
                <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'0 0 4px'}}>Шилжүүлэх данс</p>
                <p style={{color:'white', fontWeight:'800', fontSize:'18px', margin:'0 0 2px'}}>{bankInfo.bank_name || 'Банк тохируулаагүй'}</p>
                <p style={{color:'#ff6b5b', fontWeight:'800', fontSize:'20px', margin:'0 0 8px', letterSpacing:'2px'}}>{bankInfo.bank_account || 'Админаас данс тохируулна уу'}</p>
                <div style={{borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'10px'}}>
                  <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'0 0 4px'}}>Гүйлгээний утга</p>
                  <p style={{color:'#ffd700', fontWeight:'900', fontSize:'28px', margin:'0 0 4px', letterSpacing:'4px'}}>{paymentInfo.code}</p>
                  <p style={{color:'rgba(255,255,255,0.4)', fontSize:'11px', margin:0}}>Яг энэ 6 оронтой кодыг гүйлгээний утгад бичнэ үү</p>
                </div>
              </div>
              <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', textAlign:'center', margin:'0 0 12px'}}>
                Шилжүүлсний дараа админд мэдэгдэнэ үү. Админ зөвшөөрмөгц захиалгын дэлгэц автоматаар нээгдэнэ.
              </p>
              <button type="button" onClick={() => void fetchOrders()} style={{width:'100%', padding:'12px', borderRadius:'12px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'white', fontSize:14, cursor:'pointer'}}>Зөвшөөрөл шалгах</button>
            </div>
          ) : (
            <button onClick={async () => {
              setCompleting(true)
              try {
                const res = await fetch('/api/payment/complete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ order_id: acceptedOrder?.id })
                })
                const data = await res.json()
                if (!res.ok) { setError(data.error || 'Захиалга дуусгахад алдаа гарлаа'); return }
                if (data.paid) { setAcceptedOrder(null); setPaymentInfo(null); await fetchOrders(); return }
                if (data.code) {
                  const pInfo = { code: data.code, amount: data.amount }
                  setPaymentInfo(pInfo)
                  setAcceptedOrder(null)
                  // Server transaction marks the order completed and driver unavailable atomically.
                  setDriver({ ...driver, available: false })
                }
              } catch { setError('Сүлжээний алдаа. Дахин оролдоно уу.') }
              finally { setCompleting(false) }
            }} disabled={completing} style={{width:'100%', borderRadius:'14px', padding:'13px', background: completing ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(232,67,58,0.3)'}}>
              {completing ? 'Боловсруулж байна...' : 'Захиалга дуусгах'}
            </button>
          )}
          {error && <p role="alert" style={{color:'#ff6b6b'}}>{error}</p>}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style>
      </div>
    )
  }

  return <DriverDispatchView
    driver={driver} orders={orders} locating={locating} locationMessage={locMsg} error={error}
    newOrderAlert={newOrderAlert} nativeDriver={nativeDriver} pushReady={pushReady}
    notificationsDenied={notifStatus === 'denied'} sentOffers={sentOffers} sendingOffer={sendingOffer}
    onToggleAvailable={toggleAvailable} onSubscribe={subscribeNotification}
    onProfile={() => router.push('/driver/profile')} onOffer={sendOffer}
  />
}
