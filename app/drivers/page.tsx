'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Driver = {
  id: string
  name: string
  phone: string
  car_type: string
  price: number
  rating: number
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchDrivers = async () => {
      const { data } = await supabase
        .from('drivers')
        .select()
        .eq('available', true)
        .limit(8)
      if (data) setDrivers(data)
      setLoading(false)
    }
    fetchDrivers()
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
        <h2 className="text-lg font-medium mb-1">Ойр байгаа машинууд</h2>
        <p className="text-gray-400 text-sm mb-6">Таалагдсан үнэ рүү шууд залгаарай</p>
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-12">Хайж байна...</p>
        ) : drivers.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">Одоогоор машин олдсонгүй</p>
        ) : (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                  {d.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{d.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">⭐ {d.rating}</span>
                    <span className="text-xs text-gray-400">🚛 {d.car_type}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-red-500 font-medium text-sm">₮{d.price.toLocaleString()}</p>
                  <button
                    onClick={() => callDriver(d.phone)}
                    className="bg-red-500 text-white text-xs rounded-lg px-3 py-1.5"
                  >
                    📞 Залгах
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}