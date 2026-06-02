'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CurrentPage() {
  const [dest, setDest] = useState('')
  const router = useRouter()

  const handleSearch = () => {
    if (!dest) return
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
          <p className="text-sm font-medium pl-5">Одоогийн байршил (GPS)</p>
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
          disabled={!dest}
          className="w-full bg-red-500 text-white rounded-xl py-3 font-medium text-sm disabled:opacity-40"
        >
          Машин хайх
        </button>
      </div>
    </div>
  )
}