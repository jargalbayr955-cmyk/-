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

    useEffect(() => {
        const oid = localStorage.getItem('current_order_id')
        const from = localStorage.getItem('fromAddress') || ''
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
        const interval = setInterval(fetchOffers, 5000)
        return () => clearInterval(interval)
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

        // Save driver id for tracking
        localStorage.setItem('tracking_driver_id', offer.driver_id || '')

        setAccepting(null)
        router.push('/tracking')
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-sm mx-auto pt-8">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 text-sm mb-6">
                    â† Ð‘ÑƒÑ†Ð°Ñ…
                </button>

                <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
                    <div className="flex items-start gap-2 mb-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full mt-1 flex-shrink-0"></div>
                        <div>
                            <p className="text-xs text-gray-400">ÐÐ²Ð°Ñ… Ð³Ð°Ð·Ð°Ñ€</p>
                            <p className="text-sm font-medium text-gray-700">{fromAddress || 'GPS Ð±Ð°Ð¹Ñ€ÑˆÐ¸Ð»'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full mt-1 flex-shrink-0"></div>
                        <div>
                            <p className="text-xs text-gray-400">Ð¥Ò¯Ñ€Ð³ÑÑ… Ð³Ð°Ð·Ð°Ñ€</p>
                            <p className="text-sm font-medium text-gray-700">{toAddress || '-'}</p>
                        </div>
                    </div>
                </div>

                {offers.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-5xl mb-4">ðŸš›</div>
                        <h2 className="text-lg font-medium mb-2">Ð–Ð¾Ð»Ð¾Ð¾Ñ‡ Ñ…Ð°Ð¹Ð¶ Ð±Ð°Ð¹Ð½Ð°...</h2>
                        <p className="text-gray-400 text-sm">Ð–Ð¾Ð»Ð¾Ð¾Ñ‡ Ð½Ð°Ñ€ Ñ‚Ð°Ð½Ñ‹ Ð·Ð°Ñ…Ð¸Ð°Ð»Ð³Ñ‹Ð³ Ñ…Ð°Ñ€Ð¶ Ð±Ð°Ð¹Ð½Ð°</p>
                        <p className="text-gray-300 text-xs mt-2">5 ÑÐµÐºÑƒÐ½Ð´ Ñ‚ÑƒÑ‚Ð°Ð¼Ð´ ÑˆÐ¸Ð½ÑÑ‡Ð»ÑÐ³Ð´ÑÐ½Ñ</p>
                        <div className="mt-6 flex justify-center">
                            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    </div>
                ) : (
                    <div>
                        <h2 className="text-lg font-medium mb-1">Ð–Ð¾Ð»Ð¾Ð¾Ñ‡Ð¸Ð¹Ð½ ÑÐ°Ð½Ð°Ð»ÑƒÑƒÐ´</h2>
                        <p className="text-gray-400 text-sm mb-4">{offers.length} Ð¶Ð¾Ð»Ð¾Ð¾Ñ‡ ÑÐ°Ð½Ð°Ð» ÑÐ²ÑƒÑƒÐ»ÑÐ°Ð½</p>
                        <div className="space-y-3">
                            {offers.map((o) => {
                                const dist = getDistance(userLat!, userLng!, o.driver_lat, o.driver_lng)
                                return (
                                    <div key={o.id} className="bg-white border-2 rounded-2xl p-4" style={{ borderColor: '#e8433a' }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                                {o.driver_name.charAt(0)}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">{o.driver_name}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">ðŸš› {o.car_type}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-red-500 font-medium text-sm">â‚®{o.price.toLocaleString()}</p>
                                                {dist && <p className="text-xs text-blue-500 mt-0.5">ðŸ“ {dist} ÐºÐ¼</p>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => acceptOffer(o)}
                                            disabled={accepting === o.id}
                                            className="w-full rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-50"
                                            style={{background:'#e8433a'}}
                                        >
                                            {accepting === o.id ? 'Ð‘Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°Ð¶ÑƒÑƒÐ»Ð¶ Ð±Ð°Ð¹Ð½Ð°...' : 'âœ… Ð­Ð½Ñ Ð¶Ð¾Ð»Ð¾Ð¾Ñ‡Ð¸Ð¹Ð³ ÑÐ¾Ð½Ð³Ð¾Ñ…'}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

