'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDotMarker, freeMapStyle, loadFreeMap, ULAANBAATAR } from '@/lib/client/free-map'

type Point = { lat:number; lng:number }

export default function ManualPage() {
  const [pickup, setPickup] = useState<Point | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [carType, setCarType] = useState('')
  const [carMark, setCarMark] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mapError, setMapError] = useState('')
  const [errors, setErrors] = useState<{pickup?:boolean,to?:boolean,carType?:boolean,carMark?:boolean}>({})
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const router = useRouter()

  const putMarker = (lat:number,lng:number,fly=false) => {
    const map = mapInstanceRef.current
    const ml = window.maplibregl
    if (!map || !ml) return
    if (!markerRef.current) {
      markerRef.current = new ml.Marker({element:createDotMarker('#e8433a',22),draggable:true}).setLngLat([lng,lat]).addTo(map)
      markerRef.current.on('dragend',()=>{
        const p=markerRef.current.getLngLat()
        setPickup({lat:p.lat,lng:p.lng})
        setErrors(e=>({...e,pickup:false}))
      })
    } else markerRef.current.setLngLat([lng,lat])
    setPickup({lat,lng})
    setErrors(e=>({...e,pickup:false}))
    if(fly) map.easeTo({center:[lng,lat],zoom:15,duration:500})
  }

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      try{
        const ml=await loadFreeMap()
        if(cancelled||!mapRef.current)return
        const map=new ml.Map({container:mapRef.current,style:freeMapStyle(),center:[ULAANBAATAR.lng,ULAANBAATAR.lat],zoom:11.5,attributionControl:{}})
        map.addControl(new ml.NavigationControl({showCompass:false}),'top-right')
        map.on('click',(e:any)=>putMarker(e.lngLat.lat,e.lngLat.lng))
        map.on('error',()=>setMapError('Газрын зураг ачаалахад түр алдаа гарлаа'))
        mapInstanceRef.current=map
      }catch(error){console.error('Map initialization failed',error);setMapError('Газрын зураг ачаалагдсангүй. Интернэтээ шалгана уу.')}
    })()
    return()=>{cancelled=true;markerRef.current?.remove?.();markerRef.current=null;mapInstanceRef.current?.remove?.();mapInstanceRef.current=null}
  },[])

  const useMyLocation=()=>{
    if(!navigator.geolocation)return
    navigator.geolocation.getCurrentPosition(p=>putMarker(p.coords.latitude,p.coords.longitude,true),()=>setError('GPS байршил авах боломжгүй байна'),{enableHighAccuracy:true,timeout:10000,maximumAge:15000})
  }

  const handleSearch = async () => {
    if(loading)return
    const next:any={}
    if(!pickup) next.pickup=true
    if(!to.trim()) next.to=true
    if(!carType) next.carType=true
    if(!carMark.trim()) next.carMark=true
    setErrors(next)
    if(Object.keys(next).length){setError(!pickup?'Газрын зураг дээр ачих цэгээ сонгоно уу':'Мэдээллээ бүрэн бөглөнө үү');return}

    setLoading(true);setError('')
    const coords=`${pickup!.lat.toFixed(5)}, ${pickup!.lng.toFixed(5)}`
    const fromAddress=from.trim()?`${from.trim()} (${coords})`:`Газрын зураг дээр сонгосон цэг (${coords})`
    try{
      const res=await fetch('/api/order/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from_address:fromAddress,to_address:to.trim(),car_type:carType,car_mark:carMark.trim(),from_lat:pickup!.lat,from_lng:pickup!.lng})})
      const body=await res.json().catch(()=>({}))
      if(!res.ok||!body.order?.id){setError(body.error||'Захиалга үүсгэхэд алдаа гарлаа');if(res.status===401)router.push('/login');return}
      localStorage.setItem('fromAddress',fromAddress)
      localStorage.setItem('fromLat',String(pickup!.lat));localStorage.setItem('fromLng',String(pickup!.lng));localStorage.setItem('dest',to.trim());localStorage.setItem('current_order_id',body.order.id)
      router.push('/drivers')
    }catch{setError('Сүлжээний алдаа. Дахин оролдоно уу.')}finally{setLoading(false)}
  }

  const D={bg:'#0a0a0f',card:'rgba(255,255,255,.04)',text:'white',muted:'rgba(255,255,255,.42)',red:'#e8433a'}
  return <div style={{minHeight:'100vh',background:D.bg,color:'white'}}>
    <div style={{position:'relative',height:'48vh',minHeight:340}}>
      <div ref={mapRef} style={{position:'absolute',inset:0}}/>
      <button onClick={()=>router.back()} style={{position:'absolute',top:14,left:14,zIndex:10,borderRadius:22,padding:'8px 14px',background:'rgba(8,10,16,.86)',border:'1px solid rgba(255,255,255,.12)',color:'white',fontWeight:700}}>← Буцах</button>
      <button onClick={useMyLocation} style={{position:'absolute',right:14,bottom:18,zIndex:10,borderRadius:22,padding:'10px 14px',background:'#e8433a',border:0,color:'white',fontWeight:800}}>◎ Миний байршил</button>
      <div style={{position:'absolute',left:'50%',top:14,transform:'translateX(-50%)',zIndex:10,background:'rgba(8,10,16,.86)',border:'1px solid rgba(255,255,255,.12)',borderRadius:20,padding:'7px 12px',fontSize:12,whiteSpace:'nowrap'}}>📍 Map дээр дарж эсвэл тэмдэглэгээг чирж ачих цэгээ сонгоно</div>
      {mapError&&<div style={{position:'absolute',inset:0,zIndex:9,display:'grid',placeItems:'center',background:'rgba(8,10,16,.82)',padding:24,textAlign:'center'}}>{mapError}</div>}
    </div>

    <div style={{maxWidth:720,margin:'0 auto',padding:'18px 16px 32px'}}>
      <h1 style={{fontSize:22,margin:'0 0 5px'}}>Өөр газраас машин ачуулах</h1>
      <p style={{color:D.muted,fontSize:13,margin:'0 0 16px'}}>Таны байгаа газраас өөр газар байгаа машины ачих цэгийг map дээр сонгоно.</p>

      <div style={{background:errors.pickup?'rgba(232,67,58,.08)':D.card,border:`1px solid ${errors.pickup?'rgba(232,67,58,.55)':'rgba(255,255,255,.08)'}`,borderRadius:15,padding:'13px 14px',marginBottom:10}}>
        <div style={{fontSize:11,color:D.muted,fontWeight:800,marginBottom:5}}>📍 АЧИХ ЦЭГ</div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>{pickup?`${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}`:'Сонгоогүй байна'}</div>
        <input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Ойролцоох байр, орц, тайлбар (заавал биш)" style={{width:'100%',boxSizing:'border-box',background:'transparent',border:0,color:'white',outline:0,fontSize:14}}/>
      </div>

      <div style={{background:errors.to?'rgba(232,67,58,.08)':D.card,border:`1px solid ${errors.to?'rgba(232,67,58,.55)':'rgba(255,255,255,.08)'}`,borderRadius:15,padding:'13px 14px',marginBottom:12}}>
        <div style={{fontSize:11,color:D.muted,fontWeight:800,marginBottom:5}}>🔴 ХҮРГЭХ ГАЗАР</div>
        <input value={to} onChange={e=>{setTo(e.target.value);setErrors(p=>({...p,to:false}))}} placeholder="Хүрэх хаягаа бичнэ үү" style={{width:'100%',boxSizing:'border-box',background:'transparent',border:0,color:'white',outline:0,fontSize:15,fontWeight:650}}/>
      </div>

      <div style={{fontSize:11,color:D.muted,fontWeight:800,margin:'16px 0 8px'}}>МАШИНЫ ТӨРӨЛ</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginBottom:12}}>
        {[{id:'butten',label:'🚛 Бүтэн ачигч'},{id:'chiregch',label:'🔧 Чирэгч'}].map(x=><button key={x.id} onClick={()=>{setCarType(x.id);setErrors(p=>({...p,carType:false}))}} style={{padding:'14px 10px',borderRadius:14,border:`1px solid ${carType===x.id?'#e8433a':errors.carType?'rgba(232,67,58,.5)':'rgba(255,255,255,.08)'}`,background:carType===x.id?'rgba(232,67,58,.13)':D.card,color:'white',fontWeight:800}}>{x.label}</button>)}
      </div>

      <div style={{background:errors.carMark?'rgba(232,67,58,.08)':D.card,border:`1px solid ${errors.carMark?'rgba(232,67,58,.55)':'rgba(255,255,255,.08)'}`,borderRadius:15,padding:'13px 14px',marginBottom:14}}>
        <div style={{fontSize:11,color:D.muted,fontWeight:800,marginBottom:5}}>🚗 МАШИНЫ МАРК, НЭР</div>
        <input value={carMark} onChange={e=>{setCarMark(e.target.value);setErrors(p=>({...p,carMark:false}))}} placeholder="Жишээ: Toyota Camry" style={{width:'100%',boxSizing:'border-box',background:'transparent',border:0,color:'white',outline:0,fontSize:14}}/>
      </div>

      {error&&<div style={{padding:'11px 13px',borderRadius:12,background:'rgba(232,67,58,.1)',border:'1px solid rgba(232,67,58,.25)',color:'#ff8178',fontSize:13,marginBottom:12}}>⚠️ {error}</div>}
      <button onClick={handleSearch} disabled={loading} style={{width:'100%',padding:16,borderRadius:16,border:0,background:loading?'rgba(232,67,58,.45)':D.red,color:'white',fontSize:16,fontWeight:900}}>{loading?'Хайж байна...':'Ойр 8 жолооч хайх →'}</button>
    </div>
  </div>
}
