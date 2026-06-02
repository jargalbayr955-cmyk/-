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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 text-sm mb-6">
          ← Буцах
        </button>

        <h2 className="text-lg font-medium mb-1">Хүрэх газраа тодорхойлно уу</h2>
        <p className="text-gray-400 text-xs mb-6">Таны одоогийн байршил тогтоогдлоо 📍</p>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-400">Таны байршил</span>
          </div>
          <p className="text-sm font-medium pl-5 text-gray-700">{address}</p>
          {location && (
            <p className="text-xs text-gray-300 pl-5 mt-1">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p>
          )}
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