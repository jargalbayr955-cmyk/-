'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CurrentPage() {
  const [dest, setDest] = useState('')
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [address, setAddress] = useState('Байршил тогтоож байна...')
  const router = useRouter()

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setLocation({ lat, lng })
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
            )
            const data = await res.json()
            const addr = data.display_name?.split(',').slice(0, 3).join(',') || 'Байршил тогтоогдлоо'
            setAddress(addr)
          } catch {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
          }
        },
        () => setAddress('Байршил тогтоох боломжгүй')
      )
    }
  }, [])

  const handleSearch = () => {
    if (!dest) return
    if (location) {
      localStorage.setItem('fromLat', location.lat.toString())
      localStorage.setItem('fromLng', location.lng.toString())
    }
    localStorage.setItem('fromAddress', address)
    localStorage.setItem('dest', dest)
    localStorage.setItem('fromType', 'current')
    router.push('/drivers')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="relative">
        {location ? (
          <iframe
            width="100%"
            height="220"
            style={{border: 0}}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng-0.005},${location.lat-0.005},${location.lng+0.005},${location.lat+0.005}&layer=mapnik&marker=${location.lat},${location.lng}`}
          />
        ) : (
          <div className="w-full h-56 bg-gray-200 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Газрын зураг ачааллаж байна...</p>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <button onClick={() => router.back()} className="bg-white rounded-full px-3 py-1.5 text-sm text-gray-600 shadow-sm">
            ← Буцах
          </button>
        </div>
      </div>

      <div className="p-4 max-w-sm mx-auto">
        <h2 className="text-lg font-medium mb-1">Хүрэх газраа тодорхойлно уу</h2>
        <p className="text-gray-400 text-xs mb-4">Таны одоогийн байршил тогтоогдлоо 📍</p>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-400">Таны байршил</span>
          </div>
          <p className="text-sm font-medium pl-5 text-gray-700">{address}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-xs text-gray-400">Хүрэх газар</span>
          </div>
          <input
            type="text"
            placeholder="Хаяг бичнэ үү..."
            value={dest}
            onChange={e => setDest(e.target.value)}
            className="w-full pl-5 text-sm outline-none text-gray-700 placeholder-gray-300"
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={!dest || !location}
          className="w-full bg-red-500 text-white rounded-xl py-3 font-medium text-sm disabled:opacity-40"
        >
          {!location ? 'Байршил тогтоож байна...' : 'Машин хайх'}
        </button>
      </div>
    </div>
  )
}