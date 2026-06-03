'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Offer = {
    id: string
    driver_name: string
    driver_phone: string
    car_type: string
    price: number
    driver_lat: number
    driver_lng: number
    driver_id: string
}

export default function DriversPage() {
    const [offers, setOffers] = useState<Offer[]>([])
    const [loading, setLoading] = useState(true)
    const [orderId, setOrderId] = useState<string | null>(null)
    const [fromAddress, setFromAddress] = useState('')
    const [toAddress, setToAddress] = useState('')
    const [userLat, setUserLat] = useState<number | null>(null)
    const [userLng, setUserLng] = useState<number | null>(null)
    const [accepting, setAccepting] = useState<string | null>(null)
    const [dots, setDots] = useState('.')
    const router = useRouter()

    const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        if (!lat1 || !lng1 || !lat2 || !lng2) return null
        const R = 6371
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLng = (lng2 - lng1) * Math.PI / 180
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2)
        return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
    }

    // Animated dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(d => d.length >= 3 ? '.' : d + '.')
        }, 500)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        const oid = localStorage.getItem('current_order_id')
        const from = localStorage.getItem('fromAddress') || localStorage.getItem('from') || ''
        const to = localStorage.getItem('dest') || ''
        setOrderId(oid)
        setFromAddress(from)
        setToAddress(to)

        navigator.geolocation.getCurrentPosition(
            (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude) },
            () => {}
        )

        if (!oid) return

        const fetchOffers = async () => {
            const { data } = await supabase
                .from('offers')
                .select()
                .eq('order_id', oid)
                .eq('status', 'pending')
                .order('price', { ascending: true })
            if (data) {
                setOffers(data)
                setLoading(false)
            }
        }

        fetchOffers()

        const channel = supabase
            .channel('offers-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'offers', filter: `order_id=eq.${oid}` }, () => {
                fetchOffers()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [])

    const acceptOffer = async (offer: Offer) => {
        if (!orderId) return
        setAccepting(offer.id)

        await supabase.from('orders').update({
            status: 'confirmed',
            driver_name: offer.driver_name,
            driver_phone: offer.driver_phone,
            driver_id: offer.driver_id,
        }).eq('id', orderId)

        await supabase.from('offers').update({ status: 'accepted' }).eq('id', offer.id)
        await supabase.from('offers').update({ status: 'declined' })
            .eq('order_id', orderId)
            .neq('id', offer.id)

        localStorage.setItem('tracking_driver_id', offer.driver_id || '')
        setAccepting(null)
        router.push('/tracking')
    }

    return (
        <div style={{minHeight:'100vh', background:'linear-gradient(160deg, #0a0a0f 0%, #1a0505 50%, #0a0a0f 100%)', display:'flex', flexDirection:'column'}}>

            {/* Header */}
            <div style={{padding:'16px 20px', display:'flex', alignItems:'center', gap:'12px', borderBottom:'1px solid rgba(232,67,58,0.1)', background:'rgba(10,0,0,0.5)'}}>
                <button onClick={() => router.back()} style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 14px', color:'rgba(255,255,255,0.6)', fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>← Буцах</button>
                <div style={{flex:1}}>
                    <p style={{color:'white', fontWeight:'700', fontSize:'15px', margin:0}}>Жолооч хайж байна</p>
                    <p style={{color:'rgba(255,255,255,0.35)', fontSize:'12px', margin:'2px 0 0'}}>{offers.length > 0 ? `${offers.length} жолооч санал явуулсан` : 'Санал хүлээж байна' + dots}</p>
                </div>
                {offers.length > 0 && (
                    <div style={{background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'20px', padding:'4px 12px'}}>
                        <span style={{color:'#ff6b5b', fontSize:'13px', fontWeight:'700'}}>{offers.length}</span>
                    </div>
                )}
            </div>

            {/* Захиалгын мэдээлэл */}
            <div style={{margin:'16px 16px 0', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'16px', padding:'14px 16px'}}>
                <div style={{display:'flex', alignItems:'flex-start', gap:'10px', marginBottom:'10px'}}>
                    <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', marginTop:'4px', flexShrink:0}}/>
                    <div>
                        <p style={{color:'rgba(255,255,255,0.35)', fontSize:'11px', margin:'0 0 2px', fontWeight:'600', letterSpacing:'0.5px'}}>АВАХ ГАЗАР</p>
                        <p style={{color:'rgba(255,255,255,0.75)', fontSize:'13px', margin:0, fontWeight:'500'}}>{fromAddress || 'GPS байршил'}</p>
                    </div>
                </div>
                <div style={{display:'flex', alignItems:'flex-start', gap:'10px'}}>
                    <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a', marginTop:'4px', flexShrink:0}}/>
                    <div>
                        <p style={{color:'rgba(255,255,255,0.35)', fontSize:'11px', margin:'0 0 2px', fontWeight:'600', letterSpacing:'0.5px'}}>ХҮРЭХ ГАЗАР</p>
                        <p style={{color:'rgba(255,255,255,0.75)', fontSize:'13px', margin:0, fontWeight:'500'}}>{toAddress || '-'}</p>
                    </div>
                </div>
            </div>

            {/* Offers */}
            <div style={{padding:'16px', flex:1}}>
                {loading || offers.length === 0 ? (
                    <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', paddingTop:'60px'}}>
                        {/* Animated truck */}
                        <div style={{fontSize:'64px', marginBottom:'20px', animation:'truckBounce 1s ease-in-out infinite'}}>🚛</div>
                        <div style={{display:'flex', gap:'6px', marginBottom:'16px'}}>
                            {[0,1,2].map(i => (
                                <div key={i} style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a', animation:`dotPulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>
                            ))}
                        </div>
                        <p style={{color:'white', fontWeight:'700', fontSize:'17px', margin:'0 0 8px'}}>Жолооч хайж байна{dots}</p>
                        <p style={{color:'rgba(255,255,255,0.35)', fontSize:'13px', margin:0, textAlign:'center'}}>Жолооч нар таны захиалгыг харж байна{'\n'}Санал ирэхэд автоматаар харагдана</p>
                    </div>
                ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                        {offers.map((o, idx) => {
                            const dist = getDistance(userLat!, userLng!, o.driver_lat, o.driver_lng)
                            return (
                                <div key={o.id} style={{
                                    background:'rgba(232,67,58,0.06)',
                                    border:'1px solid rgba(232,67,58,0.2)',
                                    borderRadius:'18px', padding:'16px',
                                    animation:'slideUp 0.3s ease forwards',
                                    animationDelay:`${idx*0.05}s`, opacity:0
                                }}>

                                    <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px'}}>
                                        <div style={{width:'46px', height:'46px', borderRadius:'50%', background:'#e8433a', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'18px', fontWeight:'800', flexShrink:0}}>
                                            {o.driver_name.charAt(0)}
                                        </div>
                                        <div style={{flex:1}}>
                                            <p style={{color:'white', fontWeight:'700', fontSize:'15px', margin:0}}>{o.driver_name}</p>
                                            <p style={{color:'rgba(255,255,255,0.4)', fontSize:'12px', margin:'3px 0 0'}}>🚛 {o.car_type}</p>
                                        </div>
                                        <div style={{textAlign:'right'}}>
                                            <p style={{color:'#ff6b5b', fontWeight:'800', fontSize:'18px', margin:0}}>₮{o.price.toLocaleString()}</p>
                                            {dist && <p style={{color:'rgba(59,130,246,0.8)', fontSize:'12px', margin:'3px 0 0'}}>📍 {dist} км</p>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => acceptOffer(o)}
                                        disabled={accepting === o.id}
                                        style={{
                                            width:'100%', borderRadius:'14px', padding:'14px',
                                            background: accepting === o.id ? 'rgba(232,67,58,0.4)' : '#e8433a',
                                            border:'none', color:'white', fontSize:'15px', fontWeight:'800',
                                            cursor: accepting === o.id ? 'not-allowed' : 'pointer',
                                            boxShadow: accepting === o.id ? 'none' : '0 4px 20px rgba(232,67,58,0.35)',
                                            transition:'all 0.2s', letterSpacing:'0.3px', animation: accepting === o.id ? 'none' : 'btnPulse 2s ease-in-out infinite'
                                        }}
                                    >
                                        {accepting === o.id ? 'Баталгаажуулж байна...' : '✅ Энэ жолоочийг сонгох'}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes truckBounce {
                    0%,100%{transform:translateY(0)}
                    50%{transform:translateY(-10px)}
                }
                @keyframes dotPulse {
                    0%,100%{transform:scale(1);opacity:0.4}
                    50%{transform:scale(1.4);opacity:1}
                }
                @keyframes btnPulse {
                    0%,100%{box-shadow:0 4px 20px rgba(232,67,58,0.35)}
                    50%{box-shadow:0 4px 35px rgba(232,67,58,0.7)}
                }
                @keyframes slideUp {
                    from{transform:translateY(20px);opacity:0}
                    to{transform:translateY(0);opacity:1}
                }
            `}</style>
        </div>
    )
}
