'use client'

import { useState } from 'react'
import { SessionGate } from '../components/session-gate'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router=useRouter()
  const [phone,setPhone]=useState('')
  const [pin,setPin]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const login=async()=>{
    if(loading)return
    if(!/^\d{8}$/.test(phone))return setError('8 оронтой утасны дугаар оруулна уу')
    if(!/^\d{4,8}$/.test(pin))return setError('4-8 оронтой PIN оруулна уу')
    setLoading(true);setError('')
    try{
      const res=await fetch('/api/customer/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,pin})})
      const body=await res.json().catch(()=>({}))
      if(!res.ok)return setError(body.error||'Нэвтрэхэд алдаа гарлаа')
      router.replace('/home')
    }catch{setError('Сүлжээний алдаа. Дахин оролдоно уу.')}finally{setLoading(false)}
  }

  return <SessionGate mode="guest"><main style={{minHeight:'100dvh',background:'radial-gradient(circle at 50% 0,#321313 0,#0a0a0f 38%,#060608 100%)',color:'white',display:'grid',placeItems:'center',padding:20}}>
    <section style={{width:'min(460px,100%)',background:'rgba(14,16,21,.92)',border:'1px solid rgba(255,255,255,.09)',borderRadius:26,padding:'28px 22px',boxShadow:'0 28px 70px rgba(0,0,0,.42)'}}>
      <div style={{width:58,height:58,borderRadius:18,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#ef473d,#d92f27)',fontSize:28,marginBottom:18}}>🚛</div>
      <div style={{fontSize:11,fontWeight:900,letterSpacing:2,color:'#ff8178',marginBottom:7}}>АЧИЛТ АПП</div>
      <h1 style={{margin:'0 0 7px',fontSize:31,lineHeight:1,fontWeight:950}}>Нэвтрэх</h1>
      <p style={{margin:'0 0 24px',fontSize:13,lineHeight:1.55,color:'rgba(255,255,255,.48)'}}>Бүртгэлтэй дугаар, PIN-ээрээ аль ч утаснаас нэвтэрнэ. Энэ төхөөрөмж дээр нэвтрэлт хадгалагдана.</p>

      <label htmlFor="phone" style={{display:'block',fontSize:11,fontWeight:850,color:'rgba(255,255,255,.48)',marginBottom:7}}>УТАСНЫ ДУГААР</label>
      <div style={{display:'flex',gap:9,marginBottom:13}}>
        <div style={{padding:'0 13px',borderRadius:14,background:'rgba(255,255,255,.055)',border:'1px solid rgba(255,255,255,.09)',display:'grid',placeItems:'center',fontWeight:800,color:'rgba(255,255,255,.66)'}}>+976</div>
        <input id="phone" name="phone" type="tel" inputMode="numeric" autoComplete="username" value={phone} onChange={e=>{setPhone(e.target.value.replace(/\D/g,'').replace(/^976(?=\d{8}$)/,'').slice(0,8));setError('')}} placeholder="8 оронтой дугаар" style={{flex:1,minWidth:0,padding:'14px 15px',borderRadius:14,border:'1px solid rgba(255,255,255,.09)',background:'rgba(255,255,255,.055)',color:'white',fontSize:16,fontWeight:800,letterSpacing:1.7,outline:0}}/>
      </div>

      <label htmlFor="pin" style={{display:'block',fontSize:11,fontWeight:850,color:'rgba(255,255,255,.48)',marginBottom:7}}>PIN КОД</label>
      <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,8));setError('')}} placeholder="4-8 оронтой PIN" onKeyDown={e=>{if(e.key==='Enter')void login()}} style={{width:'100%',boxSizing:'border-box',padding:'14px 15px',borderRadius:14,border:'1px solid rgba(255,255,255,.09)',background:'rgba(255,255,255,.055)',color:'white',fontSize:16,fontWeight:850,letterSpacing:4,outline:0,marginBottom:13}}/>

      {error&&<div style={{padding:'10px 12px',borderRadius:12,border:'1px solid rgba(232,67,58,.3)',background:'rgba(232,67,58,.1)',color:'#ff8178',fontSize:13,marginBottom:12}}>⚠️ {error}</div>}
      <button type="button" onClick={()=>void login()} disabled={loading} style={{width:'100%',minHeight:54,border:0,borderRadius:16,background:loading?'rgba(232,67,58,.45)':'linear-gradient(135deg,#ef473d,#d92f27)',color:'white',fontSize:16,fontWeight:950,boxShadow:loading?'none':'0 14px 30px rgba(219,49,41,.25)'}}>{loading?'Нэвтэрч байна...':'Нэвтрэх →'}</button>
      <p style={{textAlign:'center',fontSize:13,color:'rgba(255,255,255,.4)',margin:'20px 0 0'}}>Шинэ хэрэглэгч үү? <button type="button" onClick={()=>router.push('/register')} style={{border:0,background:'transparent',color:'#ff8178',fontWeight:850,cursor:'pointer'}}>Бүртгүүлэх</button></p>
    </section>
  </main></SessionGate>
}
