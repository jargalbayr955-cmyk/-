'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createDotMarker, createTruckMarker, freeMapStyle, loadFreeMap } from '@/lib/client/free-map'
import { isNativeDriver } from '@/lib/client/native-driver'
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
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [locMsg, setLocMsg] = useState('')
  const offerPricesRef = useRef<{[key: string]: string}>({})
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

  const [bankInfo, setBankInfo] = useState({ bank_name: '', bank_account: '', automatic_confirmation: false })
  const prevOrderIds = useRef<string[]>([])
  const ordersLoaded = useRef(false)
  const ordersLoading = useRef(false)
  const driverRef = useRef<any>(null)
  const acceptedOrderRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const lineRef = useRef<any>(null)
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
      const res = await fetch('/api/driver/orders', { cache: 'no-store' })
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
      setAcceptedOrder(body.acceptedOrder || null)
      setPaymentInfo(body.pendingPayment || null)
      localStorage.removeItem('accepted_order'); localStorage.removeItem('payment_info')
      if (driverRef.current && typeof body.available === 'boolean') {
        const position = body.driverLocation
        setDriver((d:any) => d ? ({...d, available: body.available, ...(isNativeDriver() && position ? position : {})}) : d)
        if (isNativeDriver() && typeof position?.lat === 'number' && typeof position?.lng === 'number') {
          driverRef.current = { ...driverRef.current, ...position }
          driverMarkerRef.current?.setLngLat([position.lng, position.lat])
          const order = acceptedOrderRef.current
          if (order) mapInstanceRef.current?.getSource?.('accepted-route')?.setData?.({type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:[[position.lng,position.lat],[Number(order.from_lng),Number(order.from_lat)]]}})
        }
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

  const updateLocation = () => {
    if (!driver) return
    if (isNativeDriver()) return
    if (!navigator.geolocation) return setLocMsg('Энэ browser байршил дэмжихгүй байна')
    setLocating(true)
    setLocMsg('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
        const res = await fetch('/api/driver/location', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, available: true })
        })
        const body = await res.json()
        if (!res.ok) { setLocMsg(body.error || 'Байршил хадгалахад алдаа гарлаа'); return }
        setDriver((d:any) => d ? ({ ...d, lat: pos.coords.latitude, lng: pos.coords.longitude, available: body.available }) : d)
        setLocMsg('Байршил шинэчлэгдлээ!')
        } catch { setLocMsg('Сүлжээний алдаа. Дахин оролдоно уу.') }
        finally { setLocating(false) }
      },
      () => { setLocMsg('Байршил тогтоох боломжгүй'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    )
  }

  // driverRef-г driver state-тай sync хийх
  useEffect(() => {
    driverRef.current = driver
  }, [driver])

  useEffect(() => {
    acceptedOrderRef.current = acceptedOrder
  }, [acceptedOrder])


  useEffect(() => {
    if (!driver?.id) return
    fetch('/api/driver/payment-settings', { cache: 'no-store' })
      .then(async r => r.ok ? r.json() : null)
      .then(body => { if (body) setBankInfo({ bank_name: body.bank_name || '', bank_account: body.bank_account || '', automatic_confirmation: body.automatic_confirmation === true }) })
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

  // Browser буцах товч блоклох
  useEffect(() => {
    const handlePopState = () => {
      // Буцах товч дарахад driver хуудас дээр л үлдэх
      window.history.pushState(null, '', '/driver')
    }
    window.history.pushState(null, '', '/driver')
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!driver?.id || !navigator.geolocation || isNativeDriver()) return
    let lastSentAt = 0
    let cancelled = false
    const onPosition = async (pos: GeolocationPosition) => {
      if (cancelled) return
      const now = Date.now(), lat = pos.coords.latitude, lng = pos.coords.longitude
      if (now - lastSentAt < 15000) return
      lastSentAt = now
      driverRef.current = { ...driverRef.current, lat, lng }
      if (driverMarkerRef.current) driverMarkerRef.current.setLngLat([lng, lat])
      const activeOrder = acceptedOrderRef.current
      const routeSource = mapInstanceRef.current?.getSource?.('accepted-route')
      if (routeSource?.setData && activeOrder?.from_lat && activeOrder?.from_lng) routeSource.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[lng,lat],[Number(activeOrder.from_lng),Number(activeOrder.from_lat)]]}})
      try {
        const response = await fetch('/api/driver/location', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lat, lng }) })
        if (!response.ok && !cancelled) setLocMsg('Байршил серверт шинэчлэгдээгүй байна')
      } catch { if (!cancelled) setLocMsg('Сүлжээ тасарсан: байршил шинэчлэгдээгүй') }
    }
    const options = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    const onError = () => { if (!cancelled) setLocMsg('GPS байршлаа зөвшөөрч, дахин шинэчилнэ үү') }
    const watchId = navigator.geolocation.watchPosition(onPosition, onError, options)
    // Stationary drivers also need fresh GPS within the dispatch two-minute window.
    const refresh = () => { if (document.visibilityState === 'visible') navigator.geolocation.getCurrentPosition(onPosition, onError, options) }
    const heartbeat = setInterval(refresh, 45000)
    document.addEventListener('visibilitychange', refresh)
    return () => { cancelled = true; clearInterval(heartbeat); navigator.geolocation.clearWatch(watchId); document.removeEventListener('visibilitychange', refresh) }
  }, [driver?.id])

  useEffect(() => {
    if (!acceptedOrder?.id || !mapRef.current || mapInstanceRef.current) return
    const order=acceptedOrderRef.current
    if(!order)return
    let cancelled=false
    const timer=setTimeout(()=>{
      ;(async()=>{
        try{
          const ml=await loadFreeMap()
          if(cancelled||!mapRef.current)return
          const userLat=Number(order.from_lat),userLng=Number(order.from_lng)
          const drvLat=Number(driverRef.current?.lat)||userLat,drvLng=Number(driverRef.current?.lng)||userLng
          const map=new ml.Map({container:mapRef.current,style:freeMapStyle(),center:[userLng||106.9177,userLat||47.9184],zoom:13,attributionControl:{}})
          map.addControl(new ml.NavigationControl({showCompass:false}),'top-right')
          userMarkerRef.current=new ml.Marker({element:createDotMarker('#2563eb',18,'Хэрэглэгч')}).setLngLat([userLng,userLat]).addTo(map)
          driverMarkerRef.current=new ml.Marker({element:createTruckMarker('Та')}).setLngLat([drvLng,drvLat]).addTo(map)
          const routeData={type:'Feature' as const,properties:{},geometry:{type:'LineString' as const,coordinates:[[drvLng,drvLat],[userLng,userLat]]}}
          map.on('load',()=>{
            if(!map.getSource('accepted-route')){
              map.addSource('accepted-route',{type:'geojson',data:routeData})
              map.addLayer({id:'accepted-route-line',type:'line',source:'accepted-route',paint:{'line-color':'#e8433a','line-width':4,'line-opacity':.9,'line-dasharray':[2,2]}})
            }
          })
          const bounds=new ml.LngLatBounds();bounds.extend([drvLng,drvLat]);bounds.extend([userLng,userLat]);map.fitBounds(bounds,{padding:60,maxZoom:16,duration:400})
          mapInstanceRef.current=map
          lineRef.current='accepted-route'
        }catch(error){console.error('Map initialization failed',error)}
      })()
    },250)
    return()=>{cancelled=true;clearTimeout(timer);driverMarkerRef.current?.remove?.();userMarkerRef.current?.remove?.();mapInstanceRef.current?.remove?.();mapInstanceRef.current=null;driverMarkerRef.current=null;userMarkerRef.current=null;lineRef.current=null}
  }, [acceptedOrder?.id])

  useEffect(() => {
    if (!acceptedOrder && mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
      driverMarkerRef.current?.remove?.()
      userMarkerRef.current?.remove?.()
      driverMarkerRef.current = null
      userMarkerRef.current = null
      lineRef.current = null
    }
  }, [acceptedOrder])

  const toggleAvailable = async () => {
    if (isNativeDriver()) return
    try {
    const newVal = !driver.available
    const res = await fetch('/api/driver/availability', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ available: newVal }) })
    if (res.ok) setDriver({ ...driver, available: newVal })
    else { const body = await res.json().catch(()=>({})); alert(body.error || 'Төлөв өөрчлөхөд алдаа гарлаа') }
    } catch { alert('Сүлжээний алдаа. Дахин оролдоно уу.') }
  }

  const sendOffer = async (order: any) => {
    const price = offerPricesRef.current[order.id]
    if (!price) return alert('Үнэ оруулна уу')
    setSendingOffer(order.id)
    try {
    const getPos = (): Promise<{lat: number, lng: number} | null> => new Promise((resolve) => {
      if (!navigator.geolocation || isNativeDriver()) return resolve(null)
      navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => resolve(null), { timeout: 5000 })
    })
    const pos = await getPos()
    const res = await fetch('/api/driver/offer', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ order_id: order.id, price: parseInt(price), driver_lat: pos?.lat, driver_lng: pos?.lng })
    })
    if (!res.ok) { const body = await res.json().catch(()=>({})); alert(body.error || 'Санал илгээхэд алдаа гарлаа'); setSendingOffer(null); return }
    if (pos) setDriver({ ...driver, lat: pos.lat, lng: pos.lng })
    setSentOffers(prev => ({ ...prev, [order.id]: true }))
    } catch { alert('Сүлжээний алдаа. Санал илгээгдээгүй байна.') }
    finally { setSendingOffer(null) }
  }

  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return null
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2)
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
  }

  useEffect(() => {
    if (!driver?.id) return
    fetchOrders()
    // Push handles immediate delivery. This is only a low-frequency fallback if push is unavailable.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders()
    }, 15_000)
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
    return (
      <div style={{minHeight:'100vh', background:D.bg, display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>{driver.name}</p>
            <p style={{color:'#22c55e', fontSize:'12px', margin:'3px 0 0'}}>{paymentInfo ? 'Төлбөр хүлээгдэж байна' : 'Захиалга хүлээн авсан'}</p>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'6px', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'20px', padding:'5px 12px'}}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:D.red, animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'12px', fontWeight:'700'}}>LIVE</span>
          </div>
        </div>
        {!paymentInfo && <div ref={mapRef} style={{flex:1, minHeight:'400px'}}/>}
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
          {paymentInfo ? (
            <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'16px'}}>
              <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'0 0 12px', textAlign:'center'}}>Төлбөрийн мэдээлэл</p>
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
                {bankInfo.automatic_confirmation ? 'Төлбөр баталгаажсаны дараа дахин захиалга авах боломжтой болно' : 'Шилжүүлсний дараа админтай холбогдож төлбөрөө баталгаажуулна уу'}
              </p>

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

  // MAIN
  return (
    <div style={{minHeight:'100vh', background:D.bg, paddingBottom:'24px'}}>
      {newOrderAlert && (
        <div style={{position:'fixed', top:'16px', left:'50%', transform:'translateX(-50%)', zIndex:50, background:D.red, color:D.text, padding:'12px 24px', borderRadius:'20px', fontSize:'14px', fontWeight:'700', boxShadow:'0 4px 20px rgba(232,67,58,0.5)', animation:'bounce 0.5s ease infinite alternate'}}>
          🚛 Шинэ захиалга ирлээ!
        </div>
      )}

      {/* Header */}
      <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>{driver.name}</p>
          <p style={{color:D.muted, fontSize:'12px', margin:'3px 0 0'}}>{driver.car_type}</p>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          {!nativeDriver && <button onClick={toggleAvailable} style={{borderRadius:'20px', padding:'7px 14px', fontSize:'12px', fontWeight:'700', cursor:'pointer', border: driver.available ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)', background: driver.available ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)', color: driver.available ? '#22c55e' : D.muted}}>
            {driver.available ? '🟢 Ажиллаж байна' : '⚫ Амарч байна'}
          </button>}
          {!nativeDriver && <button onClick={subscribeNotification} style={{
            borderRadius:'20px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer',
            background: pushReady ? 'rgba(34,197,94,0.12)' : 'rgba(232,67,58,0.12)',
            border: pushReady ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(232,67,58,0.3)',
            color: pushReady ? '#22c55e' : '#ff6b5b'
          }}>
            {pushReady ? '🔔 Асаалттай' : notifStatus === 'denied' ? '🔕 Зөвшөөрөл хаалттай' : '🔕 Мэдэгдэл авах'}
          </button>}
          <button onClick={() => router.push('/driver/profile')} style={{width:'36px', height:'36px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.muted, fontSize:'16px', cursor:'pointer'}}>👤</button>
        </div>
      </div>

      <div style={{padding:'16px'}}>
        {error && <p role="alert" style={{color:'#ff6b6b'}}>{error}</p>}
        {!driver.car_type && <button onClick={() => router.push('/driver/profile')} style={{color:'white', background:D.red, padding:'12px', marginBottom:'16px', borderRadius:'12px'}}>Эхлээд профайлдаа машины төрлөө сонгоно уу →</button>}
        {/* Байршил */}
        {!nativeDriver && <div style={{background:D.card, border:D.cardBorder, borderRadius:'16px', padding:'16px', marginBottom:'16px'}}>
          <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:'0 0 12px'}}>📍 Байршил шинэчлэх</p>
          <p style={{color:D.muted, fontSize:'12px'}}>Захиалга хүлээхдээ энэ хуудсаа нээлттэй байлгаж, GPS байршлаа зөвшөөрнө үү.</p>
          <p><Link href="/driver/app" style={{color:'#ff8078', fontSize:13}}>Дэлгэц түгжээтэй ажиллах Android апп →</Link></p>
          <button onClick={updateLocation} disabled={locating} style={{width:'100%', borderRadius:'12px', padding:'12px', background: locating ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(232,67,58,0.3)'}}>
            {locating ? 'Байршил тогтоож байна...' : 'Одоогийн байршил илгээх'}
          </button>
          {locMsg && <p style={{color:'#22c55e', fontSize:'12px', textAlign:'center', marginTop:'8px'}}>{locMsg}</p>}
          {driver.lat && <p style={{color:D.muted, fontSize:'12px', textAlign:'center', marginTop:'4px'}}>📍 {driver.lat?.toFixed(4)}, {driver.lng?.toFixed(4)}</p>}
        </div>}

        {/* Захиалгууд */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
          <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:0}}>Захиалгууд <span style={{color:D.red}}>({orders.length})</span></p>
          <button onClick={fetchOrders} style={{background:'transparent', border:'none', color:D.red, fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>↺ Шинэчлэх</button>
        </div>

        {orders.length === 0 ? (
          <div style={{background:D.card, border:D.cardBorder, borderRadius:'16px', padding:'40px 16px', textAlign:'center'}}>
            <div style={{fontSize:'40px', marginBottom:'12px'}}>⏳</div>
            <p style={{color:D.muted, fontSize:'14px', margin:0}}>Одоогоор захиалга байхгүй</p>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
            {orders.map((o) => {
              const dist = getDistance(driver.lat, driver.lng, o.from_lat, o.from_lng)
              return (
                <div key={o.id} style={{background:D.card, border:D.cardBorder, borderRadius:'16px', padding:'16px'}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
                    <span style={{background:'rgba(232,67,58,0.15)', color:'#ff6b5b', borderRadius:'10px', padding:'4px 10px', fontSize:'11px', fontWeight:'700'}}>🆕 Шинэ</span>
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                      {dist && <span style={{color:'#3b82f6', fontSize:'12px', fontWeight:'600'}}>📍 {dist} км</span>}
                      <span style={{color:D.muted, fontSize:'12px'}}>{new Date(o.created_at).toLocaleTimeString('mn-MN', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                  </div>
                  {o.car_type && <p style={{color:'rgba(255,200,0,0.7)', fontSize:'12px', margin:'0 0 10px', fontWeight:'600'}}>
                      🚛 {o.car_type === 'butten' ? 'Бүтэн ачигч' : o.car_type === 'chiregch' ? 'Чирэгч' : o.car_type}
                      {o.car_mark ? ` · ${o.car_mark}` : ''}
                    </p>}
                  <div style={{background:'rgba(255,255,255,0.03)', borderRadius:'12px', padding:'12px', marginBottom:'12px'}}>
                    <div style={{display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'8px'}}>
                      <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', marginTop:'4px', flexShrink:0}}/>
                      <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px'}}>Авах газар</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'600'}}>{o.from_address || 'GPS байршил'}</p></div>
                    </div>
                    <div style={{display:'flex', alignItems:'flex-start', gap:'8px'}}>
                      <div style={{width:'8px', height:'8px', borderRadius:'50%', background:D.red, marginTop:'4px', flexShrink:0}}/>
                      <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px'}}>Хүргэх газар</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'600'}}>{o.to_address || '-'}</p></div>
                    </div>
                  </div>
                  {o.has_offered || sentOffers[o.id] ? (
                    <div style={{background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'12px', padding:'12px', textAlign:'center'}}>
                      <p style={{color:'#22c55e', fontSize:'14px', fontWeight:'700', margin:0}}>✅ Санал илгээгдлээ!</p>
                    </div>
                  ) : (
                    <div style={{display:'flex', gap:'8px'}}>
                      <input type="number" placeholder="Үнэ оруулна уу (₮)" defaultValue={''} onChange={e => {
                          offerPricesRef.current[o.id] = e.target.value
                        }}
                        style={{flex:1, borderRadius:'12px', padding:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.text, fontSize:'14px', outline:'none'}}/>
                      <button onClick={() => sendOffer(o)} disabled={sendingOffer === o.id}
                        style={{borderRadius:'12px', padding:'12px 16px', background: sendingOffer === o.id ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer'}}>
                        {sendingOffer === o.id ? '...' : 'Илгээх'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`
        input::placeholder{color:rgba(255,255,255,0.2);}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}
        @keyframes bounce{from{transform:translateX(-50%) translateY(0)}to{transform:translateX(-50%) translateY(-4px)}}
      `}</style>
    </div>
  )
}
