'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type DriverSlot = {
  invite_id: string
  driver_id: string
  rank: number
  invite_status: 'active' | 'offered'
  invited_at: string
  expires_at: string
  driver_name: string | null
  car_type: string | null
  lat: number | null
  lng: number | null
  distance_km: number | null
  offer: { id: string; price: number } | null
}

type SortMode = 'nearest' | 'cheapest'

export default function DriversPage() {
  const [slots, setSlots] = useState<DriverSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('nearest')
  const [dots, setDots] = useState('.')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [invitedCount, setInvitedCount] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(600)
  const [retrying, setRetrying] = useState(false)
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const driverMarkersRef = useRef<Map<string, any>>(new Map())
  const seenOfferIdsRef = useRef<Set<string>>(new Set())
  const initialOfferSnapshotRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const oid = localStorage.getItem('current_order_id')
    setOrderId(oid)
    setFromAddress(localStorage.getItem('fromAddress') || localStorage.getItem('from') || '')
    setToAddress(localStorage.getItem('dest') || '')
    const lat = Number(localStorage.getItem('fromLat'))
    const lng = Number(localStorage.getItem('fromLng'))
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      setUserLat(lat); setUserLng(lng)
    } else {
      navigator.geolocation.getCurrentPosition(p => { setUserLat(p.coords.latitude); setUserLng(p.coords.longitude) }, () => {})
    }
  }, [])

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left <= 0) setExpired(true)
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [expiresAt])

  const playOfferAlert = useCallback(() => {
    try {
      if ('vibrate' in navigator) navigator.vibrate([250, 120, 250])
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = audioContextRef.current || (Ctx ? new Ctx() : null)
      if (ctx) {
        audioContextRef.current = ctx
        if (ctx.state === 'suspended') ctx.resume().catch(()=>{})
        const now = ctx.currentTime
        ;[880, 1040].forEach((freq, i) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain()
          osc.type = 'sine'; osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, now + i*0.2)
          gain.gain.exponentialRampToValueAtTime(0.18, now + i*0.2 + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i*0.2 + 0.17)
          osc.connect(gain); gain.connect(ctx.destination); osc.start(now + i*0.2); osc.stop(now + i*0.2 + 0.18)
        })
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚛 Шинэ үнийн санал', { body: 'Ачигч жолооч үнийн санал илгээлээ.' })
      }
    } catch {}
  }, [])

  const enableAlerts = async () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (Ctx && !audioContextRef.current) audioContextRef.current = new Ctx()
      if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume()
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
      if ('vibrate' in navigator) navigator.vibrate(80)
      setAlertsEnabled(true)
    } catch { setAlertsEnabled(true) }
  }

  const fetchSlots = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await fetch('/api/order/slots', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({order_id:orderId}), cache:'no-store' })
      if (!res.ok) return
      const body = await res.json()
      if (body.order_status && body.order_status !== 'pending') {
        if (body.selected_driver_id) { localStorage.setItem('tracking_driver_id', body.selected_driver_id); router.replace('/tracking') }
        return
      }
      const nextSlots: DriverSlot[] = Array.isArray(body.slots) ? body.slots : []
      setInvitedCount(Number(body.invited_count || 0))
      if (body.bidding_expires_at) setExpiresAt(body.bidding_expires_at)
      setExpired(Boolean(body.expired))

      const offerIds = nextSlots.filter(s=>s.offer).map(s=>s.offer!.id)
      if (!initialOfferSnapshotRef.current) {
        seenOfferIdsRef.current = new Set(offerIds)
        initialOfferSnapshotRef.current = true
      } else {
        const hasNew = offerIds.some(id => !seenOfferIdsRef.current.has(id))
        offerIds.forEach(id => seenOfferIdsRef.current.add(id))
        if (hasNew && alertsEnabled) playOfferAlert()
      }
      setSlots(nextSlots); setLoading(false)
    } catch {}
  }, [orderId, router, alertsEnabled, playOfferAlert])

  useEffect(() => {
    if (!orderId) return
    fetchSlots()
    const interval = setInterval(() => { if (document.visibilityState === 'visible') fetchSlots() }, 4_000)
    return () => clearInterval(interval)
  }, [orderId, fetchSlots])

  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null || mapInstanceRef.current) return
    const link = document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link)
    import('leaflet').then(L => {
      const Leaflet=L.default; const map=Leaflet.map(mapRef.current!,{zoomControl:true}).setView([userLat,userLng],14)
      const token=process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const tile=token ? Leaflet.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${token}`,{attribution:'© Mapbox © OpenStreetMap',tileSize:512,zoomOffset:-1,maxZoom:19}) : Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19})
      tile.addTo(map)
      const userIcon=Leaflet.divIcon({html:'<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''})
      userMarkerRef.current=Leaflet.marker([userLat,userLng],{icon:userIcon}).addTo(map).bindTooltip('Таны байршил'); mapInstanceRef.current=map
    })
    const markerStore=driverMarkersRef.current
    return()=>{if(mapInstanceRef.current)mapInstanceRef.current.remove();mapInstanceRef.current=null;markerStore.clear()}
  },[userLat,userLng])

  const offers = useMemo(() => {
    const list=slots.filter(s=>s.offer)
    return [...list].sort((a,b)=>sortMode==='cheapest'?(a.offer?.price||Infinity)-(b.offer?.price||Infinity):(a.distance_km??Infinity)-(b.distance_km??Infinity))
  },[slots,sortMode])

  useEffect(() => {
    if (!mapInstanceRef.current) return
    let cancelled=false
    import('leaflet').then(L=>{
      if(cancelled)return
      const Leaflet=L.default, liveIds=new Set<string>(), bounds:[number,number][]=[]
      if(userLat!=null&&userLng!=null)bounds.push([userLat,userLng])
      offers.forEach(slot=>{
        if(slot.lat==null||slot.lng==null)return
        liveIds.add(slot.driver_id); bounds.push([slot.lat,slot.lng])
        const priceText=`₮${slot.offer!.price.toLocaleString()}`, kmText=slot.distance_km!=null?`${slot.distance_km} км`:''
        const html=`<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-2px)"><div style="font-size:30px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.55))">🚛</div><div style="margin-top:2px;background:#e8433a;color:white;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:3px 7px;white-space:nowrap;font-size:11px;font-weight:800;box-shadow:0 3px 12px rgba(0,0,0,.35)">${priceText} · ${kmText}</div></div>`
        const icon=Leaflet.divIcon({html,iconSize:[110,55],iconAnchor:[55,27],className:''}), existing=driverMarkersRef.current.get(slot.driver_id)
        if(existing){existing.setLatLng([slot.lat,slot.lng]);existing.setIcon(icon)}else{const marker=Leaflet.marker([slot.lat,slot.lng],{icon}).addTo(mapInstanceRef.current);marker.bindPopup(`${priceText} · ${kmText}`);driverMarkersRef.current.set(slot.driver_id,marker)}
      })
      for(const [driverId,marker] of driverMarkersRef.current.entries()){if(!liveIds.has(driverId)){marker.remove();driverMarkersRef.current.delete(driverId)}}
      if(bounds.length>1)mapInstanceRef.current.fitBounds(Leaflet.latLngBounds(bounds),{padding:[45,45],maxZoom:15})
    })
    return()=>{cancelled=true}
  },[offers,userLat,userLng])

  const acceptOffer=async(slot:DriverSlot)=>{
    if(!orderId||!slot.offer||expired)return
    setAccepting(slot.offer.id)
    try{
      const res=await fetch('/api/order/accept-offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,offer_id:slot.offer.id})})
      const body=await res.json().catch(()=>({}))
      if(!res.ok){alert(body.error||'Энэ санал сонгох боломжгүй болсон байна');await fetchSlots();return}
      localStorage.setItem('tracking_driver_id',slot.driver_id);router.push('/tracking')
    }finally{setAccepting(null)}
  }

  const retrySearch=async()=>{
    if(!orderId||retrying)return
    setRetrying(true)
    try{
      const res=await fetch('/api/order/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId})})
      const body=await res.json().catch(()=>({}))
      if(!res.ok){alert(body.error||'Дахин хайлт эхлүүлэхэд алдаа гарлаа');return}
      const newId=body.order?.id
      if(!newId)return
      localStorage.setItem('current_order_id',newId)
      setOrderId(newId); setSlots([]); setExpired(false); setInvitedCount(Number(body.invited_count||0)); setExpiresAt(body.bidding_expires_at||null); setLoading(true); setSecondsLeft(600)
      seenOfferIdsRef.current.clear(); initialOfferSnapshotRef.current=false
    }finally{setRetrying(false)}
  }

  const mm=String(Math.floor(secondsLeft/60)).padStart(2,'0'), ss=String(secondsLeft%60).padStart(2,'0')

  return <div style={{minHeight:'100vh',background:'#060608',color:'white'}}>
    <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,.08)'}}>
      <button onClick={()=>router.back()} style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:20,padding:'7px 12px',color:'white'}}>← Буцах</button>
      <div style={{flex:1}}><div style={{fontWeight:800}}>Ойрын 8 ачигч</div><div style={{fontSize:12,color:'rgba(255,255,255,.45)',marginTop:2}}>{expired?'10 минутын хайлт дууссан':offers.length?`${offers.length} үнийн санал ирсэн`:`Үнийн санал хүлээж байна${dots}`}</div></div>
      <div style={{textAlign:'right'}}><div style={{fontSize:13,color:expired?'#ff7a70':'white',fontWeight:900}}>{expired?'ДУУССАН':`${mm}:${ss}`}</div><div style={{fontSize:11,color:'rgba(255,255,255,.4)'}}>{invitedCount}/8 жолооч</div></div>
    </div>

    <div ref={mapRef} style={{height:'45vh',minHeight:320,background:'#111'}}/>

    <div style={{padding:16}}>
      {!alertsEnabled && !expired && <button onClick={enableAlerts} style={{width:'100%',marginBottom:12,borderRadius:12,padding:'11px 12px',border:'1px solid rgba(59,130,246,.35)',background:'rgba(59,130,246,.12)',color:'white',fontWeight:800}}>🔔 Үнэ ирэхэд дуу + чичиргээ асаах</button>}

      <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:14,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,color:'rgba(255,255,255,.4)'}}>АВАХ ГАЗАР</div><div style={{fontSize:13,marginTop:3}}>{fromAddress||'GPS байршил'}</div>
        <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginTop:9}}>ХҮРЭХ ГАЗАР</div><div style={{fontSize:13,marginTop:3}}>{toAddress||'-'}</div>
      </div>

      {expired ? <div style={{background:'rgba(232,67,58,.08)',border:'1px solid rgba(232,67,58,.25)',borderRadius:16,padding:18,textAlign:'center'}}>
        <div style={{fontWeight:900,fontSize:16}}>10 минутын хайлт дууслаа</div>
        <div style={{fontSize:13,color:'rgba(255,255,255,.55)',marginTop:7}}>Шинэ хайлт эхлүүлэхэд тухайн үеийн хамгийн ойр 8 жолоочид дахин мэдээлэл очно.</div>
        <button onClick={retrySearch} disabled={retrying} style={{width:'100%',marginTop:14,border:0,borderRadius:12,padding:13,background:'#e8433a',color:'white',fontWeight:900,opacity:retrying ? .65 : 1}}>{retrying?'Дахин хайж байна...':'🔄 Дахин машин хайх'}</button>
      </div> : <>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <button onClick={()=>setSortMode('nearest')} style={{flex:1,borderRadius:12,padding:'10px 8px',border:sortMode==='nearest'?'1px solid #e8433a':'1px solid rgba(255,255,255,.08)',background:sortMode==='nearest'?'rgba(232,67,58,.14)':'rgba(255,255,255,.04)',color:'white',fontWeight:700}}>📍 Хамгийн ойр</button>
          <button onClick={()=>setSortMode('cheapest')} style={{flex:1,borderRadius:12,padding:'10px 8px',border:sortMode==='cheapest'?'1px solid #e8433a':'1px solid rgba(255,255,255,.08)',background:sortMode==='cheapest'?'rgba(232,67,58,.14)':'rgba(255,255,255,.04)',color:'white',fontWeight:700}}>₮ Хамгийн хямд</button>
        </div>
        {loading?<div style={{textAlign:'center',padding:30,color:'rgba(255,255,255,.45)'}}>Ойрын жолооч нарыг хайж байна{dots}</div>:offers.length===0?<div style={{background:'rgba(255,255,255,.03)',borderRadius:14,padding:18,textAlign:'center',color:'rgba(255,255,255,.5)',fontSize:13}}>Тухайн үеийн хамгийн ойр {invitedCount} жолоочид мэдээлэл очсон. 10 минутын дотор үнэ ирвэл газрын зураг дээр үнэ, км, жолоочийн мэдээлэл гарна.</div>:<div style={{display:'flex',flexDirection:'column',gap:10}}>{offers.map((slot,idx)=><div key={slot.driver_id} style={{background:'rgba(255,255,255,.045)',border:'1px solid rgba(255,255,255,.08)',borderRadius:16,padding:14}}><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{fontSize:32}}>🚛</div><div style={{flex:1}}><div style={{fontSize:14,fontWeight:800}}>{slot.driver_name||`Ачигч ${idx+1}`}</div><div style={{fontSize:12,color:'rgba(255,255,255,.45)',marginTop:3}}>📍 {slot.distance_km??'-'} км зайтай</div></div><div style={{fontSize:19,fontWeight:900}}>₮{slot.offer!.price.toLocaleString()}</div></div><button disabled={!!accepting} onClick={()=>acceptOffer(slot)} style={{width:'100%',marginTop:12,border:0,borderRadius:12,padding:12,background:'#e8433a',color:'white',fontWeight:800,cursor:'pointer',opacity:accepting ? .65 : 1}}>{accepting===slot.offer!.id?'Сонгож байна...':'Энэ ачигчийг сонгох'}</button></div>)}</div>}
      </>}
    </div>
  </div>
}
