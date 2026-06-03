'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ManualPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [carType, setCarType] = useState('')
  const router = useRouter()

  const handleSearch = async () => {
    if (!from || !to || !carType) return
    localStorage.setItem('fromAddress', from)
    localStorage.setItem('from', from)
    localStorage.setItem('dest', to)
    localStorage.setItem('carType', carType)
    localStorage.setItem('fromType', 'manual')

    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const { data: orderData } = await supabase.from('orders').insert({
      from_address: from,
      to_address: to,
      car_type: carType,
      status: 'pending',
      user_phone: user.phone || ''
    }).select().single()

    if (orderData) localStorage.setItem('current_order_id', orderData.id)

    router.push('/drivers')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 text-sm mb-6">
          ← Буцах
        </button>

        <h2 className="text-lg font-medium mb-6">Мэдээлэл оруулах</h2>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Хаанаас</p>
          <input
            type="text"
            placeholder="Авах хаяг бичнэ үү..."
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="w-full text-sm outline-none text-gray-700 placeholder-gray-300"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Хаана очих</p>
          <input
            type="text"
            placeholder="Хүргэх хаяг бичнэ үү..."
            value={to}
            onChange={e => setTo(e.target.value)}
            className="w-full text-sm outline-none text-gray-700 placeholder-gray-300"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Ямар машин</p>
          <input
            type="text"
            placeholder="Тавцан, чирэгч..."
            value={carType}
            onChange={e => setCarType(e.target.value)}
            className="w-full text-sm outline-none text-gray-700 placeholder-gray-300"
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={!from || !to || !carType}
          className="w-full bg-red-500 text-white rounded-xl py-3 font-medium text-sm disabled:opacity-40"
        >
          Машин хайх
        </button>
      </div>
    </div>
  )
}