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
}

export default function DriversPage() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const router = useRouter()

  useEffect(() => {
    const oid = localStorage.getItem('current_order_id')
    const from = localStorage.getItem('fromAddress') || ''
    const to = localStorage.getItem('dest') || ''
    setOrderId(oid)
    setFromAddress(from)
    setToAddress(to)

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

  const callDriver = (phone: string) => {
    window.location.href = 'tel:' + phone
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 text-sm mb-6">
          ← Буцах
        </button>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-2 mb-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full mt-1 flex-shrink-0"></div>
            <div>
              <p className="text-xs text-gray-400">Авах газар</p>
              <p className="text-sm font-medium text-gray-700">{fromAddress || 'GPS байршил'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full mt-1 flex-shrink-0"></div>
            <div>
              <p className="text-xs text-gray-400">Хүргэх газар</p>
              <p className="text-sm font-medium text-gray-700">{toAddress || '-'}</p>
            </div>
          </div>
        </div>

        {offers.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🚛</div>
            <h2 className="text-lg font-medium mb-2">Жолооч хайж байна...</h2>
            <p className="text-gray-400 text-sm">Жолооч нар таны захиалгыг харж байна</p>
            <p className="text-gray-300 text-xs mt-2">5 секунд тутамд шинэчлэгдэнэ</p>
            <div className="mt-6 flex justify-center">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-medium mb-1">Жолоочийн саналууд</h2>
            <p className="text-gray-400 text-sm mb-4">{offers.length} жолооч санал явуулсан</p>
            <div className="space-y-3">
              {offers.map((o) => (
                <div key={o.id} className="bg-white border-2 rounded-2xl p-4 flex items-center gap-3" style={{borderColor:'#e8433a'}}>
                  <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {o.driver_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{o.driver_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">🚛 {o.car_type}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-red-500 font-medium text-sm">₮